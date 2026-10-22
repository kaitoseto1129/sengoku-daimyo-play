import { sightUnit } from "./battle_sight.js";
import { groundAt } from "./floors.js";
import { clearFoot } from "./cover_guide.js";
import { localClear } from "./army_local_way.js";
import { VIEW } from "./viewport.js";
import { retreatRequired, guidanceEnded, $, singleBattleGuide, setClass } from "./hud_common.js";
import { navigationEnemy } from "./mission_guide.js";
import { rainDanger } from "./arrow_rain.js";
import { S } from "./settings.js";
import { isTouch } from "./touch.js";

export class HudNavigation {


  // 戦ごとの退き先を優先し、ない時は敵から離れた仲間の後ろを半秒ごとに探す。
  retreatDestination(rt, enemy, treatment = false) {
    // 手当ての陰と通常の退き先を交互に探す戦では、それぞれの印を保つ。
    // 一つの印を共有すると、陰がないたびに退き先が足元から選び直される。
    if (rt.def.separateTreatmentRetreat) {
      let search = this.retreatSearch;
      if (search?.rt !== rt) search = this.retreatSearch = {
        rt, treatment: { cue: null, scanAt: 0 }, retreat: { cue: null, scanAt: 0 },
      };
      if (this.retreatGuide && (search.treatment.cue === this.retreatGuide || search.retreat.cue === this.retreatGuide)) {
        const previous = this.retreatGuide.treatment ? search.treatment : search.retreat;
        previous.scanAt = this.retreatScanAt;
      }
      const next = treatment ? search.treatment : search.retreat;
      this.retreatGuide = next.cue || (next.cue = { x: 0, z: 0, radius: 3, active: false, valid: false });
      this.retreatScanAt = next.scanAt;
    }
    const cue = this.retreatGuide || (this.retreatGuide = { x: 0, z: 0, radius: 3, active: false, valid: false, ally: null });
    cue.active = true;
    cue.enemy = enemy;
    if (cue.treatment !== treatment) { cue.valid = false; this.retreatScanAt = 0; }
    cue.treatment = treatment; cue.radius = treatment ? .9 : 3;
    const guide = rt.missionGuide, p = rt.player.u.pos;
    if (!treatment && guide?.marker?.guideArea === 'retreat') {
      cue.x = guide.pos.x; cue.z = guide.pos.z; cue.y = guide.pos.y; cue.radius = guide.marker.guideRadius || 3; cue.valid = true;
      if (rt.t >= this.retreatScanAt) {
        this.retreatScanAt = rt.t + .5; cue.ally = guide.marker.guideAlly?.() || null;
        let best = cue.ally?.alive ? 0 : 12;
        for (const a of rt.army.units) {
          if (a === rt.player.u || !a.alive || a.gone || a.fleeing || a.woundOut || a.noTarget || a.civ || a.isStruct || a.team !== rt.player.u.team) continue;
          const d = Math.hypot(a.pos.x - cue.x, a.pos.z - cue.z);
          if (d < best && sightUnit(rt, a)) { best = d; cue.ally = a; }
        }
      }
      return cue;
    }
    cue.y = undefined;
    if (rt.t < this.retreatScanAt) return cue.valid ? cue : null;
    this.retreatScanAt = rt.t + .5;
    const point = this.retreatPoint || (this.retreatPoint = { x: 0, y: 0, z: 0 });
    const safe = (x, z) => {
      point.x = x; point.z = z;
      if (rt.def.retreatPathAllowed && !rt.def.retreatPathAllowed(rt, point)) return false;
      if (rt.def.retreatPointAllowed && !rt.def.retreatPointAllowed(rt, point)) return false;
      if (!treatment) for (const u of rt.army.units) {
        if (u !== rt.player.u && u.alive && !u.gone && !u.isStruct && Math.abs(u.pos.y - p.y) < 3 &&
          Math.hypot(x - u.pos.x, z - u.pos.z) < (u.mounted ? 3 : 2)) return false;
      }
      if (treatment) {
        point.x = x; point.z = z; point.y = rt.def.retreatGroundAt?.(rt, x, z, p.y) ?? rt.world.heightAt(x, z);
        if (!rt.player.treatmentShelter(point)) return false;
      }
      for (const u of rt.army.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget && !u.civ && !u.isStruct &&
        u.team !== rt.player.u.team && Math.hypot(x - u.pos.x, z - u.pos.z) < 6) return false;
      const length = Math.hypot(x - p.x, z - p.z), steps = Math.max(1, Math.ceil(length / 2));
      for (let i = 1; i <= steps; i++) {
        point.x = p.x + (x - p.x) * i / steps; point.z = p.z + (z - p.z) * i / steps;
        point.y = rt.def.retreatGroundAt?.(rt, point.x, point.z, p.y) ?? rt.world.heightAt(point.x, point.z);
        if (rt.def.retreatPointAllowed && !rt.def.retreatPointAllowed(rt, point)) return false;
        if (!rt.world.walkable(point.x, point.z, point.y) || Math.abs(point.y - p.y) > length * i / steps * .5 + .5 || rt.army.wallBetween(p, -1, point)) return false;
      }
      return true;
    };
    // 安全な行き先は保つ。歩くたびに旗が足元へ移らないようにする。
    if (cue.valid && (!cue.house || !cue.house.burnt) && (!cue.ally || cue.ally.alive && !cue.ally.gone && !cue.ally.fleeing && sightUnit(rt, cue.ally)) && Math.hypot(cue.x - p.x, cue.z - p.z) < 28 && safe(cue.x, cue.z) &&
        (treatment || Math.hypot(cue.x - p.x, cue.z - p.z) < cue.radius || this.clearDestinationFloor(rt, cue.x, cue.z))) return cue;
    cue.house = null;
    // 既に味方の陰なら、動かず止まる場所を足元に示す。
    if (treatment && rt.player.treatmentShelter(p)) {
      if (!cue.valid || Math.hypot(cue.x - p.x, cue.z - p.z) >= cue.radius || !safe(cue.x, cue.z)) {
        cue.x = p.x; cue.z = p.z;
      }
      cue.valid = true; return cue;
    }
    cue.valid = false; cue.ally = null;
    let best = Infinity;
    // 家の候補がある戦も、実際に手当てでき、歩いて届く場所だけを案内する。
    if (treatment) for (const house of rt.def.treatmentHouses?.(rt) || []) {
      const q = house.approach;
      if (house.burnt || !q) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d > 28 || d >= best || !safe(q.x, q.z)) continue;
      point.x = q.x; point.z = q.z; point.y = groundAt(rt.world, q.x, q.z, p.y);
      if (!clearFoot(rt, point) || !localClear(rt.army, p, point)) continue;
      best = d; cue.x = q.x; cue.z = q.z; cue.valid = true; cue.house = house;
    }
    if (cue.valid) return cue;
    for (const a of rt.army.units) {
      if (a === rt.player.u || !a.alive || a.gone || a.fleeing || a.woundOut || a.noTarget || a.civ || a.isStruct || a.team !== rt.player.u.team ||
          treatment && (a.farSim || a.rearWound || a.downed || a.group?.hidden || a.group?.routed || a.stagger > 0 || a.hp < a.maxHp * .35 || a.type === 'dummy' || a.type === 'porter')) continue;
      if (Math.hypot(a.pos.x - p.x, a.pos.z - p.z) > 32 || !sightUnit(rt, a)) continue;
      let foe = enemy;
      if (treatment) {
        let nearest = 45 * 45;
        for (const o of rt.army.units) {
          if (!o.alive || o.team === a.team || o.fleeing || o.civ || o.noTarget || o.isStruct || o.type === 'dummy' || o.type === 'porter') continue;
          const d = (o.pos.x - a.pos.x) ** 2 + (o.pos.z - a.pos.z) ** 2;
          if (d < nearest) { nearest = d; foe = o; }
        }
      }
      const dx = foe ? a.pos.x - foe.pos.x : -Math.sin(rt.player.yaw);
      const dz = foe ? a.pos.z - foe.pos.z : -Math.cos(rt.player.yaw);
      const length = Math.hypot(dx, dz) || 1, x = a.pos.x + dx / length * 4, z = a.pos.z + dz / length * 4;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d > 28 || !treatment && enemy && Math.hypot(x - enemy.pos.x, z - enemy.pos.z) < Math.hypot(p.x - enemy.pos.x, p.z - enemy.pos.z) + 2 || !safe(x, z)) continue;
      const score = d + (!treatment && !this.clearDestinationFloor(rt, x, z) ? 1000 : 0);
      if (score >= best) continue;
      best = score; cue.x = x; cue.z = z; cue.valid = true; cue.ally = a;
    }
    // 仲間が近くにいない時も、歩けて敵から離れる床を半秒ごとに探す。
    if ((!cue.valid || best >= 1000) && !treatment) {
      let foe = enemy, nearest = Infinity;
      if (!foe) for (const u of rt.army.units) {
        if (!u.alive || u.gone || u.team === rt.player.u.team || u.fleeing || u.noTarget || u.civ || u.isStruct || !sightUnit(rt, u)) continue;
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d < nearest) { nearest = d; foe = u; }
      }
      const away = foe ? Math.atan2(p.x - foe.pos.x, p.z - foe.pos.z) : rt.player.yaw + Math.PI;
      let score = -Infinity;
      for (let i = 0; i < 24; i++) {
        const angle = away + (i % 8) * Math.PI / 4, distance = 6 + Math.floor(i / 8) * 3;
        const x = p.x + Math.sin(angle) * distance, z = p.z + Math.cos(angle) * distance;
        point.x = x; point.z = z; point.y = groundAt(rt.world, x, z, p.y);
        if (!clearFoot(rt, point) || !localClear(rt.army, p, point) || !safe(x, z)) continue;
        const clearance = foe ? Math.hypot(x - foe.pos.x, z - foe.pos.z) - Math.hypot(p.x - foe.pos.x, p.z - foe.pos.z) : distance;
        const rank = clearance - distance * .2 + (this.clearDestinationFloor(rt, x, z) ? 1000 : 0);
        if (clearance < 2 || rank <= score || cue.valid && best >= 1000 && rank < 1000) continue;
        score = rank; cue.x = x; cue.z = z; cue.y = point.y; cue.valid = true; cue.ally = null;
      }
    }
    return cue.valid ? cue : null;
  }


  // 床の印と矢印が兵や札に重ならない地点を選ぶ。兵の投影は共通の記録を使う。
  clearDestinationFloor(rt, x, z) {
    const point = this.destinationFloorPoint || (this.destinationFloorPoint = { x:0, y:0, z:0 });
    point.x = x; point.z = z; point.y = groundAt(rt.world, x, z, rt.player.u.pos.y);
    const screen = this.project(point, point.y + .1, rt,
      this.destinationFloorProjection || (this.destinationFloorProjection = {}));
    if (screen.behind || screen.x < 64 || screen.x > VIEW.w - 64 || screen.y < 132 || screen.y > VIEW.h - 64) return false;
    const bodies = this.goalBodyRects(rt), sx = screen.x, sy = screen.y;
    for (let i = 0; i < this.goalBodyCount; i += 4) {
      if (sx + 48 > bodies[i] && sx - 48 < bodies[i + 2] && sy + 22 > bodies[i + 1] && sy - 64 < bodies[i + 3]) return false;
    }
    for (const r of this.hudRects()) {
      if (r === this.guideOrderRect) continue;
      if (sx + 48 > r.left && sx - 48 < r.right && sy + 22 > r.top && sy - 64 < r.bottom) return false;
    }
    return this.floorGoalVisible(rt, point);
  }


  // 入口と持ち場の枠。戦ごとの座標を読み、札を増やさず実際の場所へ重ねる。
  drawPlaceFrame(g, rt, doorwayFrame = null) {
    this.placeFrameShown = false;
    if (retreatRequired(rt) || this.retreatGuide?.active && this.retreatGuide.valid) return false;
    const guardFrame = !doorwayFrame && rt.def.guardPlaceFrame?.(rt);
    // 守る持ち場と、道案内を優先する戸口は、近くに敵がいても枠を残す。
    if (!guardFrame && !(doorwayFrame && rt.def.routeGuidePriority?.(rt)) &&
        (this.defendEnemy?.alive || rt.guideEnemyShown && rt.guideEnemy?.alive || this.attackGuideEnemy?.alive)) return false;
    if ((!doorwayFrame && rt.def.routeDestinationSight) || !guardFrame && navigationEnemy(rt) && !rt.def.routeGuidePriority?.(rt)) return false;
    if (!guardFrame && this.defendEnemy && !rt.def.routeGuidePriority?.(rt) || rainDanger(rt.army) || S.reduceGuidance || guidanceEnded(rt) || this.openingActive || rt.choice || rt.player.camShot || this.bigmap || rt.dodgeGuide) return false;
    const frame = doorwayFrame || guardFrame || rt.def.placeFrame?.(rt);
    if (!frame) return false;
    if (doorwayFrame) return this.drawDoorwayFrame(g, rt, frame);
    const W = VIEW.w, H = VIEW.h;
    // 通り口を一つの矢印で示す戦では、枠・輪・道筋を重ねない。
    if (!doorwayFrame && !guardFrame && rt.def.singlePassageArrow) {
      const goal = this.passageGoal || (this.passageGoal = { x: 0, y: 0, z: 0 });
      goal.x = (frame[2].x + frame[3].x) / 2;
      goal.y = (frame[2].y + frame[3].y) / 2;
      goal.z = (frame[2].z + frame[3].z) / 2;
      const sign = this.project(goal, goal.y, rt);
      if (sign.behind || sign.x < 32 || sign.x > W - 32 || sign.y < 136 || sign.y > H - 24) return false;
      this.drawNavigationArrow(g, sign.x, sign.y, Math.PI / 2, 1.1, true);
      this.placeFrameShown = true;
      return true;
    }
    // 入口の四隅をそのまま投影する。画面端でも入口の形を残す。
    const points = this.placeFramePoints || (this.placeFramePoints = new Float32Array(8));
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < 4; i++) {
      const p = frame[i];
      this.tmpV.set(p.x, p.y, p.z).project(rt.camera);
      if (this.tmpV.z < -1 || this.tmpV.z > 1) return false;
      const x = (this.tmpV.x * .5 + .5) * W, y = (-this.tmpV.y * .5 + .5) * H;
      points[i * 2] = x; points[i * 2 + 1] = y;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (right < 12 || left > W - 12 || bottom < 64 || top > H - 24 ||
        (right - left) * (bottom - top) > W * H / 3) return false;
    g.save(); g.beginPath(); g.rect(12, 64, W - 24, H - 88); g.clip();
    // 入口の中心を保つ。戸口の輪も小さく収め、兵と床を見せる。
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    const scale = guardFrame ? 1 : Math.min(1, 72 / Math.max(1, right - left), 64 / Math.max(1, bottom - top));
    g.lineJoin = 'round'; g.beginPath();
    for (let i = 0; i < 4; i++) {
      const x = cx + (points[i * 2] - cx) * scale, y = cy + (points[i * 2 + 1] - cy) * scale;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    // 戸口の中は塗らず、先の兵と床を見通せるようにする。
    g.strokeStyle = '#14120f'; g.lineWidth = guardFrame ? 10 : 5; g.stroke();
    g.strokeStyle = guardFrame ? '#ffffff' : '#fff3ba'; g.lineWidth = guardFrame ? 5 : 2; g.stroke();
    if (guardFrame) { g.restore(); return true; }
    // 口の床を大きな矢印と輪で示し、手前の短い道筋だけを添える。
    const goal = this.placeFrameGoal || (this.placeFrameGoal = { x:0, y:0, z:0 });
    goal.x = (frame[2].x + frame[3].x) / 2;
    goal.y = (frame[2].y + frame[3].y) / 2;
    goal.z = (frame[2].z + frame[3].z) / 2;
    const p = rt.player.u.pos, distance = Math.hypot(goal.x - p.x, goal.z - p.z);
    if (distance > 2) {
      const path = this.placeFramePath || (this.placeFramePath = [{ x:0, z:0 }, { x:0, z:0 }]);
      const length = Math.min(10, distance);
      path[0].x = goal.x + (p.x - goal.x) * length / distance;
      path[0].z = goal.z + (p.z - goal.z) * length / distance;
      path[1].x = goal.x; path[1].z = goal.z;
      this.drawRoutePath(g, rt, path);
    }
    this.drawTargetFootRing(g, rt, goal, 1.25);
    this.drawNavigationArrow(g, (points[4] + points[6]) / 2, (points[5] + points[7]) / 2, Math.PI / 2, 1.15);
    this.placeFrameShown = true;
    g.restore(); return true;
  }


  // 行き先のそばだけ短い線を残し、札から戦場を横切らない。
  drawGuideLink(g, x, y, left, top, right, bottom, connected = false, full = false) {
    // 左欄へ戻した任務に、以前の固定位置へ向かう線だけを残さない。
    if (!connected && isTouch && VIEW.w >= 601 && VIEW.h <= 500 && this.rt?.def.sideTaskLabel && $('objectives').classList.contains('ground-order')) return;
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    const dx = x - cx, dy = y - cy, length = Math.hypot(dx, dy);
    if (length < 1 || x >= left - 8 && x <= right + 8 && y >= top - 8 && y <= bottom + 8) return;
    const t = Math.min((right - left) / 2 / Math.max(.001, Math.abs(dx)), (bottom - top) / 2 / Math.max(.001, Math.abs(dy)));
    const ux = dx / length, uy = dy / length;
    // 札が離れていても行き先の直前だけ示す。長い斜線で兵や槍を横切らない。
    // 戦ごとの短い指定は保ち、札の移動で線が伸び縮みする幅も抑える。
    const stem = full ? Math.max(14, length * (1 - t)) : Math.min(32, this.rt?.def.guideLinkLength ?? 32,
      Math.max(14, length * (1 - t) - (connected ? 6 : 0)));
    g.save(); g.globalAlpha *= .9; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x - ux * stem, y - uy * stem); g.lineTo(x - ux * 14, y - uy * 14);
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 2; g.stroke();
    // 矢じりは中を塗らず、指す先と明暗の縁だけ残す。
    g.beginPath(); g.moveTo(x - ux * 12 - uy * 6, y - uy * 12 + ux * 6); g.lineTo(x, y);
    g.lineTo(x - ux * 12 + uy * 6, y - uy * 12 - ux * 6);
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 2; g.stroke(); g.restore();
  }


  // 小さな線描と生成りの色を合わせる。兵や地形を塗りつぶさず、暗い縁で水面でも読める。
  drawGoalArrow(g, x, y) {
    this.drawNavigationArrow(g, x, y, Math.PI / 2, .65, true);
  }


  // 移動と到着に同じ太い矢印を使う。先端が指す一点は動かさない。
  drawNavigationArrow(g, x, y, angle = Math.PI / 2, scale = 1, atFoot = false, doorway = false) {
    if (this.rt?.touchSwipeActive && !atFoot && !this.rt.missionGuide?.marker) return;
    // 近い視点で、矢印が本人の頭や体に重なる時は描かない（頭を指す矢印に見える）。
    // 向き直し中は今の横なぞりだけを見せ、別方向の矢印を足さない。
    if (isTouch && (this.rt?.dodgeGuide?.gestureShown || $('objectives').classList.contains('facing-order'))) return;
    const rt = this.rt, me = rt?.player?.u?.pos;
    if (rt && singleBattleGuide(rt) && !this.openingActive && !doorway) {
      this.drawSmallGoalFlag(g, x, y, .5, false, false, '');
      return;
    }
    if (!atFoot && me && rt.camera.position.distanceTo(me) < 4.5) {
      const v = this.navArrowV || (this.navArrowV = this.tmpV.clone());
      v.set(me.x, me.y + 1.75, me.z).project(rt.camera);
      const hx = (v.x * .5 + .5) * VIEW.w, hy = (-v.y * .5 + .5) * VIEW.h;
      v.set(me.x, me.y, me.z).project(rt.camera);
      const fy = (-v.y * .5 + .5) * VIEW.h;
      if (Math.abs(x - hx) < 48 && y > hy - 45 && y < fy) return;
    }
    g.save(); g.translate(x, y); g.rotate(angle - Math.PI / 2);
    // 案内は押すボタンではない。小型指定の倍率を保ち、兵より大きく拡大しない。
    const size = rt?.def.compactTravelArrow && !doorway ? Math.min(.65, scale) : scale;
    g.scale(size, size);
    g.lineJoin = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-18, -22);
    g.lineTo(-7, -22); g.lineTo(-7, -52); g.lineTo(7, -52);
    g.lineTo(7, -22); g.lineTo(18, -22); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 11; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill(); g.restore();
  }


  // 画面外の行き先も到着先と同じ旗形。墨の下地で柱や兵から離す。
  drawEdgeDestination(g, x, y, angle, defend = false, caption = '') {
    // 下知は既存の任務札で読む。端の案内には矢印だけを残す。
    if (this.rt.def.routeGuideArrowOnly) {
      this.drawNavigationArrow(g, x, y, angle, .55);
      return;
    }
    g.save();
    g.font = 'bold 16px sans-serif';
    const half = Math.max(36, caption ? g.measureText(caption).width / 2 + 12 : 36);
    g.fillStyle = '#14120f'; g.fillRect(x - half, y - 76, half * 2, 112);
    this.drawNavigationArrow(g, x + Math.cos(angle) * 22, y + Math.sin(angle) * 22, angle, .85, true);
    this.drawSmallGoalFlag(g, x - 12, y - 18, .8, false, defend);
    if (caption) {
      g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff3ba'; g.fillText(caption, x, y + 24);
    }
    g.restore();
  }


  // 守る相手は携帯でも見つかる盾。頭上に固定し、十字で敵の三角と区別する。
  drawGuardSign(g, x, y) {
    g.save(); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x - 22, y - 52); g.lineTo(x + 22, y - 52);
    g.lineTo(x + 22, y - 23); g.quadraticCurveTo(x + 18, y - 10, x, y);
    g.quadraticCurveTo(x - 18, y - 10, x - 22, y - 23); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill();
    g.beginPath(); g.moveTo(x, y - 42); g.lineTo(x, y - 17);
    g.moveTo(x - 12, y - 31); g.lineTo(x + 12, y - 31);
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke(); g.restore();
  }


  // 護衛の目印は頭上にまとめ、乱戦でも誰を追うか示す。
  drawEscortFlag(g, x, y) {
    // 行き先と同じ太い矢印を頭のすぐ上に置く。別の文字札は増やさない。
    this.drawNavigationArrow(g, x, y - 18, Math.PI / 2, .65, true);
  }


  // 人の案内は任務札と置き換え、命などと合わせて三枚までにする。
  drawPersonAction(g, rt, x, y, label, frame = null) {
    const order = $('objectives');
    if (order.classList.contains('expand') || rt.nearestInteract() || rt.touchCoachActive ||
        order.querySelector('.battle-action:not([hidden]) button')) return false;
    const occupied = this.notices.picks.length - Number(this.notices.sources[1].selected) +
      Number(!!this.healthRect) + Number(!$('boss').hidden) +
      Number(!$('target').hidden && !$('target').classList.contains('notice-muted'));
    if (occupied >= 3) return false;
    const scale = Math.max(1, S.textScale || 1), height = 36 * scale;
    g.save(); g.font = `bold ${18 * scale}px sans-serif`;
    const width = g.measureText(label).width + 20;
    const near = frame && this.enemyOrderSpot(frame, width, height, 76);
    const spot = near || this.goalFlagSpot(rt, x, y, width, height);
    const left = near ? near.x : spot.labelX - width / 2;
    const top = near ? near.y : spot.labelY - height / 2;
    this.drawGuideLink(g, x, y, left, top, left + width, top + height, true);
    g.fillStyle = '#14120f'; g.fillRect(left, top, width, height);
    g.fillStyle = '#fff3ba'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, left + width / 2, top + height / 2); g.restore();
    setClass(this.root, 'edge-destination', true);
    return true;
  }


  // 門とお堂の入口、任務札に共通の門形。
  drawEntranceSign(g, x, y) {
    g.save(); g.lineJoin = 'round'; g.beginPath();
    g.moveTo(x - 23, y - 34); g.lineTo(x, y - 46); g.lineTo(x + 23, y - 34);
    g.lineTo(x + 17, y - 34); g.lineTo(x + 17, y);
    g.lineTo(x + 9, y); g.lineTo(x + 9, y - 26);
    g.lineTo(x - 9, y - 26); g.lineTo(x - 9, y);
    g.lineTo(x - 17, y); g.lineTo(x - 17, y - 34); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill(); g.restore();
  }


  // 操作面へ固定し、本人の足元と指の案内の間を空ける。
  playerControlOrigin(rt, look = false, nearPlayer = false) {
    const point = this.playerControlPoint || (this.playerControlPoint = {});
    const right = look ? !S.touchSwap : !!S.touchSwap;
    point.visible = false;
    point.x = VIEW.w * (right ? .78 : .22);
    point.y = Math.max(144, VIEW.h - 112);
    // 開幕の丸は本人の足元へ。ここは左右どちらでも歩行入力として受ける。
    if (nearPlayer && rt.player.fpK <= .5) {
      const p = rt.player.u.pos;
      const foot = this.project(p, p.y + .12, rt,
        this.openingControlFoot || (this.openingControlFoot = {}));
      if (!foot.behind) {
        point.x = Math.max(88, Math.min(VIEW.w - 88, foot.x));
        point.y = Math.max(176, Math.min(VIEW.h - 64, foot.y));
      }
    }
    // 指の下端まで体力札から八画素離す。操作の左右入れ替えにも合わせる。
    const health = this.healthRect;
    if (health && point.x + 36 > health.left - 8 && point.x - 36 < health.right + 8)
      point.y = Math.min(point.y, health.top - 56);
    return point;
  }


  // 自分は足元の白い太い輪で示す。相手の剣と見分け、押すボタンに見える枠は付けない。
  drawPlayerSign(g, rt) {
    // 接敵中は相手を優先し、開幕は本人の位置に指の手本を置く。
    if (this.root.classList.contains('combat-three') ||
        isTouch && this.openingActive && this.opening?.el.classList.contains('opening-controls')) return false;
    let footDrawn = false;
    const coaching = isTouch && (this.openingActive || rt.touchSwipeActive || this.moveGestureDrawn);
    // 操作案内が消えた後も、自分の実際の足元に白い輪を残す。
    if (!rt.def.town && !rt.def.dojo && rt.player.u.alive && rt.player.u.mesh?.visible &&
        !rt.over && !rt.choice && !rt.player.camShot && !this.bigmap && rt.player.fpK <= .5) {
      const frame = this.measurePersonFrame(rt.player.u, rt);
      if (frame) this.drawEnemyContour(g, rt, rt.player.u, frame);
      const p = rt.player.u.pos;
      const foot = this.project(p, p.y + .12, rt,
        this.playerSignFoot || (this.playerSignFoot = {}));
      if (!foot.behind && foot.x >= 32 && foot.x <= VIEW.w - 32 && foot.y >= 64 && foot.y <= VIEW.h + 12) {
        // 足元の輪と呼び名は手前の兵にも隠れない画面の層へ描く。
        // 自分の印と呼び名は足元だけにまとめる。
        g.save(); g.beginPath();
        g.ellipse(foot.x, foot.y, 30, 13, 0, 0, Math.PI * 2);
        g.strokeStyle = '#14120f'; g.lineWidth = 10; g.stroke();
        g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke();
        g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const labelY = Math.max(80, Math.min(VIEW.h - 14, foot.y - 25));
        g.strokeStyle = '#14120f'; g.lineWidth = 5; g.strokeText('自分', foot.x, labelY);
        g.fillStyle = '#fff'; g.fillText('自分', foot.x, labelY); g.restore();
        footDrawn = true;
      }

    }
    // 向きの印は実際の足元に置く。操作を始める丸とは形も位置も分ける。
    if (!coaching && !singleBattleGuide(rt) && !this.retreatGuide?.active && !this.headingDrawn && !this.openingActive && !rt.def.town && !rt.def.dojo &&
        !S.reduceGuidance && !guidanceEnded(rt) && !rt.over && !rt.choice && !rt.player.camShot && !this.bigmap &&
        rt.player.u.alive && rt.player.fpK <= .5 &&
        (this.aimGuideEnemy?.alive || this.defendEnemy?.alive || rt.def.waitFacingPoint?.(rt))) {
      const p = rt.player.u.pos;
      const foot = this.project(p, p.y + .12, rt, this.headingFoot || (this.headingFoot = {}));
      const tip = this.headingPoint || (this.headingPoint = { x:0, y:0, z:0 });
      tip.x = p.x + Math.sin(rt.player.yaw) * 2;
      tip.z = p.z + Math.cos(rt.player.yaw) * 2; tip.y = p.y + .12;
      const end = this.project(tip, tip.y, rt, this.headingEnd || (this.headingEnd = {}));
      const dx = end.x - foot.x, dy = end.y - foot.y, length = Math.hypot(dx, dy);
      if (!foot.behind && !end.behind && length > 1 && foot.x > 24 && foot.x < VIEW.w - 24 && foot.y > 64 && foot.y < VIEW.h - 24) {
        this.drawNavigationArrow(g, foot.x + dx / length * 34, foot.y + dy / length * 34,
          Math.atan2(dy, dx), .65, true);
        this.headingDrawn = true;
      }
    }
    if (this.openingActive && this.opening?.el.classList.contains('opening-controls') &&
        !rt.choice && !rt.player.camShot && !this.bigmap && rt.player.fpK <= .5) {
      // 開幕の矢印は端の説明札の中だけに置く。
      return true;
    }
    return footDrawn || !!this.headingDrawn;
  }
}
