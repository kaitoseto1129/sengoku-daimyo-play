import { VIEW } from "./viewport.js";
import { setClass, singleBattleGuide, $, setCssVar, retreatGuideText } from "./hud_common.js";
import { groundAt } from "./floors.js";
import { mountainWay, localClear } from "./army_local_way.js";

export class HudTravel {


  // 道案内専用の入れ物を使い、兵の命令や遊ぶ人の移動には触れない。
  drawTravelGuide(g, rt, pos, radius, ally, showLabel = true, retreat = false, routeOnly = false, goalPos = pos) {
    const W = VIEW.w, H = VIEW.h, p = rt.player.u.pos;
    if (!ally && !retreat) setClass(this.root, 'travel-guide', true);
    const cache = this.travelGuide || (this.travelGuide = {
      scout: { id: 0, pos: p }, goal: { x: 0, y: 0, z: 0 },
      arrow: new Float32Array(14), at: -1, gx: Infinity, gz: Infinity, valid: false
    });
    // 指定した戦だけ、描いた印の範囲も札の置き場から除く。入れ物は使い回す。
    const reserved = rt.def.clearTravelGuide ? (cache.reserved || (cache.reserved = [])) : null;
    if (reserved) reserved.length = 0;
    let arrowLeft = Infinity, arrowTop = Infinity, arrowRight = -Infinity, arrowBottom = -Infinity;
    const reached = Math.hypot(pos.x - p.x, pos.z - p.z) < radius;
    // 半秒ごとに歩ける道を調べる。矢印は道の地面に投影し、崖へ貼らない。
    if (cache.at > rt.t + .5 || cache.at <= rt.t || Math.hypot(pos.x - cache.gx, pos.z - cache.gz) > 1) {
      cache.at = rt.t + .5; cache.gx = pos.x; cache.gz = pos.z; cache.valid = false;
      cache.scout.pos = p;
      cache.goal.x = pos.x; cache.goal.z = pos.z; cache.goal.y = groundAt(rt.world, pos.x, pos.z, p.y);
      const way = rt.world.def.guideWay?.(rt.player.u, cache.goal) || mountainWay(rt.army, cache.scout, cache.goal, true);
      const dx = way.x - p.x, dz = way.z - p.z, length = Math.hypot(dx, dz);
      if (length > .8) {
        const ux = dx / length, uz = dz / length;
        // 足元から次の曲がり角まで。狭い道では幅を縮め、壁をまたがない。
        for (let tip = retreat ? length : Math.min(6, length); tip >= .8 && !cache.valid; tip *= .5) {
          const tail = .3, neck = Math.max(tail, tip - Math.min(1.4, tip * .45));
          for (let width = .8; width >= .19 && !cache.valid; width *= .5) {
            cache.valid = true;
            for (let i = 0; i < 7; i++) {
              const along = i === 0 ? tip : i === 3 || i === 4 ? tail : neck;
              const across = i === 0 ? 0 : (i < 4 ? 1 : -1) * (i === 1 || i === 6 ? width : width * .45);
              const q = cache.goal;
              q.x = p.x + ux * along - uz * across; q.z = p.z + uz * along + ux * across; q.y = p.y;
              cache.arrow[i * 2] = q.x; cache.arrow[i * 2 + 1] = q.z;
              if (!localClear(rt.army, p, q, true)) cache.valid = false;
            }
          }
        }
      }
      cache.goal.x = goalPos.x; cache.goal.z = goalPos.z;
      cache.goal.y = groundAt(rt.world, goalPos.x, goalPos.z, p.y);
      cache.goalClear = !rt.army.wallBetween(p, -1, cache.goal);
    }
    const floorY = groundAt(rt.world, goalPos.x, goalPos.z, p.y);
    const s = this.project(goalPos, floorY + .18, rt);
    let onScreen = !s.behind && s.x > 48 && s.x < W - 48 && s.y > (retreat ? 154 : 100) && s.y < H - 28 &&
      cache.goalClear && this.floorGoalVisible(rt, cache.goal);
    if (retreat && !routeOnly) {
      const target = cache.retreatWay || (cache.retreatWay = { x: 0, z: 0 });
      target.x = !onScreen && cache.valid && !cache.goalClear ? cache.arrow[0] : goalPos.x;
      target.z = !onScreen && cache.valid && !cache.goalClear ? cache.arrow[1] : goalPos.z;
      // 本人と旗の間に柵があっても、視点から見える戻り先には旗と輪を置く。
      const goalVisible = !s.behind && s.x > 48 && s.x < W - 48 && s.y > 100 && s.y < H - 28 &&
        this.floorGoalVisible(rt, cache.goal);
      return this.drawRetreatDestination(g, rt, goalPos, goalVisible, s.x, s.y, reached, target);
    }
    if (singleBattleGuide(rt) && !this.openingActive && cache.valid && !reached) {
      const start = cache.lineStart || (cache.lineStart = { x:0, z:0 });
      const end = cache.lineEnd || (cache.lineEnd = { x:0, z:0 });
      const dx = cache.arrow[0] - p.x, dz = cache.arrow[1] - p.z;
      const distance = Math.hypot(dx, dz), offset = Math.min(1.5, distance * .5);
      if (distance > .2) {
        start.x = p.x + dx * offset / distance; start.z = p.z + dz * offset / distance;
        end.x = cache.arrow[0]; end.z = cache.arrow[1];
        const route = cache.lineRoute || (cache.lineRoute = []);
        route[0] = start; route[1] = end;
        this.drawRoutePath(g, rt, route, true);
      }
    }
    let drew = false, routeArrow = false;
    g.save(); g.lineJoin = 'round';
    // 戸口や角が見えない時は左右へ振り向かせる。見える道の矢印は床への投影を保つ。
    if (routeOnly && rt.def.routeDestinationSight && !onScreen && !reached) {
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const turnRight = side >= 0;
      if (forward < 0 || Math.abs(side) >= forward * .45) {
        this.drawNavigationArrow(g, turnRight ? W - 80 : 80, H * .55, turnRight ? 0 : Math.PI, .6);
        drew = true;
      }
      g.restore(); return drew;
    }
    // 見えている行き先に直接、一つの短い矢印を付ける。到着の判定は変えない。
    if (retreat || !reached && (onScreen || rt.def.compactTravelArrow || rt.missionGuide?.marker?.entrance || rt.def.placeFrame?.(rt))) {
      const yaw = rt.player.yaw + (rt.player.camYawOff || 0);
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      let tx = onScreen ? s.x : side >= 0 ? W - (retreat ? 84 : 48) : retreat ? 84 : 48;
      let ty = onScreen ? s.y : retreat ? Math.min(H - 84, H * .55 + 32) : H * .55 + 32;
      if (!onScreen && cache.valid && !cache.goalClear) {
        const x = cache.arrow[0], z = cache.arrow[1];
        this.tmpV.set(x, groundAt(rt.world, x, z, p.y) + .18, z).project(rt.camera);
        if (this.tmpV.z >= -1 && this.tmpV.z <= 1) {
          tx = Math.max(48, Math.min(W - 48, (this.tmpV.x * .5 + .5) * W));
          ty = Math.max(100, Math.min(H - 28, (-this.tmpV.y * .5 + .5) * H));
        }
      }
      this.tmpV.set(p.x, p.y + .18, p.z).project(rt.camera);
      const fx = Math.max(48, Math.min(W - 48, (this.tmpV.x * .5 + .5) * W));
      const fy = Math.max(100, Math.min(H - 28, (-this.tmpV.y * .5 + .5) * H));
      const angle = Math.atan2(ty - fy, tx - fx);
      // 画面内も端も同じ線描を使う。方向は保ち、塗りつぶす面を作らない。
      this.drawNavigationArrow(g, tx, ty, angle, .65, true);
      arrowLeft = tx - 32; arrowRight = tx + 32;
      arrowTop = ty - 32; arrowBottom = ty + 32;
      drew = true; routeArrow = true;
    }
    // 足元がカメラの裏へ切れても、先の床の矢印まで消さない。
    // 歩ける道の内側へ一つ置き、ほかの目印と重ねない。
    if (!routeArrow && !reached && cache.valid) {
      const screen = cache.screen || (cache.screen = new Float32Array(14));
      const dx = cache.arrow[0] - p.x, dz = cache.arrow[1] - p.z;
      const length = Math.hypot(dx, dz), ux = dx / length, uz = dz / length;
      const width = Math.min(.3, Math.hypot(cache.arrow[2] - cache.arrow[12], cache.arrow[3] - cache.arrow[13]) * .4);
      g.save(); g.beginPath(); g.rect(12, 64, W - 24, H - 88); g.clip();
      {
        const tip = length, back = Math.min(.6, tip * .45);
        let visible = true;
        for (let i = 0; i < 3; i++) {
          const across = i === 0 ? -width : i === 2 ? width : 0;
          const along = tip - (i === 1 ? 0 : back);
          const point = cache.goal;
          point.x = p.x + ux * along - uz * across;
          point.z = p.z + uz * along + ux * across;
          point.y = groundAt(rt.world, point.x, point.z, p.y);
          if (Math.abs(point.y - p.y) > .6 || !this.floorGoalVisible(rt, point, false)) { visible = false; break; }
          this.tmpV.set(point.x, point.y + .08, point.z).project(rt.camera);
          if (this.tmpV.z < -1 || this.tmpV.z > 1) { visible = false; break; }
          screen[i * 2] = (this.tmpV.x * .5 + .5) * W;
          screen[i * 2 + 1] = (-this.tmpV.y * .5 + .5) * H;
        }
        if (visible && screen[2] >= 12 && screen[2] <= W - 12 && screen[3] >= 64 && screen[3] <= H - 24) {
          g.beginPath(); g.moveTo(screen[0], screen[1]); g.lineTo(screen[2], screen[3]); g.lineTo(screen[4], screen[5]);
          g.strokeStyle = '#14120f'; g.lineWidth = 9; g.stroke();
          g.strokeStyle = '#fff3ba'; g.lineWidth = 4; g.stroke();
          arrowLeft = screen[2] - 24; arrowRight = screen[2] + 24;
          arrowTop = screen[3] - 24; arrowBottom = screen[3] + 24;
          drew = true; routeArrow = true;
        }
      }
      g.restore();
      cache.goal.x = goalPos.x; cache.goal.z = goalPos.z; cache.goal.y = floorY;
      if (routeArrow && reserved) {
        const box = cache.arrowBox || (cache.arrowBox = {});
        box.left = arrowLeft; box.right = arrowRight; box.top = arrowTop; box.bottom = arrowBottom;
        reserved.push(box);
      }
    }
    // 回避の札は既存の一枚を使い、道の先にも同じ形の印を置く。
    if (routeOnly) { g.restore(); return drew; }
    // 到着の判定は変えず、実際の床に置ける時だけ輪を描く。
    if (onScreen && !routeArrow && (retreat || !ally) && !(!retreat && !ally && rt.def.compactHoldGuide)) {
      const placed = this.drawFloorGoal(g, rt, goalPos.x, goalPos.z, false, retreat ? 1.5 : .75);
      drew = placed || drew;
      if (!placed) onScreen = false;
    }
    if (!onScreen && !reached && !routeArrow) {
      this.drawOffscreenDirection(g, rt, pos);
      drew = true;
    }
    if (onScreen && !routeArrow && !retreat && !ally && rt.def.compactHoldGuide) {
      this.drawSmallGoalFlag(g, s.x, s.y);
      drew = true;
    }
    let ax = s.x, ay = s.y - 78;
    if ((!ally || retreat) && this.notices.sources[1].selected && !$('objectives').classList.contains('expand')) {
      const order = $('objectives');
      setClass(order, 'ground-order', true); setClass(order, 'travel-retreat', true);
      setClass(order, 'goal-visible', onScreen && retreat);
      setClass(order, 'destination-sign', true);
      const measureKey = this.objKey + '|' + this.actionLabel?.textContent + '|' + onScreen + '|' + W + '|' + H;
      if (this.travelOrderKey !== measureKey) {
        this.travelOrderKey = measureKey;
        this.travelOrderW = order.offsetWidth; this.travelOrderH = order.offsetHeight;
      }
      if (routeArrow) ax = (arrowLeft + arrowRight) / 2;
      else if (!onScreen && !reached) {
        const yaw = rt.player.yaw + (rt.player.camYawOff || 0), dx = pos.x - p.x, dz = pos.z - p.z;
        const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw) >= 0;
        ax = right ? W - this.travelOrderW / 2 - 64 : this.travelOrderW / 2 + 64;
      }
      const left = Math.round(Math.max(12, Math.min(W - this.travelOrderW - 12, ax - this.travelOrderW / 2)));
      const top = retreat ? Math.round(Math.max(12, Math.min(H - this.travelOrderH - 12,
        (routeArrow ? arrowTop : s.y - 32) - 8 - this.travelOrderH))) : 12;
      setCssVar(order, '--ground-order-x', left + 'px');
      setCssVar(order, '--ground-order-y', top + 'px');
      // 退く札は一つだけの矢印のすぐ上へそろえる。
      drew = true;
      showLabel = false;
    }
    // 任務札と合わせて三枚以内。人の印と「ここへ」は一枚にまとめる。
    const occupied = this.notices.picks.length + Number(!this.root.classList.contains('working') && !!rt.nearestInteract()) +
      Number(!$('boss').hidden) + Number(!$('target').hidden && !$('target').classList.contains('notice-muted'));
    if (retreat && routeArrow) { ax = (arrowLeft + arrowRight) / 2; ay = arrowTop - 8; }
    if (showLabel && !rt.touchCoachActive && !this.notices.sources[1].selected && occupied + 1 + Number(!!rt.touchCoachActive) < 3) {
      const off = !onScreen;
      let text = retreat ? retreatGuideText(rt, reached, 'にげる場所') : rt.def.travelGuideLabel?.(rt) || 'ここを押す';
      if (off && !retreat) {
        const yaw = rt.player.yaw + (rt.player.camYawOff || 0), dx = pos.x - p.x, dz = pos.z - p.z;
        const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
        const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
        ax = side >= 0 ? W - 144 : 144; ay = H * .55;
        text = retreat ? retreatGuideText(rt, reached, 'みかたへ もどれ') : forward < 0 ? side >= 0 ? '右へ向こう' : '左へ向こう' : side >= 0 ? '右の道へ' : '左の道へ';
      }
      g.font = retreat ? '900 28px sans-serif' : 'bold 20px sans-serif';
      const half = Math.max(retreat && !off ? 108 : 68, Math.ceil(g.measureText(text).width / 2) + 12);
      if (reserved && onScreen) {
        const box = cache.goalBox || (cache.goalBox = {});
        box.left = s.x - 56; box.right = s.x + 56;
        box.top = s.y - 88; box.bottom = s.y + 24;
        reserved.push(box);
      }
      const spot = this.avoidRects(ax, ay, W, H, 'v', reserved, half + (off && !retreat ? 54 : 4), 44, true);
      if (spot) {
        const x = spot[0], y = spot[1];
        g.fillStyle = '#14120f'; g.fillRect(x - half, y - 44, half * 2, 40);
        g.fillStyle = '#fff3ba'; g.font = retreat ? '900 28px sans-serif' : 'bold 20px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, x, y - 24);
        drew = true;
      }
    }
    g.restore(); return drew;
  }


  // 足元の輪は一人・一か所だけ。遠くても線の太さを保ち、兵の姿を塗りつぶさない。
  drawTargetFootRing(g, rt, pos, scale = 1, person = false, prominent = false, guardPost = false) {
    // 指定した戦では、開幕や旗への移動でも通常と同じ小さい印にそろえる。
    if (!person && !prominent && rt.def.compactFlagEmphasis) { prominent = false; scale = Math.min(scale, .65); }
    const point = this.targetFootPoint || (this.targetFootPoint = { x:0, y:0, z:0 });
    point.x = pos.x; point.z = pos.z;
    point.y = groundAt(rt.world, pos.x, pos.z, pos.y ?? rt.player.u.pos.y);
    // 姿を確認した敵と守る場所の輪は、手前の兵で足元が隠れても残す。
    if (!guardPost && !person && !prominent && !this.floorGoalVisible(rt, point)) return;
    this.tmpV.set(point.x, point.y + .08, point.z).project(rt.camera);
    const x = (this.tmpV.x * .5 + .5) * VIEW.w, y = (-this.tmpV.y * .5 + .5) * VIEW.h;
    if (this.tmpV.z < -1 || this.tmpV.z > 1 || x < 24 || x > VIEW.w - 24 || y < 64 || y > VIEW.h - 16) return;
    // ねらう敵は足元の太い閉じた輪。自分の白い角形とは形でも分ける。
    if (person && singleBattleGuide(rt)) {
      g.save(); g.beginPath(); g.ellipse(x, y, 27, 10, 0, 0, Math.PI * 2);
      g.strokeStyle = '#14120f'; g.lineWidth = 10; g.stroke();
      g.strokeStyle = '#ffbd8d'; g.lineWidth = 5; g.stroke();
      // 輪を指す下向きの矢印。字の札や押せる場所は追加しない。
      g.beginPath(); g.moveTo(x - 5, y - 48); g.lineTo(x + 5, y - 48);
      g.lineTo(x + 5, y - 34); g.lineTo(x + 12, y - 34);
      g.lineTo(x, y - 20); g.lineTo(x - 12, y - 34); g.lineTo(x - 5, y - 34); g.closePath();
      g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
      g.fillStyle = '#ffbd8d'; g.fill(); g.restore();
      return true;
    }
    // 小さい案内を選ぶ戦では、強調指定でも足元の細い二弧にそろえる。
    // 行き先は砂色、敵は朱色とし、白い閉じた輪を重ねない。
    if (rt.def.compactFieldGuides) {
      const radius = person ? 13 : guardPost ? 20 : 16;
      g.save(); g.lineCap = 'round'; g.beginPath();
      g.ellipse(x, y, radius, radius * .32, 0, .25, Math.PI - .25);
      g.moveTo(x - Math.cos(.25) * radius, y - Math.sin(.25) * radius * .32);
      g.ellipse(x, y, radius, radius * .32, 0, Math.PI + .25, Math.PI * 2 - .25);
      g.strokeStyle = '#211d17'; g.lineWidth = 3.5; g.stroke();
      g.strokeStyle = person ? '#dba48c' : '#d6c79e'; g.lineWidth = 1.5; g.stroke();
      g.restore(); return true;
    }
    // 行き先は旗と金の光る輪。自分の白い輪とは色と旗形で分ける。
    if (!person && (prominent || guardPost)) {
      this.drawGoalArrivalRing(g, x, y);
      if (!singleBattleGuide(rt)) this.drawSmallGoalFlag(g, x, y - 4, .8, false, guardPost, '');
      return true;
    }
    // 敵の足元は短い二つの弧だけ。体を囲む札と太い楕円を重ねない。
    if (person && rt.def.compactCombatGuides && !singleBattleGuide(rt) && !guardPost && !prominent) {
      g.save(); g.beginPath();
      g.ellipse(x, y, 12, 4, 0, .15, Math.PI - .15);
      g.moveTo(x - 12 * Math.cos(.15), y - 4 * Math.sin(.15));
      g.ellipse(x, y, 12, 4, 0, Math.PI + .15, Math.PI * 2 - .15);
      g.strokeStyle = '#14120f'; g.lineWidth = 4; g.stroke();
      g.strokeStyle = '#e5d6ad'; g.lineWidth = 1.5; g.stroke(); g.restore();
      return true;
    }
    if (singleBattleGuide(rt) && !person && !prominent && !guardPost) {
      const marker = rt.missionGuide?.marker;
      if (marker?.guideDefend || /^(guard|wait)$/.test(marker?.guideArea))
        this.drawSmallGoalFlag(g, x, y, .65, false, true);
      else this.drawDestinationSign(g, x, y);
      return true;
    }
    this.tmpV.set(point.x, point.y + 1, point.z).project(rt.camera);
    const subtle = !prominent && !!rt.def.subtleGroundGuides;
    // 小さな到着輪を指定した戦だけ、最小半径と太さも縮める。
    const compact = !prominent && !person && rt.def.compactGroundGoalRing;
    const radius = Math.max(prominent ? 38 : person || compact || !singleBattleGuide(rt) ? 22 : 34, Math.min(42, Math.abs(y - (-this.tmpV.y * .5 + .5) * VIEW.h) * .7)) *
      (person || compact || !singleBattleGuide(rt) ? scale : Math.max(1, scale)) * (subtle ? .7 : 1);
    g.save(); g.globalAlpha = 1; g.beginPath(); g.ellipse(x, y, radius, Math.max(8, radius * .3), 0, 0, Math.PI * 2);
    g.strokeStyle = '#14120f'; g.lineWidth = subtle || compact ? 5 : Math.max(12, 10 * scale); g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = subtle ? 2 : compact ? 2.5 : Math.max(7, 5 * scale); g.stroke(); g.restore();
    return true;
  }


  // 地面の旗へ既存の短い任務札を結び、行き先を一組で示す。
  drawGoalFlagFrame(g, bounds, subtleFrame = false, emphasize = false) {
    // 実物の布だけを囲み、別の旗形を重ねない。
    // 目的の旗は省略設定より優先し、布全体を太く囲む。
    // 実物の布だけを囲む。兵の密度や旗の大きさは変えない。
    // 開始時・待機・退避でも、布の周りだけを太く囲む。
    const subtle = !emphasize && !!this.rt?.def.subtleFlagFrames;
    g.save(); g.lineJoin = 'round';
    g.beginPath();
    if (this.rt?.def.cornerFlagFrames && !emphasize) {
      // 指定された戦だけ、布の四隅に短い印を残す。形や配列は毎コマ作らない。
      const left = bounds.left - 3, top = bounds.top - 3;
      const right = left + bounds.width + 6, bottom = top + bounds.height + 6;
      const corner = Math.min(12, (bounds.width + 6) / 3, (bounds.height + 6) / 3);
      g.moveTo(left, top + corner); g.lineTo(left, top); g.lineTo(left + corner, top);
      g.moveTo(right - corner, top); g.lineTo(right, top); g.lineTo(right, top + corner);
      g.moveTo(right, bottom - corner); g.lineTo(right, bottom); g.lineTo(right - corner, bottom);
      g.moveTo(left + corner, bottom); g.lineTo(left, bottom); g.lineTo(left, bottom - corner);
    } else {
      g.rect(bounds.left - 3, bounds.top - 3, bounds.width + 6, bounds.height + 6);
    }
    g.strokeStyle = '#14120f'; g.lineWidth = subtle ? 5 : 11; g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = subtle ? 2 : emphasize ? 6 : 5; g.stroke();
    g.restore();
  }


  // 実物の旗と画面端で同じ形を使う。字の札は増やさない。
  drawFlagDestinationSign(g, x, y) {
    // 本人のひし形と混同しない、竿と切れ込みのある旗。
    g.save(); g.translate(x - 9, y + 17); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -34);
    g.lineTo(25, -34); g.lineTo(18, -26); g.lineTo(25, -18); g.lineTo(0, -18);
    g.strokeStyle = '#14120f'; g.lineWidth = 11; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
    g.restore();
  }


  // 旗と隣の札を一組で空きへ寄せる。兵の投影と測った札は共用する。
  goalFlagSpot(rt, sx, sy, width, height) {
    const W = VIEW.w, H = VIEW.h, bodies = this.goalBodyRects(rt), rects = this.hudRects();
    const result = this.goalFlagSpotResult || (this.goalFlagSpotResult = {});
    result.x = sx; result.y = sy;
    let best = Infinity;
    // 現地の旗は固定し、札だけを隣の四方向で探す。
    for (let i = 0; i < 4; i++) {
      const x = i === 0 ? sx + 52 + width / 2 : i === 1 ? sx - 52 - width / 2 : sx;
      const y = i < 2 ? sy : i === 2 ? sy - 48 - height / 2 : sy + 48 + height / 2;
      const left = Math.max(12, Math.min(W - width - 12, x - width / 2));
      const top = Math.max(12, Math.min(H - height - 12, y - height / 2));
      const right = left + width, bottom = top + height;
      let overlap = 0;
      for (const r of rects) {
        if (r === this.guideOrderRect || r === this.noticeRect && this.openingActive) continue;
        overlap += Math.max(0, Math.min(right + 8, r.right) - Math.max(left - 8, r.left)) *
          Math.max(0, Math.min(bottom + 8, r.bottom) - Math.max(top - 8, r.top));
      }
      for (let j = 0; j < this.goalBodyCount; j += 4)
        overlap += Math.max(0, Math.min(right, bodies[j + 2]) - Math.max(left, bodies[j])) *
          Math.max(0, Math.min(bottom, bodies[j + 3]) - Math.max(top, bodies[j + 1]));
      // 札が旗そのものへかぶる候補は避ける。
      overlap += Math.max(0, Math.min(right, sx + 36) - Math.max(left, sx - 36)) *
        Math.max(0, Math.min(bottom, sy + 32) - Math.max(top, sy - 32));
      const score = overlap * 1000 + Math.hypot(left + width / 2 - sx, top + height / 2 - sy);
      if (score < best) {
        best = score; result.labelX = left + width / 2; result.labelY = top + height / 2;
      }
    }
    return result;
  }


  // 札と現地で切れ込みのある同じ旗形を使う。
  drawSelectedGoalFlag(g, bounds, x, y, edgeAngle = null) {
    if (bounds) {
      this.drawGoalFlagFrame(g, bounds);
      x = bounds.left + bounds.width / 2; y = bounds.top - 8;
    }
    g.save(); g.translate(x, y); g.scale(.65, .65);
    this.drawFlagDestinationSign(g, 0, 0); g.restore();
    if (edgeAngle != null) this.drawNavigationArrow(g, x, y - 28, edgeAngle, .35, true);
  }
}
