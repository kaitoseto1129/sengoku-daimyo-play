import { singleBattleGuide, guardPostDistance, defenseRadius, travelSignPriority, $, groundFlag, setClass, setCssVar, setText, esc, drawFieldPaper } from "./hud_common.js";
import { groundAt } from "./floors.js";
import { VIEW } from "./viewport.js";
import { isTouch } from "./touch.js";
import { localClear } from "./army_local_way.js";
import { cameraWallBlocked, sightScreenUnit, sightPoint } from "./battle_sight.js";
import { S } from "./settings.js";

export class HudDestination {

  // 押す指や自分の輪とは違う、歩いて着く場所の足形。
  drawMoveFootprints(g, x, y) {
    g.save(); g.translate(x, y); g.rotate(-.2);
    for (let i = 0; i < 2; i++) {
      const sx = i === 0 ? -9 : 9, sy = i === 0 ? 3 : -5;
      g.beginPath(); g.ellipse(sx, sy, 5, 10, 0, 0, Math.PI * 2);
      g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
      g.fillStyle = '#fff3ba'; g.fill();
      g.beginPath(); g.ellipse(sx, sy + 14, 4, 3, 0, 0, Math.PI * 2);
      g.stroke(); g.fill();
    }
    g.restore();
  }


  // 札と矢印は同じ持ち場・到着判定・画面の向きを使う。入れ物は使い回す。
  waitDestinationCue(rt, guide) {
    const marker = guide?.marker;
    if (!singleBattleGuide(rt) || !marker || !/^(wait|guard)$/.test(marker.guideArea)) return null;
    const pos = marker.guideDestination?.() || guide.pos;
    if (!pos) return null;
    const cue = this.waitDestinationState || (this.waitDestinationState = {});
    const p = rt.player.u.pos, yaw = rt.player.yaw + (rt.player.camYawOff || 0);
    const screen = this.project(pos, groundAt(rt.world, pos.x, pos.z, p.y) + .18, rt,
      this.waitDestinationProjection || (this.waitDestinationProjection = {}));
    cue.outside = guardPostDistance(rt, guide) >= (marker.guideDefend ? defenseRadius(rt, marker) : marker.guideRadius || 8);
    cue.offscreen = screen.behind || screen.x < 48 || screen.x > VIEW.w - 48 ||
      screen.y < 100 || screen.y > VIEW.h - 32;
    cue.side = -(pos.x - p.x) * Math.cos(yaw) + (pos.z - p.z) * Math.sin(yaw) >= 0 ? '右' : '左';
    return cue;
  }


  // 目的は行き先の札にも残す。「ここへ」だけには縮めない。
  destinationPurpose(rt) {
    const label = rt.def.travelGuideLabel?.(rt);
    if (this.openingActive && isTouch && !label) return '輪の中へ';
    if (label) return label;
    return rt.def.routeWaymarkLabel || 'ここへ進む';
  }


  // 到着する床は金のひし形。本人の白い輪や向く先の矢印と形でも分ける。
  drawGoalArrivalRing(g, x, y) {
    g.save(); g.lineJoin = 'round'; g.beginPath();
    g.moveTo(x, y - 12); g.lineTo(x + 30, y);
    g.lineTo(x, y + 12); g.lineTo(x - 30, y); g.closePath();
    g.fillStyle = 'rgba(255,243,186,.18)'; g.fill();
    g.strokeStyle = '#14120f'; g.lineWidth = 8; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 4; g.stroke(); g.restore();
  }


  // 足元から次に踏む地面へ短い道を引く。道の検査と入れ物は使い回す。
  drawDestinationStep(g, rt, goal, groundOnly = false) {
    if (this.releaseMoveActive || this.releaseGestureDrawn) return false;
    if (isTouch && $('objectives').classList.contains('facing-order')) return false;
    // 携帯は歩行入力と同じ向きの手本一本。地面への投影で逆向きに見える矢印を重ねない。
    if (!groundOnly && isTouch && singleBattleGuide(rt)) return this.drawMoveGesture(g, rt, goal);
    if (this.destinationStepDrawn) return true;
    const p = rt.player.u.pos;
    const step = this.destinationStep || (this.destinationStep = { x: 0, y: 0, z: 0, at: -1 });
    if (step.rt !== rt || rt.t >= step.at || rt.t < step.at - .5 ||
        step.gx !== goal.x || step.gz !== goal.z || Math.hypot(p.x - step.px, p.z - step.pz) > 1) {
      step.rt = rt; step.at = rt.t + .5; step.gx = goal.x; step.gz = goal.z;
      step.px = p.x; step.pz = p.z; step.valid = false;
      const next = rt.world.def.guideWay?.(rt.player.u, goal) || goal;
      const dx = next.x - p.x, dz = next.z - p.z, distance = Math.hypot(dx, dz);
      if (distance > 1) {
        const length = Math.min(4, distance);
        step.x = p.x + dx * length / distance; step.z = p.z + dz * length / distance;
        step.y = groundAt(rt.world, step.x, step.z, p.y);
        step.valid = rt.world.walkable(step.x, step.z, step.y) && localClear(rt.army, p, step);
      }
    }
    if (!step.valid || !this.floorGoalVisible(rt, step)) return false;
    const start = this.project(p, p.y + .08, rt,
      this.destinationStartProjection || (this.destinationStartProjection = {}));
    const end = this.project(step, step.y + .08, rt,
      this.destinationStepProjection || (this.destinationStepProjection = {}));
    if (start.behind || end.behind) return false;
    const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
    if (length < 16) return false;
    // 次に踏む床へ太い矢印を寝かせる。七つの頂点と投影の入れ物は共有する。
    const distance = Math.hypot(step.x - p.x, step.z - p.z);
    const ux = (step.x - p.x) / distance, uz = (step.z - p.z) / distance;
    const reach = distance * Math.min(1, (rt.def.floorArrowMaxPixels || 96) / length);
    const tail = Math.min(.7, reach * .2), neck = reach * .62;
    const width = Math.min(.85, reach * .25), shaft = width * .36;
    const points = this.destinationArrowPoints || (this.destinationArrowPoints = new Float32Array(14));
    const point = this.destinationArrowPoint || (this.destinationArrowPoint = { x:0, y:0, z:0 });
    const projected = this.destinationArrowProjection || (this.destinationArrowProjection = {});
    for (let i = 0; i < 7; i++) {
      const along = i === 0 ? reach : i === 1 || i === 2 || i === 5 || i === 6 ? neck : tail;
      const across = i === 0 ? 0 : i === 1 ? width : i === 6 ? -width : i < 4 ? shaft : -shaft;
      point.x = p.x + ux * along - uz * across;
      point.z = p.z + uz * along + ux * across;
      point.y = groundAt(rt.world, point.x, point.z, p.y) + .1;
      this.project(point, point.y, rt, projected);
      if (projected.behind) return false;
      points[i * 2] = projected.x; points[i * 2 + 1] = projected.y;
    }
    g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 88); g.clip();
    g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
    g.moveTo(points[0], points[1]);
    for (let i = 1; i < 7; i++) g.lineTo(points[i * 2], points[i * 2 + 1]);
    g.closePath(); g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill();
    g.restore(); this.destinationStepDrawn = true; return true;
  }


  // 行き先は旗。指を動かすまっすぐな矢印とは結ばない。
  drawNamedGoal(g, x, y, edgeAngle = null) {
    if (this.namedGoalDrawn) return;
    this.namedGoalDrawn = true;
    x = Math.max(40, Math.min(VIEW.w - 40, x));
    y = Math.max(100, Math.min(VIEW.h - 28, y));
    this.namedGoalX = x; this.namedGoalY = y;
    // 開幕・移動中・画面外で同じ丸い旗印を使う。押す操作とは分ける。
    g.save(); g.lineJoin = 'round';
    g.beginPath(); g.arc(x, y - 24, 22, 0, Math.PI * 2);
    g.fillStyle = '#14120f'; g.fill();
    g.strokeStyle = '#14120f'; g.lineWidth = 8; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.moveTo(x - 7, y - 10); g.lineTo(x - 7, y - 38);
    g.lineTo(x + 12, y - 38); g.lineTo(x + 5, y - 30);
    g.lineTo(x + 12, y - 23); g.lineTo(x - 7, y - 23);
    g.strokeStyle = '#fff3ba'; g.lineWidth = 3; g.stroke();
    g.restore();
    if (edgeAngle !== null) this.drawNavigationArrow(g, x + Math.cos(edgeAngle) * 30,
      y + 20 + Math.sin(edgeAngle) * 20, edgeAngle, .65, true);
  }


  // 行き先の床に一本だけ刺す。兵や描画用の物は増やさない。
  drawDestinationPin(g, x, y) {
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    // 待つ輪と同じ太い矢印。先端を入口や行き先の実際の床へ固定する。
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-21, -22);
    g.lineTo(-8, -22); g.lineTo(-8, -51); g.lineTo(8, -51);
    g.lineTo(8, -22); g.lineTo(21, -22); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill(); g.restore();
  }

  drawNamedDestination(g, rt, pos, doorwayFrame = null) {
    if (this.namedGoalDrawn) return true;
    if (this.releaseMoveActive || this.releaseGestureDrawn) return true;
    // 輪や戸口が画面外でも、通れる床へ足あとと進む矢印を残す。携帯も同じ道を使う。
    if (rt.def.routeFootsteps && !rt.missionGuide?.marker?.waitArrived?.() &&
        Math.hypot(pos.x - rt.player.u.pos.x, pos.z - rt.player.u.pos.z) > 1.2)
      this.drawRouteFootsteps(g, rt, pos);
    const destinationLabel = rt.def.namedDestinationLabel?.(rt, pos) || '';
    const point = this.project(pos, groundAt(rt.world, pos.x, pos.z, pos.y ?? rt.player.u.pos.y) + .15,
      rt, this.namedGoalPoint || (this.namedGoalPoint = {}));
    // 携帯でも入口の実際の四隅を残す。床の旗だけで枠を省かない。
    let framed = false;
    if (doorwayFrame) {
      const probe = this.namedDoorProbe || (this.namedDoorProbe = { x:0, y:0, z:0 });
      const distance = Math.max(.001, Math.hypot(rt.camera.position.x - pos.x, rt.camera.position.z - pos.z));
      const inset = Math.min(.35, distance * .5) / distance;
      probe.x = pos.x + (rt.camera.position.x - pos.x) * inset;
      probe.z = pos.z + (rt.camera.position.z - pos.z) * inset; probe.y = pos.y ?? rt.player.u.pos.y;
      framed = sightPoint(rt, probe, 170, true, 1.2) && this.drawDoorwayFrame(g, rt, doorwayFrame);
    }
    let x = framed ? this.doorwayBounds.arrowX : point.x;
    let y = framed ? this.doorwayBounds.arrowY + 17 : point.y, edgeAngle = null;
    // 旗の布や画面端へ移さず、歩いて着く地面だけを示す。
    if (!framed && (point.behind || x < 40 || x > VIEW.w - 40 || y < 100 || y > VIEW.h - 28 ||
        !this.floorGoalVisible(rt, pos))) {
      rt.camera.getWorldDirection(this.tmpV);
      const yaw = Math.atan2(this.tmpV.x, this.tmpV.z), p = rt.player.u.pos;
      const dx = pos.x - p.x, dz = pos.z - p.z;
      const side = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      edgeAngle = Math.atan2(-forward, side);
      const top = Math.min(140, VIEW.h / 3), bottom = VIEW.h - 96, centerY = (top + bottom) / 2;
      const scale = Math.min((VIEW.w / 2 - 96) / Math.max(.001, Math.abs(side)),
        Math.max(12, (bottom - top) / 2) / Math.max(.001, Math.abs(forward)));
      x = VIEW.w / 2 + side * scale; y = centerY - forward * scale;
    }
    if (edgeAngle !== null) {
      const spot = this.avoidRects(x, y, VIEW.w, VIEW.h, 'v', null, 40, 88, true);
      if (spot) y = spot[1];
    }
    // 携帯の開幕は操作面からの点線にまとめ、それ以外は足元からの道を保つ。
    if (!isTouch && this.openingActive && this.opening?.el.classList.contains('opening-controls')) {
      const p = rt.player.u.pos;
      const foot = this.project(p, p.y + .12, rt,
        this.openingRouteFoot || (this.openingRouteFoot = {}));
      const dx = x - foot.x, dy = y - foot.y, length = Math.hypot(dx, dy);
      if (!foot.behind && length > 48) {
        const ux = dx / length, uy = dy / length;
        const endX = x - ux * 28, endY = y - uy * 28;
        g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
        g.moveTo(foot.x, foot.y); g.lineTo(endX, endY);
        g.moveTo(endX - ux * 14 - uy * 8, endY - uy * 14 + ux * 8);
        g.lineTo(endX, endY);
        g.lineTo(endX - ux * 14 + uy * 8, endY - uy * 14 - ux * 8);
        g.strokeStyle = '#14120f'; g.lineWidth = 9; g.stroke();
        g.strokeStyle = '#fff3ba'; g.lineWidth = 4; g.stroke(); g.restore();
      }
    }
    const order = $('objectives');
    // 画面外の案内も任務一枚に収め、矢じりと同じ向き・次の通り口までの歩数を示す。
    if (!this.destinationDistanceLabel) {
      this.destinationDistanceLabel = document.createElement('div');
      this.destinationDistanceLabel.className = 'destination-distance';
      order.appendChild(this.destinationDistanceLabel);
    }
    this.destinationDistanceLabel.hidden = edgeAngle === null && !destinationLabel;
    if (edgeAngle === null && destinationLabel) setText(this.destinationDistanceLabel, destinationLabel);
    if (edgeAngle !== null) {
      const p = rt.player.u.pos;
      const steps = Math.max(1, Math.ceil(Math.hypot(pos.x - p.x, pos.z - p.z) / .75));
      const direction = Math.sin(edgeAngle) > .5 ? '後ろへ' : Math.cos(edgeAngle) > .5 ? '右へ' :
        Math.cos(edgeAngle) < -.5 ? '左へ' : '前へ';
      setText(this.destinationDistanceLabel, destinationLabel ? `${destinationLabel}・${direction}` : `${direction}・あと${steps}歩`);
    }
    const openingControls = isTouch && this.openingActive && this.opening?.el.classList.contains('opening-controls');
    const attached = !this.openingActive && this.notices.sources[1].selected && !order.classList.contains('expand');
    // 入口の中心は動かさず、旗と任務を同じ札へ入れる。人を避けて別の床へ移さない。
    if (attached) {
      setClass(order, 'swipe-order', false);
      setClass(order, 'ground-order', true);
      setClass(order, 'attached-destination', true);
      const width = order.offsetWidth, height = order.offsetHeight;
      const spot = this.goalFlagSpot(rt, x, y, width, height);
      const left = spot.labelX - width / 2, top = spot.labelY - height / 2;
      setCssVar(order, '--ground-order-x', Math.round(left) + 'px');
      setCssVar(order, '--ground-order-y', Math.round(top) + 'px');
      this.drawGuideLink(g, x, y, left, top, left + width, top + height, true, true);
    }
    // 操作の説明は一枚。細い点線の先に、着地点の輪と旗だけを残す。
    if (openingControls) {
      const opening = this.opening;
      this.drawDestinationTrail(g, rt, x, y, opening.swipeX, opening.swipeY - 64);
    }
    if (edgeAngle === null && !framed) {
      if (!rt.def.destinationPin) this.drawGoalArrivalRing(g, point.x, point.y);
      if (destinationLabel) this.drawNavigationArrow(g, x, y - 32, Math.PI / 2, 1.1, true);
      if (rt.def.destinationPin) this.drawDestinationPin(g, x, y);
      else if (openingControls || destinationLabel && !attached) {
        // 操作面からの点線を残し、着地点の札は人物と輪を避ける。
        const size = 20 * Math.max(1, S.textScale || 1);
        g.save(); g.font = `bold ${size}px serif`;
        const width = g.measureText('ここへ').width + 44, height = Math.max(44, size + 16);
        const spot = this.goalFlagSpot(rt, x, y, width, height);
        const left = spot.labelX - width / 2, top = spot.labelY - height / 2;
        this.drawGuideLink(g, x, y, left, top, left + width, top + height, true, true);
        drawFieldPaper(g, left, top, width, height);
        g.translate(left + 10, top + height / 2); g.scale(.65, .65);
        this.drawFlagDestinationSign(g, 9, 0); g.restore();
        g.save(); g.font = `bold ${size}px serif`; g.textBaseline = 'middle';
        g.fillStyle = '#241d15'; g.fillText('ここへ', left + 36, top + height / 2); g.restore();
      } else if (!attached) this.drawFlagDestinationSign(g, x + 9, y - 17);
    } else if (edgeAngle !== null) {
      // 画面外は向きだけ。端に着地点の旗や輪を作らない。
      this.drawNavigationArrow(g, x, y, edgeAngle, destinationLabel ? 1.1 : .65, true, false, true);
    }
    this.namedGoalDrawn = true; this.goalFlagDrawn = true;
    // 指の手本とは離し、次に踏める床へ短い矢印を寝かせる。
    if (!isTouch && !rt.def.routeFootsteps) this.drawDestinationStep(g, rt, pos, true);
    return true;
  }


  // 矢じりのない細い点線で、操作面や本人から旗までの関係を示す。
  drawDestinationTrail(g, rt, x, y, startX, startY) {
    if (startX == null || startY == null) {
      const p = rt.player.u.pos;
      const foot = this.project(p, p.y + .08, rt,
        this.destinationTrailFrom || (this.destinationTrailFrom = {}));
      if (foot.behind) return false;
      startX = foot.x; startY = foot.y;
    }
    const dx = x - startX, dy = y - startY, length = Math.hypot(dx, dy);
    if (length < 44) return false;
    const ux = dx / length, uy = dy / length;
    this.destinationTrailDash ||= [3, 10];
    g.save(); g.beginPath(); g.rect(12, 64, VIEW.w - 24, VIEW.h - 88); g.clip();
    g.setLineDash(this.destinationTrailDash); g.lineCap = 'round';
    g.beginPath(); g.moveTo(startX + ux * 12, startY + uy * 12);
    g.lineTo(x - ux * 30, y - uy * 30);
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 2; g.stroke(); g.restore();
    return true;
  }


  drawDestinationSign(g, x, y) {
    this.drawNamedGoal(g, x, y);
  }


  // 歩く棒と同じ視点で、今必要な指の向きを短く示す。
  navigationDirection(rt, pos) {
    const p = rt.player.u.pos, yaw = rt.player.yaw;
    const dx = pos.x - p.x, dz = pos.z - p.z;
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const diagonal = Math.min(Math.abs(right), Math.abs(forward)) > Math.max(Math.abs(right), Math.abs(forward)) * .4142;
    const side = diagonal ? `${right >= 0 ? '右' : '左'}${forward >= 0 ? '上' : '下'}` :
      Math.abs(right) > Math.abs(forward) ? right >= 0 ? '右' : '左' : forward >= 0 ? '上' : '下';
    return side;
  }


  navigationMoveText(rt, pos) {
    const side = this.navigationDirection(rt, pos);
    return isTouch ? `${side}になぞる` : `${side.replace('上', '前').replace('下', '後ろ')}へ進む`;
  }


  // 開幕と同じ指の絵を既存の札に入れ、歩く側のなぞる向きを示す。
  navigationGesture(rt, pos) {
    const side = this.navigationDirection(rt, pos);
    // 地面の短い矢印がある戦では、札に同じ大きな指と矢印を重ねない。
    if (rt.def.compactFieldGuides) return `${esc(side)}になぞる`;
    const angle = side === '右上' ? 45 : side === '右下' ? 135 : side === '左上' ? -45 : side === '左下' ? -135 :
      side === '右' ? 90 : side === '左' ? -90 : side === '下' ? 180 : 0;
    return `<svg class="retreat-gesture" viewBox="-56 -4 160 160" aria-hidden="true"><g transform="rotate(${angle} 24 76)"><circle cx="24" cy="76" r="26" fill="#14120f" stroke="#fff3ba" stroke-width="4"/><path d="M24 76V10M10 26L24 10L38 26" fill="none" stroke="#14120f" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 76V10M10 26L24 10L38 26" fill="none" stroke="#fff3ba" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g><path d="M18 91V76Q18 68 24 68Q30 68 30 76V88L35 85Q39 83 43 87L50 94L46 110H20L7 97Q3 90 9 89Q13 88 18 94Z" fill="#fff3ba" stroke="#14120f" stroke-width="3" stroke-linejoin="round"/></svg>`;
  }


  // 印の先は本人の頭上へ固定し、札をよけても相手を見失わせない。
  drawPersonSign(g, x, y, talk = false) {
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    g.beginPath();
    if (talk) {
      g.arc(0, -47, 8, 0, Math.PI * 2);
      g.moveTo(-16, -17); g.lineTo(-16, -30);
      g.quadraticCurveTo(-16, -37, 0, -37);
      g.quadraticCurveTo(16, -37, 16, -30);
      g.lineTo(16, -17); g.lineTo(9, -17); g.lineTo(9, -3);
      g.lineTo(2, -3); g.lineTo(0, -15); g.lineTo(-2, -3);
      g.lineTo(-9, -3); g.lineTo(-9, -17); g.closePath();
    } else {
      g.moveTo(-17, -42); g.lineTo(17, -42); g.lineTo(17, -24);
      g.quadraticCurveTo(17, -10, 0, -3); g.quadraticCurveTo(-17, -10, -17, -24); g.closePath();
    }
    g.fillStyle = '#fff3ba'; g.strokeStyle = '#14120f'; g.lineWidth = 6; g.stroke(); g.fill();
    g.restore();
  }


  // 救援は盾や手当ての十字と区別できる手の形で示す。
  drawRescueHand(g, x, y) {
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-14, -4); g.lineTo(-27, -22);
    g.quadraticCurveTo(-31, -30, -23, -30); g.lineTo(-14, -21);
    g.lineTo(-14, -45); g.quadraticCurveTo(-14, -53, -7, -49);
    g.lineTo(-7, -33); g.lineTo(-7, -54); g.quadraticCurveTo(-3, -61, 2, -54);
    g.lineTo(2, -33); g.lineTo(2, -50); g.quadraticCurveTo(8, -57, 11, -49);
    g.lineTo(11, -30); g.lineTo(11, -41); g.quadraticCurveTo(18, -47, 19, -38);
    g.lineTo(19, -19); g.lineTo(12, -4); g.closePath();
    g.strokeStyle = '#14120f'; g.lineWidth = 7; g.stroke();
    g.fillStyle = '#fff3ba'; g.fill(); g.restore();
  }


  // 端の矢印を下の命の札などに重ねない。札の上へ逃がす。
  liftAboveLowHud(x, y, top) {
    for (const r of this.hudRects()) if (r.top > VIEW.h / 2 && x + 44 > r.left && x - 44 < r.right && y + 40 > r.top) y = Math.max(top, r.top - 48);
    return y;
  }


  // 行き先が画面外でも、端から余白を取り、同じ太い矢印で向きを保つ。
  drawOffscreenDirection(g, rt, pos, destination = false) {
    const p = destination === 'person' ? rt.camera.position : rt.player.u.pos, W = VIEW.w, H = VIEW.h;
    rt.camera.getWorldDirection(this.tmpV);
    const yaw = destination === 'person' ? Math.atan2(this.tmpV.x, this.tmpV.z) : rt.player.yaw + (rt.player.camYawOff || 0);
    const dx = pos.x - p.x, dz = pos.z - p.z;
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    if (Math.hypot(right, forward) < .001) return;
    // 上端の任務札と下端の操作域を避けた長方形へ、向きを保って寄せる。
    const top = Math.min(112, H / 3), bottom = H - 76;
    const centerY = (top + bottom) / 2;
    const scale = Math.min(Math.max(12, W / 2 - 80) / Math.max(.001, Math.abs(right)),
      Math.max(12, (bottom - top) / 2) / Math.max(.001, Math.abs(forward)));
    const x = W / 2 + right * scale, y = centerY - forward * scale;
    if (destination === 'person') {
      // 上の札へ向けず、左右の端で本人のいる側を示す。
      const edgeX = right >= 0 ? W - 64 : 64;
      const spot = this.avoidRects(edgeX, Math.max(180, H * .62), W, H, 'v', null, 42, 100, true);
      const point = this.offscreenGuidePoint || (this.offscreenGuidePoint = { x:0, y:0 });
      point.x = edgeX; point.y = spot ? spot[1] : Math.min(H - 80, Math.max(180, H * .62));
      // 画面外では矢印一つだけにし、画面内の顔と同時に出さない。
      this.drawNavigationArrow(g, edgeX, point.y - 24,
        right >= 0 ? 0 : Math.PI, .45);
      return point;
    }
    if (destination === 'enemy') {
      // 隠れた敵は方向だけ。兵の上へ移動先の旗を重ねない。
      this.drawNavigationArrow(g, x, y, Math.atan2(-forward, right), .65, true);
      return;
    }
    if (destination) {
      this.drawNavigationArrow(g, x, y, Math.atan2(-forward, right));
      const point = this.offscreenGuidePoint || (this.offscreenGuidePoint = { x:0, y:0 });
      point.x = x; point.y = y;
      return point;
    }
    g.save(); g.translate(x, y);
    g.rotate(Math.atan2(-forward, right) - Math.PI / 2);
    g.globalAlpha *= .88; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-8, -8); g.lineTo(0, 12); g.lineTo(8, -8);
    g.strokeStyle = '#14120f'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 2; g.stroke(); g.restore();
  }


  // 味方の案内は煙で消さず、実際の壁と地形で隠す。敵の視認・攻撃の判定には使わない。
  friendlyGuideVisible(rt, point) {
    const camera = rt.camera.position;
    const distance = Math.hypot(point.x - camera.x, point.z - camera.z);
    if (distance > 170 || cameraWallBlocked(rt, camera, point)) return false;
    const steps = Math.max(2, Math.min(24, Math.ceil(distance / 6)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (rt.world.heightAt(camera.x + (point.x - camera.x) * t,
        camera.z + (point.z - camera.z) * t) > camera.y + (point.y - camera.y) * t - .3) return false;
    }
    return true;
  }


  talkPersonVisible(rt, person) {
    if (!person.alive || person.gone || person.camHidden || person.mesh?.visible === false) return false;
    if (sightScreenUnit(rt, person)) return true;
    // 足元が画面の外でも、頭が見えていれば本人の上へ印を残す。
    const point = this.talkHeadPoint || (this.talkHeadPoint = { x:0, y:0, z:0 });
    // 会話相手は現在地で調べ、描画の間引きで止まった頭の骨を参照しない。
    this.tmpV.set(person.pos.x, person.pos.y + (person.mounted ? 3.1 : (person.bodyHeight ?? 1.72) + .12), person.pos.z);
    point.x = this.tmpV.x; point.y = this.tmpV.y; point.z = this.tmpV.z;
    return this.friendlyGuideVisible(rt, point);
  }


  drawTalkGuide(g, rt, person) {
    // 見える時だけ示す相手は、家の向こうを囲まず端の方向印へ戻す。
    const marker = rt.missionGuide?.marker;
    const visible = !marker?.guideVisibleOnly || this.talkPersonVisible(rt, person);
    // 頭が見える時は本人に付け、壁に隠れた時も方向だけは残す。
    const frame = this.measurePersonFrame(person, rt, true);
    const order = $('objectives');
    const onScreen = frame && frame.cx >= 0 && frame.cx <= VIEW.w && frame.top >= 0 && frame.top <= VIEW.h;
    const direction = (!onScreen || !visible) && this.drawOffscreenDirection(g, rt, person.pos, 'person');
    setClass(this.root, 'talk-edge', !!direction);
    setClass(this.root, 'talk-located', !!onScreen && visible);
    if (!onScreen || !visible) {
      setClass(order, 'talk-order', false);
      setClass(this.root, 'travel-guide', true);
      return !!direction;
    }
    // 頭上の札へまとめ、上の任務札に同じ文を残さない。
    setClass(order, 'talk-order', false);
    // 近くでは実際に押せる会話釦へ渡し、近づく札を同時に残さない。
    if (this.root.classList.contains('talk-ready')) {
      this.drawTalkTarget(g, frame, rt, person);
      return true;
    }
    // 一枚の札で、まず近づき、それから話す順番を示す。
    const text = 'この人に近づく';
    const width = Math.min(200 * Math.max(1, S.textScale || 1), VIEW.w / 3), height = 44;
    const spot = this.enemyOrderSpot(frame, width, height, 72);
    const left = spot.x, top = spot.y, cx = left + width / 2;
    g.save(); g.fillStyle = '#14120f'; g.fillRect(left, top, width, height);
    g.strokeStyle = '#fff3ba'; g.lineWidth = 2; g.strokeRect(left, top, width, height);
    g.fillStyle = '#fff3ba'; g.font = `${20 * Math.max(1, S.textScale || 1)}px sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, cx, top + height / 2, width - 20);
    // 本人の太い囲みと頭上の矢印を、一枚の札の下へまとめる。
    this.drawTalkTarget(g, frame, rt, person);
    g.restore();
    setClass(this.root, 'travel-guide', true);
    return true;
  }


  // 始まりの札でも、会話相手と同じ頭上の印を使う。
  drawTalkPerson(g, rt, person, frame = this.measurePersonFrame(person, rt, true)) {
    const marker = rt.missionGuide?.marker;
    if (marker?.guideVisibleOnly && !this.talkPersonVisible(rt, person)) return false;
    if (!frame) return false;
    if (frame.cx < 0 || frame.cx > VIEW.w || frame.top < 0 || frame.top > VIEW.h) return false;
    // 本人の頭上を示す。
    this.drawTalkTarget(g, frame, rt, person);
    return true;
  }


  // 話す釦が出た時も、同じ頭上の印で相手を示す。
  drawTalkFocus(g, frame, rt, person) {
    this.drawTalkTarget(g, frame, rt, person);
  }


  // 遠くでも周りの兵と見分けられる太い囲みを、話す釦が出るまで保つ。
  drawTalkTarget(g, frame, rt, person) {
    this.drawPersonOutline(g, frame, true);
    this.drawPersonSign(g, frame.cx, frame.headY - 6, true);
  }


  // 武器や指物を含めず、頭と足元から本人の位置を測る。
  measurePersonFrame(u, rt, positionOnly = false) {
    // 会話相手は頭の姿勢を使い、位置だけを使う戦でも本人の頭上を保つ。
    positionOnly ||= !!(rt.def.positionFrameGuides || rt.def.positionPersonGuide || rt.def.enemyFrameAtPosition && u.team !== rt.player.u.team);
    const frame = this.personFrame || (this.personFrame = {});
    const W = VIEW.w, H = VIEW.h;
    // 敵は描かれた体の位置を測る。立ち位置だけの推定枠では、踏み込みや
    // 描画の間引きで本人が枠の外へ出る。武器・指物は範囲に含めない。
    if (u.team !== rt.player.u.team && u.human?.root.visible && u.human.bones) {
      const names = this.frameBoneNames || (this.frameBoneNames =
        ['Head', 'Hips', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightLeg', 'RightFoot', 'LeftLeg', 'LeftFoot']);
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity, count = 0;
      let headX = null, headY = null;
      for (const name of names) {
        const bone = u.human.bones[name];
        if (!bone) continue;
        bone.updateWorldMatrix(true, false);
        this.tmpV.setFromMatrixPosition(bone.matrixWorld);
        if (u.mesh) {
          this.tmpV.x += u.pos.x - u.mesh.position.x;
          this.tmpV.y += u.pos.y - u.mesh.position.y;
          this.tmpV.z += u.pos.z - u.mesh.position.z;
        }
        this.tmpV.project(rt.camera);
        if (this.tmpV.z < -1 || this.tmpV.z > 1) return null;
        const x = (this.tmpV.x * .5 + .5) * W, y = (-this.tmpV.y * .5 + .5) * H;
        if (name === 'Head') { headX = x; headY = y; }
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
      }
      if (count >= 3 && bottom > top) {
        const padding = Math.max(4, (bottom - top) * .12);
        frame.left = left - padding; frame.right = right + padding;
        frame.top = top - padding * 1.5; frame.bottom = bottom + padding;
        frame.cx = headX ?? (left + right) / 2; frame.headY = headY === null ? frame.top : headY - padding * 1.5;
        return frame;
      }
    }
    this.tmpV.set(u.pos.x, u.pos.y, u.pos.z).project(rt.camera);
    // 足元だけが手前へ切れても、画面内の頭を端の矢印へ替えない。
    const x = (this.tmpV.x * .5 + .5) * W, bottom = (-this.tmpV.y * .5 + .5) * H;
    const talkTarget = rt.missionGuide?.marker?.guideTalk && rt.missionGuide.marker.guidePerson?.() === u;
    const head = (talkTarget || !positionOnly && !rt.def.personFrameAtPosition) && u.human?.root.visible && u.human.bones?.Head;
    if (head) {
      // 描画を間引いた骨も更新し、会話と戦う相手の印を実際の頭にそろえる。
      head.updateWorldMatrix(true, false);
      head.getWorldPosition(this.tmpV); this.tmpV.y += positionOnly ? .12 : .35;
      // 会話相手の描画を間引いても、頭上の印は現在の本人から離さない。
      if (u.mesh) {
        this.tmpV.x += u.pos.x - u.mesh.position.x;
        this.tmpV.y += u.pos.y - u.mesh.position.y;
        this.tmpV.z += u.pos.z - u.mesh.position.z;
      }
    }
    else this.tmpV.set(u.pos.x, u.pos.y + (u.mounted ? 3.1 : positionOnly || rt.def.bodyHeightGuides ? (u.bodyHeight ?? 1.72) + .12 : 2.1), u.pos.z);
    // 笠まで含めた全身を囲む。頭の骨が低い姿勢でも囲みを縮めない。
    if (talkTarget) this.tmpV.y = Math.max(this.tmpV.y,
      u.pos.y + (u.mounted ? 3.3 : (u.bodyHeight ?? 1.72) + .25));
    this.tmpV.project(rt.camera);
    if (this.tmpV.z < -1 || this.tmpV.z > 1) return null;
    frame.cx = (this.tmpV.x * .5 + .5) * W;
    frame.top = (-this.tmpV.y * .5 + .5) * H;
    // 最小の囲みを広げる前の頭の位置を、矢印用に残す。
    frame.headY = frame.top;
    frame.left = Math.min(x, frame.cx) - 16; frame.right = Math.max(x, frame.cx) + 16;
    frame.bottom = bottom;
    if (talkTarget && bottom > frame.top && bottom - frame.top < 44) {
      const padding = (44 - (bottom - frame.top)) / 2;
      frame.top -= padding; frame.bottom += padding;
    }
    // 会話相手の最小幅を保ち、敵の幅は遠近に合わせる。
    if (talkTarget || u.team !== rt.player.u.team) {
      const half = Math.max(talkTarget ? 14 : 5, Math.min(40, (bottom - frame.top) * .25));
      frame.left = Math.min(x, frame.cx) - half;
      frame.right = Math.max(x, frame.cx) + half;
    }
    return frame;
  }


  // 柱越しに床の印を描かない。視線と柱の当たりは数値だけで調べる。
  floorGoalVisible(rt, point, checkScreen = true) {
    // 床の矢印は画面の外まで延ばしてから切る。壁越しにだけは描かない。
    if (checkScreen ? !sightPoint(rt, point, 170, true, .08) : rt.army.wallBetween(rt.camera.position, -1, point)) return false;
    const a = rt.camera.position, dx = point.x - a.x, dz = point.z - a.z;
    const length2 = dx * dx + dz * dz;
    for (const wall of rt.army.solids || []) {
      if (wall.k !== 'c' || wall.struct && !wall.struct.alive) continue;
      const t = ((wall.x - a.x) * dx + (wall.z - a.z) * dz) / Math.max(.001, length2);
      if (t <= 0 || t >= 1) continue;
      if (Math.hypot(a.x + dx * t - wall.x, a.z + dz * t - wall.z) < wall.r + .2) return false;
    }
    return true;
  }


  // 戦の行き先は旗にそろえ、町と稽古では床の輪を使う。
  drawFloorGoal(g, rt, x, z, arrow = true, radius = .75) {
    const p = rt.player.u.pos, W = VIEW.w, H = VIEW.h;
    const floor = groundAt(rt.world, x, z, p.y);
    const point = this.floorGoalPoint || (this.floorGoalPoint = { x: 0, y: 0, z: 0 });
    point.x = x; point.y = floor; point.z = z;
    if (singleBattleGuide(rt)) return this.drawTargetFootRing(g, rt, point, .65);
    if (!this.floorGoalVisible(rt, point)) return false;
    g.beginPath();
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12;
      const gx = x + Math.cos(angle) * radius, gz = z + Math.sin(angle) * radius;
      const gy = groundAt(rt.world, gx, gz, floor);
      point.x = gx; point.y = gy; point.z = gz;
      if (Math.abs(gy - floor) > .4 || !rt.world.walkable(gx, gz, gy) ||
          i % 6 === 0 && !this.floorGoalVisible(rt, point)) return false;
      this.tmpV.set(gx, gy + .08, gz).project(rt.camera);
      const sx = (this.tmpV.x * .5 + .5) * W, sy = (-this.tmpV.y * .5 + .5) * H;
      if (this.tmpV.z < -1 || this.tmpV.z > 1 || sx < 32 || sx > W - 32 || sy < 100 || sy > H - 28) return false;
      left = Math.min(left, sx); right = Math.max(right, sx);
      top = Math.min(top, sy); bottom = Math.max(bottom, sy);
      if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
    }
    // 持ち場だけでなく、回避・退避の小さな輪も近い視点では巨大になる。
    // 指定の戦では同じ上限を使い、到着の判定と行き先の札は残す。
    if (rt.def.compactFloorGuides && (right - left > W / 3 || bottom - top > H / 3)) return false;
    g.closePath();
    if (rt.def.compactFloorGuides) this.strokeGroundArea(g);
    else {
      g.strokeStyle = '#14120f'; g.lineWidth = rt.def.groundCombatMarkers ? 3 : 9; g.stroke();
      g.strokeStyle = '#fff3ba'; g.lineWidth = rt.def.groundCombatMarkers ? 1.3 : 4; g.stroke();
    }
    if (arrow) {
      this.tmpV.set(x, floor + .08, z).project(rt.camera);
      this.drawDestinationSign(g, (this.tmpV.x * .5 + .5) * W, (-this.tmpV.y * .5 + .5) * H - 6);
    }
    return true;
  }


  // 開口そのものを太い枠で囲み、通れる内側へ矢印を重ねる。
  drawDoorwayFrame(g, rt, frame, arrow = true) {
    const W = VIEW.w, H = VIEW.h, camera = rt.camera;
    let poly = this.doorFramePolyA || (this.doorFramePolyA = new Float64Array(48));
    let next = this.doorFramePolyB || (this.doorFramePolyB = new Float64Array(48));
    for (let i = 0; i < 4; i++) {
      const p = frame[i];
      this.tmpV.set(p.x, p.y, p.z).applyMatrix4(camera.matrixWorldInverse);
      poly[i * 3] = this.tmpV.x; poly[i * 3 + 1] = this.tmpV.y; poly[i * 3 + 2] = this.tmpV.z;
    }
    // 開口の四角形を視点の前後と画面の四辺で切る。
    // 投影した上辺や外接長方形の中央は、閉じた襖の上へはみ出すことがある。
    let count = 4;
    for (let plane = 0; plane < 6; plane++) {
      if (plane === 2) for (let i = 0; i < count; i++) {
        const k = i * 3;
        this.tmpV.set(poly[k], poly[k + 1], poly[k + 2]).applyMatrix4(camera.projectionMatrix);
        poly[k] = (this.tmpV.x * .5 + .5) * W;
        poly[k + 1] = (-this.tmpV.y * .5 + .5) * H; poly[k + 2] = 0;
      }
      const axis = plane < 2 ? 2 : plane < 4 ? 0 : 1;
      const bound = plane === 0 ? -camera.near : plane === 1 ? -camera.far :
        plane === 2 ? 12 : plane === 3 ? W - 12 : plane === 4 ? 64 : H - 24;
      const sign = plane === 0 || plane === 3 || plane === 5 ? -1 : 1;
      let out = 0;
      for (let i = 0; i < count; i++) {
        const a = i * 3, b = ((i + 1) % count) * 3;
        const da = (poly[a + axis] - bound) * sign, db = (poly[b + axis] - bound) * sign;
        if (da >= 0) {
          for (let k = 0; k < 3; k++) next[out * 3 + k] = poly[a + k];
          out++;
        }
        if ((da >= 0) !== (db >= 0)) {
          const t = da / (da - db);
          for (let k = 0; k < 3; k++) next[out * 3 + k] = poly[a + k] + (poly[b + k] - poly[a + k]) * t;
          out++;
        }
      }
      const swap = poly; poly = next; next = swap; count = out;
      if (count < 3) return false;
    }
    const bounds = this.doorwayBounds || (this.doorwayBounds = {});
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity, cx = 0, cy = 0;
    g.save(); g.beginPath();
    for (let i = 0; i < count; i++) {
      const x = poly[i * 3], y = poly[i * 3 + 1];
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y); cx += x; cy += y;
    }
    g.closePath(); g.lineJoin = 'round';
    g.strokeStyle = '#14120f'; g.lineWidth = 10; g.stroke();
    g.strokeStyle = '#fff3ba'; g.lineWidth = 5; g.stroke();
    g.restore();
    bounds.left = left; bounds.right = right; bounds.top = top; bounds.bottom = bottom;
    // 凸形の開口内にある頂点の平均を使い、画面外の上辺へ引かれないようにする。
    bounds.arrowX = cx / count; bounds.arrowY = cy / count;
    // 細い開口でも印を消さず、矢じりを実際の戸口の内側へ置く。
    // 普通の行き先で使う小旗への置き換えを避け、大きな矢印を保つ。
    const scale = 1.25;
    if (arrow) this.drawNavigationArrow(g, bounds.arrowX, Math.min(bottom - 8, bounds.arrowY + 26 * scale),
      Math.PI / 2, scale, true, true);
    this.doorFramePolygon = poly; this.doorFrameCount = count;
    this.placeFrameShown = true;
    return true;
  }


  // 手当ての十字は移動中と到着後で同じ形にする。
  drawTreatmentCross(g, x, y) {
    g.save(); g.lineJoin = 'round';
    g.beginPath(); g.rect(x - 28, y - 68, 56, 56);
    g.fillStyle = '#fff3ba'; g.strokeStyle = '#14120f'; g.lineWidth = 5;
    g.stroke(); g.fill();
    g.beginPath(); g.moveTo(x, y - 58); g.lineTo(x, y - 22);
    g.moveTo(x - 18, y - 40); g.lineTo(x + 18, y - 40);
    g.lineWidth = 4; g.stroke(); g.restore();
  }


  // 丸から旗までの案内は、切れ目や別向きの矢じりを足さず一本にする。
  drawFlagLink(g, fromX, fromY, toX, toY) {
    if (this.rt?.def.footFlagGuides) return false;
    return this.drawSwipeArrow(g, fromX, fromY, toX, toY);
  }
}
