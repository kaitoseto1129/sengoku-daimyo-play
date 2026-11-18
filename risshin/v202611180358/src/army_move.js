import { recoverGround, mountainWay } from './army_local_way.js';
import { groundAt } from './floors.js';
// Army の手法：足と当たり（steer・押し合い・ぶつかり・待つ間の小さな動き）
// （units.js から分けた。中身は元のまま。外の係は今までどおり units.js から import してよい）
import { angleDiff, distToSeg } from './units.js';
import { CollisionGrid } from './collision_grid.js';
import { IDLE } from './units_flags.js';
import { sm } from './units_model.js';
import { terrainFx, uphillAt } from './terrain_tags.js';
import { startWallClimb } from './siege_ladder.js';
import { missileSlow } from './missile.js';
import { INTERIOR_WALLS, interiorBlocked, interiorFollow } from './shironaka.js';
import { yariHolds } from './army_morale.js';
import { bodiesWorkerPush } from './army_bodies_worker.js';
const BW_OUT = { x: 0, z: 0 };

// 敵までの道筋は兵全員で共用し、一コマに一度だけ長さを求める。
// 味方の徒歩どうしの間（m）：押し合いで寄せる柔らかい輪と、体が重ならない固い輪（army_bodies_worker.js も同じ）。
// 11/5 kaito BQ：固い輪は横陣の持ち場の間（0.95m・11/2 Q）より狭くする。広いと体の押し戻しと持ち場への歩みが喧嘩して、列が揺れ続ける
// 浅瀬への回り道（川を渡る時の動き）。深みに阻まれた兵だけ、川に沿って一番近い浅瀬の真ん中へ寄せる
export function fordWay(army, u, want) {
  const W = army.world, d = W?.def;
  if (!d?.streams || !(d.riverCross || d.streams.some((st) => st.fords?.length))) return want;
  const t = army.time;
  if (!(u._fwT > t)) {
    u._fwT = t + 0.5; u._fwOn = false;
    const dx = want.x - u.pos.x, dz = want.z - u.pos.z, l = Math.hypot(dx, dz);
    // 11/18 クラウド（河田の act bot：浅瀬の段の「突撃」から3秒で組5人が一歩も動かない）：岸に立つ兵も、向こう岸の敵へ真っすぐ深みに入れず止まっていた。
    //   水の中の兵だけでなく、行く手の二歩半先が深い岸の兵も浅瀬へ回す
    if (l > 1) {
      const ax = u.pos.x + dx / l * 2.5, az = u.pos.z + dz / l * 2.5, wade = d.wadeDepth ?? 0.85;
      if ((W.waterDepthAt(u.pos.x, u.pos.z) > 0.2 || W.waterDepthAt(ax, az) > 0.2)) {
        if (W.waterFootDepthAt(ax, az, groundAt(W, ax, az, u.pos.y)) > wade) {
          let best = null, bd = 60;
          for (const st of d.streams) for (const f of st.fords || []) { const k = Math.abs(f.x - u.pos.x); if (k < bd && k > (f.w || 8) * 0.35) { bd = k; best = f; } }
          if (best) { const q = u._fwQ || (u._fwQ = { x: 0, z: 0 }); q.x = best.x; q.z = u.pos.z; u._fwOn = true; }
        }
      }
    }
  }
  return u._fwOn ? u._fwQ : want;
}

export const ALLY_SPACE_SOFT = 1.4, ALLY_SPACE_HARD = 0.9;
function guideWay(army) {
  const way = army._guideWay || (army._guideWay = { at: -1 });
  if (way.at === army.time) return way;
  way.at = army.time; way.active = false;
  const p = army.playerUnit, enemy = army.guideWayEnemy;
  if (!p?.alive || !enemy?.alive || enemy.noTarget || enemy.fleeing || enemy.woundOut ||
      !(army.time - army.guideWayAt < 0.3)) return way;
  const dx = enemy.pos.x - p.pos.x, dz = enemy.pos.z - p.pos.z;
  const d2 = dx * dx + dz * dz;
  // 目当ての敵が見える遠さから、目前の控えだけ道を譲る。
  // 敵が遠い間だけ目前の味方が道を塞ぎ続ける境を作らない。
  const reach = 170;
  if (d2 <= 1 || d2 >= reach * reach) return way;
  const distance = Math.sqrt(d2);
  // 遠い敵を追う途中も、手前の味方だけが道を譲る。
  // 一度に動かすのは自分から八歩まで。軍全体を左右へ割らない。
  way.length = Math.min(distance, 8);
  way.fx = dx / distance; way.fz = dz / distance;
  way.x = p.pos.x; way.z = p.pos.z; way.active = true;
  return way;
}

// 束22：逆茂木の「遅くする帯」。army.structs は多いので、struct.band を持つ物（置いた戦だけ）を
// 1コマに一度だけ拾い出して使い回す（army.time が変わった時だけ拾い直す）
function sakamogiBands(army) {
  const bands = army._sakaCache || (army._sakaCache = []);
  if (army._sakaT === army.time) return bands;
  army._sakaT = army.time; bands.length = 0;
  for (const s of army.structs || []) if (s.alive && !s.opened && s.band) bands.push(s);
  return bands;
}

// 先の一点だけだと、斜面の角を飛び越した所を「歩ける」と見誤る。
function slopeWay(world, x, z, dx, dz, y) {
  const lim = (world.def.moveLim || 176) - 0.3;
  for (let i = 1; i <= 5; i++) {
    const px = x + dx * i * 0.2, pz = z + dz * i * 0.2;
    if (Math.abs(px) > lim || Math.abs(pz) > lim) return false;
    if (!world.walkable(px, pz, y)) return false;
    y = groundAt(world, px, pz, y);
  }
  return true;
}

// 迂回・馬の旋回・押し合いで変わった歩みも、次の一歩を場の内に収める。
function fieldSpeed(pos, speed, dt, lim) {
  if (speed > 0) return Math.min(speed, Math.max(0, lim - pos) / dt);
  if (speed < 0) return Math.max(speed, Math.min(0, -lim - pos) / dt);
  return 0;
}

// 建物の内側に残った兵も、縁へ一息で飛ばさず少しずつ押し出す。
// 当たりが重なっても、一度の更新で動かす距離を増やさない。
function collisionPosition(u, x, z, fromX, fromZ, cap) {
  const dx = x - fromX, dz = z - fromZ, d2 = dx * dx + dz * dz;
  // 資材や柵の避け先が欠けた時は、最後の位置を保つ。
  if (!Number.isFinite(d2) || !Number.isFinite(cap) || cap < 0) return;
  // 普段の短い補正では距離を求めない。長い押し戻しだけ上限へ縮める。
  if (d2 <= cap * cap) { u.pos.x = x; u.pos.z = z; return; }
  const k = cap / Math.sqrt(d2);
  u.pos.x = fromX + dx * k; u.pos.z = fromZ + dz * k;
}

// 地形の補正は斬り合い中も短く使い回す。当たりと歩けるかの判定は毎コマのまま。
// 位置が四分の一メートル・向きが約十二度変われば、待ち時間の途中でも調べ直す。
function movementTerrain(army, u, want) {
  const W = army.world, x = u.pos.x, z = u.pos.z;
  const dx = want ? want.x - x : 0, dz = want ? want.z - z : 0;
  const sample = u._moveTerrain || (u._moveTerrain = {});
  const distance = Math.min(u.focusD ?? u.camD ?? 0, u.camD ?? 0);
  const fighting = u.target || u.atk || u.swing || u.bind || u.charging;
  const interval = fighting || distance < 30 ? 0.05 : distance <= 60 ? 0.1 : 0.2;
  const len2 = dx * dx + dz * dz, oldLen2 = sample.dx * sample.dx + sample.dz * sample.dz;
  const dot = dx * sample.dx + dz * sample.dz;
  const turn = (len2 > 1e-6) !== (oldLen2 > 1e-6) || len2 > 1e-6 && (dot <= 0 || dot * dot < len2 * oldLen2 * 0.96);
  const active = u.isPlayer || u.hit ||
    u.stagger > 0 || u.fleeing || u.group?.routed || u.naka || u.climb || u.perch || u.woundOut || u.rearWound;
  if (active || !sample.fx || !(sample.at > army.time) || turn ||
      (x - sample.x) ** 2 + (z - sample.z) ** 2 >= 0.0625 || Math.abs(u.pos.y - sample.y) > 0.1 ||
      sample.interval !== interval || sample.night !== (W.timeKey === 'night') ||
      sample.mounted !== !!u.mounted || (sample.rain > 0.3) !== (W.rainLevel > 0.3) ||
      Math.abs((sample.rain || 0) - (W.rainLevel || 0)) > 0.05 || Math.abs((sample.wet || 0) - (W.wetness || 0)) > 0.05) {
    sample.uphill = want ? uphillAt(W, x, z, dx, dz) : false;
    sample.fx = terrainFx(W, u, x, z, sample.uphill);
    sample.x = x; sample.z = z; sample.y = u.pos.y; sample.dx = dx; sample.dz = dz;
    sample.mounted = !!u.mounted; sample.rain = W.rainLevel; sample.wet = W.wetness;
    sample.interval = interval; sample.night = W.timeKey === 'night';
    const phase = (u.id % 17) * interval / 17;
    sample.at = (Math.floor((army.time + phase + 1e-6) / interval) + 1) * interval - phase;
  }
  return sample;
}

// Army の手法（units.js の class Army に足す）
const FAR_SIDE_ANGLES = [0.87, 1.57, 2.27];

export const ArmyMove = {

  // 遠景もためた時間で跳ばさない。道は使い回し、加減速・旋回と一歩の当たりだけ毎コマ進める。
  advanceFar(u, dt, waiting) {
    if (!(dt > 0)) return;
    const g = u.group, q = u._farWant;
    if (!q || waiting || u.downed || u.pinT > this.time || u.climb || u.perch ||
        u.woundOut || u.rearWound || u.offscreen && g.qualityCombat) {
      u.mv.x = u.mv.z = u.vel.x = u.vel.z = 0; u.moving = 0;
      // K168 11/14 束E：立って待つ遠い兵は押し戻しを通らず、置かれた時から建物・屋敷の中に立ったままだった（有岡の侍町・岐阜・高遠で開戦から）。
      //   一秒に一度だけ足もとを見て、壁の内なら外へ押し出す（毎コマは見ない）
      if (this.solids?.length && !u.climb && !u.perch && this.time >= (u._farSolidT || 0)) {
        u._farSolidT = this.time + 0.8 + (u.id % 5) * 0.08;
        if (this.solidBlocked(u, u.pos.x, u.pos.z)) { for (let i = 0; i < 6 && this.solidBlocked(u, u.pos.x, u.pos.z); i++) { u._cpx = undefined; this.collide(u, 0.1); } if (this.solidBlocked(u, u.pos.x, u.pos.z)) this.solidEscape(u); }
      }
      u._cpx = u.pos.x; u._cpz = u.pos.z;
      return;
    }
    const fx0 = u.pos.x, fz0 = u.pos.z;
    const dx = q.x - u.pos.x, dz = q.z - u.pos.z, d = Math.hypot(dx, dz);
    const speed = Math.min(g.speed || u.speed, d * 1.5);
    if (d > 0.05) this.turn(u, Math.atan2(dx, dz), dt, u.mounted ? 2.4 : 5);
    const vx = d > 0.05 ? dx / d * speed : 0, vz = d > 0.05 ? dz / d * speed : 0;
    const ex = vx - u.mv.x, ez = vz - u.mv.z, length = Math.hypot(ex, ez);
    const accelerating = speed > Math.hypot(u.mv.x, u.mv.z);
    const acc = (u.mounted ? accelerating ? (u.charging ? 6.5 : 3.4) : 5 : accelerating ? 5.5 : 8) * dt;
    const k = length > acc ? acc / length : 1;
    u.mv.x += ex * k; u.mv.z += ez * k;
    const lim = (this.world.def.moveLim || 176) - 0.3;
    u.vel.x = fieldSpeed(u.pos.x, u.mv.x, dt, lim); u.vel.z = fieldSpeed(u.pos.z, u.mv.z, dt, lim);
    const step = u._farStep || (u._farStep = { x: 0, z: 0 });
    step.x = u.pos.x + u.vel.x * dt; step.z = u.pos.z + u.vel.z * dt;
    // 11/11 すり抜け禁止（docs/kaito_no_clip_1110.md）：遠い兵も建物・置き物・板塀（army.solids）へ入らない。
    //   前は柵の線（structs）しか見ず、箕作で遠い兵が屋敷の中や塀の線の上を歩いていた。塞がれたら軸ごとに滑らせる
    //   11/11 あ：一歩が長い時は途中（半ば）も見る（薄い壁を一歩で跳び越えていた）。壁の幅の内に居る者が奥へ進む一歩も止める（押し戻しは下の collide）
    if ((u.vel.x || u.vel.z) && this.solids?.length) {
      // 今居る所が塞がれているかは、一歩が塞がれた時だけ見る（毎コマ全員が一度多く引いていた）
      const mx = (u.pos.x + step.x) / 2, mz = (u.pos.z + step.z) / 2;
      if (this.solidBlocked(u, step.x, step.z) || this.solidBlocked(u, mx, mz)) {
        // 11/17 クラウド kaito2：ここで家の中の遠い兵を押し出す直しを入れたが、箕作の act bot が時間切れ続き（外すと 1056秒で達成）になったので戻した
        if (this.solidBlocked(u, u.pos.x, u.pos.z)) step.x = NaN;
        else if (u.vel.x && !this.solidBlocked(u, step.x, u.pos.z) && !this.solidBlocked(u, (u.pos.x + step.x) / 2, u.pos.z)) step.z = u.pos.z;
        else if (u.vel.z && !this.solidBlocked(u, u.pos.x, step.z) && !this.solidBlocked(u, u.pos.x, (u.pos.z + step.z) / 2)) step.x = u.pos.x;
        else step.x = NaN;
      }
    }
    const wanted = (u.vel.x || u.vel.z) && d > 1.6;
    if ((u.vel.x || u.vel.z) && step.x === step.x && this.world.walkable(step.x, step.z) && !this.wallBetween(u.pos, -1, step)) {
      u.pos.x = step.x; u.pos.z = step.z;
      u.pos.y = groundAt(this.world, step.x, step.z, u.pos.y);
      u._farBlockT = 0;
    } else if (wanted && this.farSidestep(u, dx / d, dz / d, Math.max(speed, 1.2), dt, step)) {
      // 11/14 クラウドか K294：建物・幕・柵の角で真っすぐも縦横の滑りも塞がれた遠い兵は、横へ回り込む（桶狭間の今川勢が (101,38) で20秒以上立ち尽くした）
      u.pos.x = step.x; u.pos.z = step.z;
      u.pos.y = groundAt(this.world, step.x, step.z, u.pos.y);
    } else if (wanted && this.farUnstick(u, Math.max(speed, 1.2), dt, step)) {
      // 11/15 クラウドさ K302：押し合いで切岸・急な坂（歩けない所）の上へ出た遠い兵は、どの向きの一歩も「歩けない」で塞がれ、
      //   稲葉山の搦手で味方の新手・信長の本陣の兵が (8,33)(16,32) に20秒以上立ち尽くした（11回）→ 一番近い歩ける所へ降りる
      u.pos.x = step.x; u.pos.z = step.z;
      u.pos.y = groundAt(this.world, step.x, step.z, u.pos.y);
    } else u.mv.x = u.mv.z = u.vel.x = u.vel.z = 0;
    // 置かれた所や押し合いで既に壁・襖の幅の内に立つ遠い兵は、近い兵と同じ押し戻しで外へ出す（線の上を行き来させない）
    //   11/17 K168：遠い兵は collide を毎コマ通らず、前の位置（_cpx）が古い。古いままだと「跨いだら戻す」が何m も前の位置へ飛ばすので、このコマの始めの位置を渡す
    if (this.solids?.length && this.solidBlocked(u, u.pos.x, u.pos.z)) { u._cpx = fx0; u._cpz = fz0; this.collide(u, dt); }
    // 11/17 K168 クラウド kaito2：柵・塀の線（army.structs）の体の幅の内に立つ遠い兵も押し戻す（天王寺岡山で遠い兵が柵の線の上をなぞって歩き、線を跨いでいた）
    else if (this.structs?.length && this.structNear(u, u.pos.x, u.pos.z)) { u._cpx = fx0; u._cpz = fz0; this.collide(u, dt); }
    // 遠い兵の「前の位置」もコマごとに新しくしておく（近くへ戻った最初のコマで、古い位置へ「跨いだら戻す」が柵の向こうへ飛ばしていた）
    u._cpx = u.pos.x; u._cpz = u.pos.z;
    u.moving = Math.min(1, Math.hypot(u.mv.x, u.mv.z) / 2.4);
  },

  // 建物・置き物（army.solids）の内から押し戻しで出られない者を、近い空いた歩ける所（0.5〜10m・12の向き）へ置き直す。見つからなければ動かさない
  //   to を渡した時は、そこ（組の持ち場）との間に建物・陣幕の線を挟まない所だけを選ぶ（囲みの内から持ち場の側へ出す。囲みを越える一跳びは置き直し＝warpedOnce）
  solidEscape(u, to = null) {
    const W = this.world;
    for (let r = 0.5; r <= 10; r += 0.5) {
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6, x = u.pos.x + Math.sin(a) * r, z = u.pos.z + Math.cos(a) * r;
        if (!W.walkable(x, z) || this.solidBlocked(u, x, z)) continue;
        if (to ? this.solidCrossed(u, x, z, to.x, to.z) || this.wallBetween({ x, z }, -1, to) : this.wallBetween(u.pos, -1, { x, z })) continue;
        u.pos.x = x; u.pos.z = z; u.pos.y = groundAt(W, x, z, u.pos.y); u._cpx = undefined; u.warpedOnce = true;
        if (u.mesh) u.mesh.position.copy(u.pos);
        return true;
      }
    }
    return false;
  },

  // (x, z) が柵・塀の線（army.structs）の体の幅（0.45m）の内なら true。区画の表で引く（new しない）
  structNear(u, x, z) {
    const SG = this.structCollision || (this.structCollision = new CollisionGrid());
    SG.update(this.structs, this.time, true);
    const y = u.pos.y;
    for (const id of SG.query(x, z)) {
      const s = this.structs[id];
      if (!s.alive || !s.seg || s.opened || (s.yTop != null && y >= s.yTop - .05)) continue;
      const [ax, az, bx, bz] = s.seg, dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if ((x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2 < 0.2025) return true;
    }
    return false;
  },

  // 遠い兵の足もとが歩けない所（切岸・急な坂）か建物の内の時だけ：近い歩ける所（1〜10m・12の向き、行き先に近い物を先に）を探し、そこへ一歩出る。
  //   壁・置き物は越えない。探しは 0.5 秒に一度まで、見つけた所は着くまで覚える。歩ける所に立っていれば何もしない（false）
  farUnstick(u, speed, dt, step) {
    const W = this.world;
    const inSolid = this.solids?.length && this.solidBlocked(u, u.pos.x, u.pos.z);
    if (W.walkable(u.pos.x, u.pos.z) && !inSolid) { u._farEsc = null; return false; }
    let e = u._farEsc;
    if (!e && !(u._farEscAt > this.time)) {
      u._farEscAt = this.time + 0.5;
      const q = u._farWant;
      for (let r = 1; r <= 10 && !e; r++) {
        let best = Infinity;
        for (let i = 0; i < 12; i++) {
          const a = i * Math.PI / 6, x = u.pos.x + Math.sin(a) * r, z = u.pos.z + Math.cos(a) * r;
          if (!W.walkable(x, z) || this.solids?.length && this.solidBlocked(u, x, z) || !inSolid && this.wallBetween(u.pos, -1, { x, z })) continue;
          const d = q ? Math.hypot(q.x - x, q.z - z) : 0;
          if (d < best) { best = d; e = u._farEsc = { x, z }; }
        }
      }
    }
    if (!e) return false;
    const dx = e.x - u.pos.x, dz = e.z - u.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.1) { u._farEsc = null; return false; }
    const s = Math.min(d, speed * dt);
    step.x = u.pos.x + dx / d * s; step.z = u.pos.z + dz / d * s;
    if (!inSolid && (this.solids?.length && this.solidBlocked(u, step.x, step.z) || this.wallBetween(u.pos, -1, step))) { u._farEsc = null; return false; }
    u.vel.x = u.mv.x = dx / d * speed; u.vel.z = u.mv.z = dz / d * speed;
    return true;
  },

  // 遠い兵の回り込み：行き先の向き (fx,fz) から左右どちらか一方へ 50°・90°・130° の順に一歩を試す。
  //   塞がれ続けたら 4 秒ごとに回る側を替える（角の両側を順に探す）。通れる一歩が見つかれば step に入れて true
  farSidestep(u, fx, fz, speed, dt, step) {
    u._farBlockT = (u._farBlockT || 0) + dt;
    if (!u._farSide) u._farSide = u.id % 2 ? 1 : -1;
    if (u._farBlockT > 4) { u._farBlockT = 0; u._farSide = -u._farSide; }
    // 毎コマの探しは重い：前に通れた向きを先に一つだけ試し、全部を探すのは 0.3 秒に一度まで
    const s = speed * dt, side = u._farSide, last = u._farSideA;
    const full = !(u._farTryAt > this.time);
    if (full) u._farTryAt = this.time + 0.3;
    for (const a of FAR_SIDE_ANGLES) {
      if (!full && a !== last) continue;
      const c = Math.cos(a * side), n = Math.sin(a * side);
      const vx = fx * c + fz * n, vz = -fx * n + fz * c;
      const x = u.pos.x + vx * s, z = u.pos.z + vz * s;
      if (this.solids?.length && (this.solidBlocked(u, x, z) || this.solidBlocked(u, (u.pos.x + x) / 2, (u.pos.z + z) / 2))) continue;
      step.x = x; step.z = z;
      if (!this.world.walkable(x, z) || this.wallBetween(u.pos, -1, step)) continue;
      u.vel.x = u.mv.x = vx * speed; u.vel.z = u.mv.z = vz * speed;
      u._farSideA = a;
      return true;
    }
    if (full) u._farSideA = undefined;
    return false;
  },

  // 口の数え（army.chokes ＝ [{ a, b, w }]：口の両端 a・b と幅 w）。一つの口につき一コマに一度だけ数える
  //   芯（口の中ほど、両端の線から 2.5m）の人数 core と、口の前後（8m）の人数 queue を数えておく
  gateStat(ch) {
    if (ch._t === this.time) return ch;
    ch._t = this.time;
    const dx = ch.b.x - ch.a.x, dz = ch.b.z - ch.a.z, len = Math.hypot(dx, dz) || 1;
    const tx = dx / len, tz = dz / len, nx = -tz, nz = tx;
    let core = 0, queueA = 0, queueB = 0;
    this.forNear((ch.a.x + ch.b.x) / 2, (ch.a.z + ch.b.z) / 2, len / 2 + 9, (o) => {
      if (!o.alive || o.isStruct) return;
      const px = o.pos.x - ch.a.x, pz = o.pos.z - ch.a.z;
      const s = px * tx + pz * tz, r = px * nx + pz * nz;
      if (s < -1.5 || s > len + 1.5) return;
      if (Math.abs(r) < 2.5) core++;
      if (Math.abs(r) < 8) { if (r >= 0) queueA++; else queueB++; }
    });
    // maxFlow（tsumari.js・束20）があればそれを芯の定員に使う。無い口は今まで通り幅から出す
    ch._cap = ch.maxFlow != null ? Math.max(1, ch.maxFlow) : Math.max(1, ch.w * 0.7);   // 幅 5m の口で一秒に 3〜4 人
    ch._core = core; ch._queueA = queueA; ch._queueB = queueB;
    return ch;
  },

  // ある兵が口の混みに掛かっているか（芯にいれば通す数を絞り、前後で 5m升に 8 人を超えて集まれば向きを変える速さも落ちる）
  gateFactor(u) {
    let spd = 1, rate = 1;
    for (const ch of this.chokes) {
      const dx = ch.b.x - ch.a.x, dz = ch.b.z - ch.a.z, len = Math.hypot(dx, dz) || 1;
      const tx = dx / len, tz = dz / len, nx = -tz, nz = tx;
      const px = u.pos.x - ch.a.x, pz = u.pos.z - ch.a.z;
      const s = px * tx + pz * tz, r = px * nx + pz * nz;
      if (s < -1.5 || s > len + 1.5 || Math.abs(r) > 9) continue;
      // 閉じた門の狭さは攻め手が詰まるためのもの。門の持ち主（守り手）が自分の門を通って退く時は詰まらせない
      if (ch.team != null && u.team === ch.team) continue;
      this.gateStat(ch);
      if (Math.abs(r) < 2.5 && ch._core > ch._cap) spd = Math.min(spd, ch._cap / ch._core);
      const queue = r >= 0 ? ch._queueA : ch._queueB;
      if (queue > 8) {
        const over = queue - 8;
        rate = Math.min(rate, Math.max(0.3, 1 - over / 14));
        spd = Math.min(spd, Math.max(0.4, 1 - over / 20));
      }
    }
    if (spd === 1 && rate === 1) return null;
    const result = u._gateFactor || (u._gateFactor = { spd: 1, rate: 1 });
    result.spd = spd; result.rate = rate; return result;
  },

  // 竪堀（束21）：斜面を横に進む兵が竪堀の縁に当たって二秒ほど進めない時、竪堀の上か下の近い端の先へ
  // 隊の行き先を一度だけ置き直す（端を回ったら元の行き先へ戻す）。竪堀の無い戦・城の道の網（castleRoute）の無い戦は何もしない
  // 11/18 クラウド kaito2：u から want への筋を塞ぐ柵・塀（army.structs の線）を見つけ、つながった線を辿って両方の端（口）を探し、
  //   近回りになる方の端の先 1.6m を回り道の点にする（S.wp・八秒まで）。止まって二秒の時だけ呼ぶ（毎コマは見ない）
  fenceGap(u, want, S) {
    const st = this.structs;
    if (!st || !st.length || u.climb || u.perch) return false;
    const ax = u.pos.x, az = u.pos.z, bx = want.x, bz = want.z, rX = bx - ax, rZ = bz - az, y = u.pos.y;
    const live = (o) => o.alive !== false && !o.opened && o.seg && !(o.yTop != null && y >= o.yTop - .05);
    let hit = null, best = 2;
    for (const o of st) {
      if (!live(o)) continue;
      const [cx, cz, dx, dz] = o.seg, sX = dx - cx, sZ = dz - cz, den = rX * sZ - rZ * sX;
      if (Math.abs(den) < 1e-9) continue;
      const qx = cx - ax, qz = cz - az, t = (qx * sZ - qz * sX) / den, v = (qx * rZ - qz * rX) / den;
      if (t >= 0 && t <= 1 && v >= -0.02 && v <= 1.02 && t < best) { best = t; hit = o; }
    }
    if (!hit) return false;
    const W = this.world;
    const end = (i) => {
      let cur = hit, ex = hit.seg[i * 2], ez = hit.seg[i * 2 + 1], px = hit.seg[2 - i * 2], pz = hit.seg[3 - i * 2];
      for (let h = 0; h < 40; h++) {
        let nxt = null, ni = 0;
        for (const o of st) {
          if (o === cur || !live(o)) continue;
          if (Math.hypot(o.seg[0] - ex, o.seg[1] - ez) < 0.6) { nxt = o; ni = 1; break; }
          if (Math.hypot(o.seg[2] - ex, o.seg[3] - ez) < 0.6) { nxt = o; ni = 0; break; }
        }
        if (!nxt) break;
        px = ex; pz = ez; ex = nxt.seg[ni * 2]; ez = nxt.seg[ni * 2 + 1]; cur = nxt;
      }
      const l = Math.hypot(ex - px, ez - pz) || 1;
      return { x: ex + (ex - px) / l * 1.6, z: ez + (ez - pz) / l * 1.6 };
    };
    let pick = null, cost = Infinity;
    for (const p of [end(0), end(1)]) {
      if (!W.walkable(p.x, p.z)) continue;
      const c = Math.hypot(p.x - ax, p.z - az) + Math.hypot(bx - p.x, bz - p.z);
      if (c < cost && c < 160) { cost = c; pick = p; }
    }
    if (!pick) return false;
    S.wp = pick; S.wpT = 8;
    this.fenceGapN = (this.fenceGapN || 0) + 1;
    return true;
  },

  // 11/18 夜50-48 K341①：u から want への筋の 4m 内を建物・置き物（army.solids）が塞いでいたら、その箱の角（体の幅＋0.8m 外）のうち
  //   u から見通せて近回りになる所を回り道の点にする（S.wp・六秒まで）。止まって二秒の時だけ呼ぶ（毎コマは見ない）
  solidGap(u, want, S) {
    const SO = this.solids;
    if (!SO || !SO.length || u.climb || u.perch) return false;
    const ax = u.pos.x, az = u.pos.z, d = Math.hypot(want.x - ax, want.z - az);
    if (d < 1.5) return false;
    const fx = (want.x - ax) / d, fz = (want.z - az) / d;
    let w = null;
    for (let t = 0.4; t <= Math.min(4, d) && !w; t += 0.4) w = this.solidAt(u, ax + fx * t, az + fz * t);
    if (!w) return false;
    const rr = u.mounted ? 0.7 : 0.45, m = rr + 0.8, W = this.world, pts = [];
    if (w.k === 'r') {
      for (const [lx, lz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const px = lx * (w.hw + m), pz = lz * (w.hd + m); pts.push(w.x + px * w.c + pz * w.s, w.z - px * w.s + pz * w.c); }
    } else if (w.k === 'c') {
      const a0 = Math.atan2(ax - w.x, az - w.z);
      for (const da of [1.2, -1.2, 2, -2]) pts.push(w.x + Math.sin(a0 + da) * (w.r + m), w.z + Math.cos(a0 + da) * (w.r + m));
    } else {
      const sx = w.bx - w.ax, sz = w.bz - w.az, sl = Math.hypot(sx, sz) || 1, e = w.r + m;
      pts.push(w.ax - sx / sl * e, w.az - sz / sl * e, w.bx + sx / sl * e, w.bz + sz / sl * e);
    }
    const seen = (x, z) => {
      const l = Math.hypot(x - ax, z - az);
      for (let t = 0.4; t < l; t += 0.5) if (this.solidAt(u, ax + (x - ax) * t / l, az + (z - az) * t / l)) return false;
      return true;
    };
    let pick = null, cost = Infinity, alt = null, altCost = Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1];
      if (!W.walkable(x, z, u.pos.y) || this.solidAt(u, x, z) || this.wallBetween(u.pos, -1, { x, z })) continue;
      const c = Math.hypot(x - ax, z - az) + Math.hypot(want.x - x, want.z - z);
      if (c > d + 60) continue;
      if (seen(x, z)) { if (c < cost) { cost = c; pick = { x, z }; } }
      else if (c < altCost) { altCost = c; alt = { x, z }; }
    }
    // 見通せる角が無い時（長い棟の向こう側の角だけ）は、近回りの角へ向かい、着いてから次の角を選び直す
    pick = pick || alt;
    if (!pick) return false;
    S.wp = pick; S.wpT = 6; S.wpSolid = w;
    this.solidGapN = (this.solidGapN || 0) + 1;
    return true;
  },

  tateDetour(u, want, g) {
    const wd = this.world && this.world.def;
    if (!wd || !wd.castleRoute || !wd.tateLines || !wd.tateLines.length || !g || g.isPlayerSquad || g._tateRe) return false;
    for (const L of wd.tateLines) {
      const P = L.pts, n = P.length;
      for (let i = 0; i < n - 1; i++) {
        const [ax, az] = P[i], [bx, bz] = P[i + 1];
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
        const t = Math.max(0, Math.min(1, ((u.pos.x - ax) * dx + (u.pos.z - az) * dz) / L2));
        const ex = u.pos.x - (ax + dx * t), ez = u.pos.z - (az + dz * t);
        if (Math.hypot(ex, ez) > L.w / 2 + 2.2) continue;
        // 行き先が竪堀の向こう側（線の左右が入れ替わる）の時だけ回る
        const side = (p) => Math.sign(dx * (p.z - az) - dz * (p.x - ax));
        if (side(u.pos) === side(want)) continue;
        // 線の上の端と下の端（高い方が上）。近い方の先 4m へ
        const [sx, sz] = P[0], [tx, tz] = P[n - 1];
        const ds = Math.hypot(u.pos.x - sx, u.pos.z - sz), dtn = Math.hypot(u.pos.x - tx, u.pos.z - tz);
        const [kx, kz, ox, oz] = ds < dtn ? [sx, sz, P[1][0], P[1][1]] : [tx, tz, P[n - 2][0], P[n - 2][1]];
        const ol = Math.hypot(kx - ox, kz - oz) || 1;
        const pt = { x: kx + (kx - ox) / ol * (L.w / 2 + 4), z: kz + (kz - oz) / ol * (L.w / 2 + 4) };
        if (g.order === 'path' && g.path) { g._tatePath = g.path; g._tateIdx = g.pathIdx || 0; g.path.splice(g._tateIdx, 0, [pt.x, pt.z]); }
        else if (g.order === 'move' && g.dest) {
          const back = g.dest, after = g.onArrive;
          g.dest = pt; g._tateDest = pt;
          // 端を回ったら元の行き先へ（その間に別の下知で行き先が変わっていれば、何もしない）
          g.onArrive = (gg) => { if (gg.dest === pt && gg.order === 'move') { gg.dest = back; gg.onArrive = after; gg._tateRe = false; } };
        } else return false;
        g._tateRe = true;
        this.tateN = (this.tateN || 0) + 1;
        return true;
      }
    }
    return false;
  },

  // 深みを横切る行き先なら、近い浅瀬へ回る。行き先の入れ物は兵ごとに使い回す。
  riverDetour(u, want) {
    const W = this.world;
    if (!want || u.isPlayer || !W.def.streams?.length) return want;
    for (const st of W.def.streams) {
      if (!st.fords?.length || !st.pts?.length) continue;
      for (let i = 0; i < st.pts.length - 1; i++) {
        const a = st.pts[i], b = st.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1];
        const side = dx * (u.pos.z - a[1]) - dz * (u.pos.x - a[0]);
        const end = dx * (want.z - a[1]) - dz * (want.x - a[0]);
        if (side * end >= 0) continue;
        const t = side / (side - end), x = u.pos.x + (want.x - u.pos.x) * t, z = u.pos.z + (want.z - u.pos.z) * t;
        const along = ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1);
        if (along < 0 || along > 1 || W.waterFootDepthAt(x, z, groundAt(W, x, z, u.pos.y)) <= (W.def.wadeDepth ?? 0.85)) continue;
        let best = null, distance = Infinity, bankZ = z;
        for (const f of st.fords) {
          // 浅瀬の幅は横方向の半幅。川の折れと縦の距離も含める。
          let fz = z, near = Infinity;
          for (let j = 0; j < st.pts.length - 1; j++) {
            const c = st.pts[j], e = st.pts[j + 1];
            if (f.x < Math.min(c[0], e[0]) || f.x > Math.max(c[0], e[0])) continue;
            const zz = e[0] === c[0] ? (f.z ?? Math.max(Math.min(c[1], e[1]), Math.min(Math.max(c[1], e[1]), u.pos.z))) : c[1] + (e[1] - c[1]) * (f.x - c[0]) / (e[0] - c[0]);
            const d = Math.hypot(f.x - u.pos.x, zz - u.pos.z) + Math.hypot(f.x - want.x, zz - want.z) * 0.3;
            if (d < near) { near = d; fz = zz; }
          }
          if (near < distance) { distance = near; best = f; bankZ = fz; }
        }
        if (!best) continue;
        const pt = u._riverWant || (u._riverWant = { x: 0, z: 0 });
        const radius = u.mounted ? 0.7 : 0.45;
        // 増水を自前で扱う戦では、その浅瀬の水深を使う。平時の上限で岸に止めない。
        const fordDepth = st.fordDepth ?? W.def.wadeDepth ?? 0.85;
        const aligned = Math.abs(u.pos.x - best.x) <= Math.max(0, best.w - radius) &&
          W.waterDepthAt(u.pos.x - radius, bankZ) <= fordDepth && W.waterDepthAt(u.pos.x + radius, bankZ) <= fordDepth;
        // 川の向きに直角な岸へ寄る。縦に流れる川も同じ側を保つ。
        const len = Math.hypot(dx, dz) || 1, nx = -dz / len, nz = dx / len;
        const bank = (aligned ? Math.sign(end) : Math.sign(side)) * (st.w + 4);
        pt.x = aligned ? u.pos.x + nx * bank : best.x + nx * bank;
        pt.z = bankZ + nz * bank;
        return pt;
      }
    }
    return want;
  },

  steer(u, dt, want, speed, face) {
    const orderGroup = u.group;
    // 攻撃の間合いと時計は保ち、手の空いた足だけでもう半歩詰める。
    const foe = u.atk?.target || u.swing?.target || u.target;
    const weapon = u.wpnKind || u.lookWeapon || u.weapon;
    if (!u.isPlayer && !u.mounted && !u.fleeing && !u.combatRetreat && !u.rearWound && !u.woundOut &&
        !u.downed && !u.climb && !u.perch && !u.naka && !u.dragging && !u.dodging && !u.hit &&
        !(u.stagger > 0) && !(u.confused > 0) && !(u.backUntil > this.time) &&
        orderGroup?.order !== 'retreat' && orderGroup?.order !== 'move' && orderGroup?.order !== 'path' &&
        (weapon === 'spear' || weapon === 'sword') && foe?.alive && !foe.isStruct && !foe.isPlayer &&
        !foe.mounted && foe.team !== u.team && Math.abs(foe.pos.y - u.pos.y) < 0.7) {
      const dx = foe.pos.x - u.pos.x, dz = foe.pos.z - u.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 12.25) {
        face = Math.atan2(dx, dz);
        if (!want && speed > 0 && d2 > 1.210001) {
          const d = Math.sqrt(d2), q = u._pressWant || (u._pressWant = { x: 0, z: 0 });
          q.x = foe.pos.x - dx / d * 1.1; q.z = foe.pos.z - dz / d * 1.1;
          want = q; speed = Math.min(speed, 0.9);
        }
      }
    }
    const orderX = orderGroup?.order === 'move' ? orderGroup.dest?.x : orderGroup?.order === 'path' ? orderGroup.path?.[orderGroup.pathIdx]?.[0] : undefined;
    const orderZ = orderGroup?.order === 'move' ? orderGroup.dest?.z : orderGroup?.order === 'path' ? orderGroup.path?.[orderGroup.pathIdx]?.[1] : undefined;
    // 隊や使番の行き先は少しずつ動く。三歩以内の直しで詰まりの時計を消さない。
    // 比べる位置は時計を消した時のものを保ち、行き先が大きく変われば計り直す。
    const destChanged = Number.isFinite(orderX) && Number.isFinite(u._stuckX)
      ? Math.hypot(orderX - u._stuckX, orderZ - u._stuckZ) > 3
      : u._stuckX !== orderX || u._stuckZ !== orderZ;
    if (u._stuckOrder !== orderGroup?.order || destChanged || u._stuckFocus !== orderGroup?.focus) {
      if (u.stk) { u.stk.t = 0; u.stk.d = 0; u.stk.s = 0; u.stk.n = 0; u.stk.bigN = 0; u.stk.x = u.pos.x; u.stk.z = u.pos.z; }
      u._stuckOrder = orderGroup?.order; u._stuckX = orderX; u._stuckZ = orderZ; u._stuckFocus = orderGroup?.focus;
    }
    want = interiorFollow(this.interiorRooms, u, want, this.playerUnit);
    if (want && want === u._innerWay) speed = Math.max(speed, u.speed * 0.7);
    // 梯子を登っている間は歩みで動かさない（siege_ladder.js の updateLadders が高さと位置を進める。docs C3）
    if (u.climb) { u.mv.x = 0; u.mv.z = 0; u.push.x = 0; u.push.z = 0; u.vel.x = 0; u.vel.z = 0; u.moving = 0; return; }
    // 味方の旗持ちは自分から四メートル半あける。押し戻さず、通れる道を歩いて離れる。
    const p = this.playerUnit;
    // 使番は三メートル以内まで寄って下知を伝える。馬の待機距離で行き先を変えない。
    if (p?.alive && u !== p && !u.group?.isRunner && u.team === p.team && (u.stdHeld || u.banner || u.look?.standard || u.uma) && !u.fleeing && !u.target && !u.atk && !u.swing && !u.stdPickup && Math.abs(u.pos.y - p.pos.y) < 3) {
      const dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      const wx = (want ? want.x : u.pos.x) - p.pos.x, wz = (want ? want.z : u.pos.z) - p.pos.z;
      if (d < 3.5 || wx * wx + wz * wz < 20.25) {
        const q = u._flagSpace || (u._flagSpace = { x: 0, z: 0 });
        const x = d > 0.1 ? dx / d : Math.cos(p.heading), z = d > 0.1 ? dz / d : -Math.sin(p.heading);
        q.x = p.pos.x + x * 4.5; q.z = p.pos.z + z * 4.5;
        want = q;
        speed = Math.max(speed, u.speed * 0.6);
      }
    }
    // 真横で重なる控えだけ半歩よける。交戦中の兵・敵・人数・間合いは変えない。
    if (p?.alive && u !== p && u.team === p.team && !u.name && !u.isSub &&
        !u.isStruct && !u.group?.isRunner && !u.target && !u.atk && !u.swing &&
        !u.mounted && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed &&
        !u.climb && !u.perch && !u.naka && !u.dragging && !u.dodging && !u.hit &&
        !(u.stagger > 0) && !(u.confused > 0) && Math.abs(u.pos.y - p.pos.y) < .7) {
      const dx = u.pos.x - p.pos.x, dz = u.pos.z - p.pos.z;
      const distance2 = dx * dx + dz * dz;
      if (distance2 < 1.44) {
        const d = Math.sqrt(distance2), side = u.id % 2 ? 1 : -1;
        const q = u._selfSpace || (u._selfSpace = { x:0, z:0 });
        const nx = d > .1 ? dx / d : Math.cos(p.heading) * side;
        const nz = d > .1 ? dz / d : -Math.sin(p.heading) * side;
        q.x = p.pos.x + nx * 1.5; q.z = p.pos.z + nz * 1.5;
        want = q; speed = Math.max(speed, u.speed * .4);
      }
    }
    // 戦っていない味方だけが目当ての敵への細い道を譲る。両脇の乱戦と攻撃中の足は保つ。
    const way = guideWay(this);
    if (way.active && u !== p && u.team === p.team &&
        Math.abs(u.pos.x - way.x) < 12 && Math.abs(u.pos.z - way.z) < 12 &&
        !u.name && !u.isSub && !u.group?.isRunner && !u.isStruct && !u.mounted &&
        !u.fleeing && !u.woundOut && !u.rearWound && !u.downed && !u.climb && !u.perch &&
        !u.naka && !u.dragging && !u.atk && !u.swing && !u.hit && !(u.stagger > 0) &&
        !(u.confused > 0) && Math.abs(u.pos.y - p.pos.y) < 0.7) {
      const { length, fx, fz } = way;
      const rx = u.pos.x - way.x, rz = u.pos.z - way.z;
      const ahead = rx * fx + rz * fz, side = rx * fz - rz * fx;
      if (ahead > 0 && ahead < length + 1) {
        // 道の左右へ半歩ずつ分かれ、敵の手前にも二歩ほどの空きを残す。
        const end = Math.min(length, Math.max(0, ahead));
        const ex = rx - fx * end, ez = rz - fz * end, distance2 = ex * ex + ez * ez;
        const width = ahead > length - 1.5 ? 1.8 : 1.35;
        const nextSide = want ? (want.x - way.x) * fz - (want.z - way.z) * fx : side;
        const nextAhead = want ? (want.x - way.x) * fx + (want.z - way.z) * fz : ahead;
        if (distance2 < (width + 0.4) ** 2 &&
            (distance2 < width * width || nextAhead > 0 && nextAhead < length + 1 && Math.abs(nextSide) < width)) {
          // 道に掛かった兵だけ間合いを調べる。攻撃できる味方は動かさない。
          let fighting = false;
          if (u.target?.alive) {
            const tx = u.target.pos.x - u.pos.x, tz = u.target.pos.z - u.pos.z;
            const reach = Math.max(5, u.reach + 1);
            fighting = !(tx * tx + tz * tz > reach * reach);
          }
          if (!fighting) {
            const sign = Math.abs(side) > 0.1 ? Math.sign(side) : (u.id % 2 ? 1 : -1);
            const q = u._guideWayWant || (u._guideWayWant = { x: 0, z: 0 });
            q.x = way.x + fx * end + fz * sign * (width + 0.3);
            q.z = way.z + fz * end - fx * sign * (width + 0.3);
            want = q; speed = Math.max(speed, u.speed * 0.6);
          }
        }
      }
    }
    // 道譲りは押す速さだけでなく行き先に残す。兵の更新で押しが消えても列へ戻らない。
    if (u._yieldUntil > this.time && p?.alive && u.team === p.team && !u.isPlayer && !u.climb && !u.downed) {
      const q = u._yieldWant || (u._yieldWant = { x: 0, z: 0 });
      q.x = u._yieldX; q.z = u._yieldZ; want = q; speed = Math.max(speed, u.speed);
    }
    want = mountainWay(this, u, want);
    if (want && want !== u._mountainWant && !u.isPlayer && !u.fleeing && this.world?.def.moveWay) want = this.world.def.moveWay(this, u, want);
    if (want && u.fleeing && this.world?.def.fleeWay) want = this.world.def.fleeWay(this, u, want);
    // 11/17 クラウド K358（川を渡る時の動き）：浅瀬のある川で、行き先へまっすぐ進むと深みに当たる兵は、深みの縁で押し戻され続けて立ち尽くした
    //   （姉川の退く浅井の物見が浅瀬の脇 (21,1)〜(30,-4) で最長289秒）。深みに阻まれたら、川に沿って一番近い浅瀬へ寄ってから渡る。調べは一人0.5秒に一度
    if (want && !u.isPlayer && !u.climb && !u.perch) want = fordWay(this, u, want);
    // 持ち場・追撃・避け足の行き先も場の内へ。位置だけ戻すと外へ歩き続ける。
    const lim = this.world.def.moveLim || 176;
    if (want && (Math.abs(want.x) > lim || Math.abs(want.z) > lim)) {
      const q = u._fieldWant || (u._fieldWant = { x: 0, z: 0 });
      q.x = Math.max(-lim, Math.min(lim, want.x)); q.z = Math.max(-lim, Math.min(lim, want.z));
      want = q;
    }
    want = this.riverDetour(u, want);
    // 敗走・陣形の端・迂回先も、場外へ歩こうとする前に収める。
    // 兵は端から少し内側へ。行き先は隊や相手と共有するので、兵ごとの入れ物を使い回す。
    if (want) {
      const fieldLim = lim - (u.isPlayer ? 0 : 0.3);
      if (Math.abs(want.x) > fieldLim || Math.abs(want.z) > fieldLim) {
        const q = u._fieldWay || (u._fieldWay = { x: 0, z: 0 });
        q.x = Math.max(-fieldLim, Math.min(fieldLim, want.x));
        q.z = Math.max(-fieldLim, Math.min(fieldLim, want.z));
        want = q;
      }
    }
    // 押し合いで切岸へ出た兵を、八歩先へ飛ばさず同じ側の足場へ歩かせる。
    if (!u.isPlayer && !(u._groundCheckAt > this.time)) {
      u._groundCheckAt = this.time + 1;
      u._groundReturn = recoverGround(this, u, false) || null;
    }
    if (u._groundReturn && !this.world.walkable(u.pos.x, u.pos.z, u.pos.y)) {
      want = u._groundReturn; speed = Math.min(u.speed, 2);
    } else u._groundReturn = null;
    const g = u.group, mounted = !!u.mounted;
    const rankLine = g && !g.routed && !g.cav && !(g.cavShare > 0.1) && !g.isGun && !mounted && !u.isPlayer && !u.fleeing && !(u.stagger > 0) && !u.woundOut &&
      (g.formation === 'line' || g.formation === 'yari') && !g.marching;
    // 持ち場を追う兵は隊の歩みに合わせる。遅れた分だけ小さく速める。
    if (rankLine && want && !u.target && !u.atk && !u.swing && !u.confused && !(g.regroupT > 0) && (g.order === 'move' || g.order === 'path' || g.order === 'follow') && g.anchorSpeed > 0.3) {
      const gap = Math.hypot(want.x - u.pos.x, want.z - u.pos.z);
      // 11/18 K365：本人の組が「ついて来い」で六 m より遅れた者は、隊の歩みに縛らず自分の駆け足で追う（小谷の坂・森部で組が二十 m 後ろに残った）
      if (!(g.isPlayerSquad && g.order === 'follow' && gap > 6)) speed = Math.min(speed, g.anchorSpeed + Math.min(0.7, gap * 0.25));
    }
    // 馬の将が徒の供回りを待つ（lord_retinue.js が立てる。11/16 K341⑤）
    if (mounted && u._waitGuardsT > this.time && !u.target && !u.atk && !u.charging && !u.fleeing) speed = Math.min(speed, 2.6);
    let rate = mounted ? 2.4 : u.target && !u.isPlayer ? 3.4 : 5;   // 向きを変えられる速さ（rad/s）。斬り合う間は体の回りを少し重く
    if (u.atk && !u.atk.gun && !u.atk.bow) speed = Math.min(speed, (u.wpnKind || u.lookWeapon) === 'spear' ? 0.35 : 0.6);
    // 地形の種類による速さ・向き変え（M1。タグの無い所＝'open' は今までと同じ）
    if (this.world && this.world.heightAt) {
      const sample = movementTerrain(this, u, want);
      const uphill = sample.uphill, tf = sample.fx;
      u.terrain = tf.tag;
      u._tdef = tf.def; u._tdefHigh = tf.defHigh;   // 切岸の登り・堀の底で受ける損が増える（army_combat の damage。束21）
      if (tf.loose && g) { g.formLoose = this.time; g._looseT = this.time; }   // 陣形が保てない（units_group の slotPos が並びを乱す。束21）
      speed *= tf.spd; rate *= tf.turn;
      if (tf.tire > 0 && want && speed > 0.1 && Math.hypot(u.mv.x, u.mv.z) > 0.2) {
        u.tire = Math.min(3, (u.tire || 0) + tf.tire * dt * (uphill ? 0.06 : 0.03));
      } else u.tire = Math.max(0, (u.tire || 0) - dt * 0.3);
      u._terrainTire = tf.tire;
      if (u.tire > 0 && !(u._sqCatch && g?.isPlayerSquad && g.order === 'follow')) speed *= 1 - Math.min(0.4, u.tire * 0.15);
    }
    // 弓・鉄砲に押された組は足が鈍り、撃ち止んだ直後は一気に寄せる（missile.js）
    if (this.missile && g && !u.isPlayer && g.mp !== undefined) speed *= missileSlow(this, u);
    // 逆茂木の帯：歩兵0.6・騎馬0.25（騎馬は帯の中で突撃を切る。army_think.js が u._bandCut を見る。束22）
    u._bandCut = false;
    if (this.structs && this.structs.length) {
      const bands = sakamogiBands(this);
      for (let i = 0; i < bands.length; i++) {
        const s = bands[i];
        if (distToSeg(u.pos.x, u.pos.z, s.band) < (s.bandR ?? 1.6)) {
          speed *= mounted ? 0.25 : 0.6;
          if (mounted) u._bandCut = true;
          break;
        }
      }
    }
    // 口（army.chokes＝城攻めの段取りが登録する狭い出入り口）の混み合い：口が無い戦は今までどおり
    u._gated = false;
    if (this.chokes && this.chokes.length && u.alive && !u.isPlayer) {
      const gf = this.gateFactor(u);
      if (gf) { rate *= gf.rate; speed *= gf.spd; u._gated = gf.spd < 0.9; }
    }
    // 前が詰まった隊は陣形を崩す（束20-2）。抜けた兵がいなくなって少し経ったら戻す
    if (g) {
      if (u._gated) { g.formLoose = this.time; g._looseT = this.time; }
      else if (g.formLoose != null && this.time - (g._looseT ?? g.formLoose) > 1.5) g.formLoose = null;
    }
    let sp = 0, fx = 0, fz = 0;
    if (want) {
      const dx = want.x - u.pos.x, dz = want.z - u.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-3) {
        fx = dx / d; fz = dz / d;
        // 着く前に足をゆるめる（隊が進んでいれば、その歩みに合わせる）
        const gs = g && g.anchorSpeed > 0.3 ? g.anchorSpeed : 0;
        sp = Math.min(speed, gs + 0.4 + d * (mounted ? 1.0 : 1.5));
        // 引き足：「退け」の隊は、敵が近い（38m）うちは正面を敵に向けたまま下がる（背を見せて走るのは「逃げよ」＝潰走の時）
        // 持ち場へ戻る侍・名のある将は、25m 内の敵に背を見せて歩かない：敵を見たまま後ずさって戻る（台帳 K016・kaito 11/8「戦っている所と違う方へ歩いていく」）
        if (g && !mounted && !u.isPlayer && !u.fleeing && !u.woundOut && !(u.target?.alive) && (u.name || u.type === 'samurai' || u.type === 'busho') && d > 1.2 &&
            g.order !== 'path' && g.order !== 'move' && g.order !== 'flee' && g.order !== 'retreat' && !g.marching && !g.routed && !(g.isPlayerSquad && g.order === 'follow')) {
          if (!(u._awayChkT > this.time)) {
            u._awayChkT = this.time + 0.35 + Math.random() * 0.2;
            const foe = this.nearestEnemy(u, 25, (o) => !o.fleeing && !o.isStruct && !o.civ && Math.abs(o.pos.y - u.pos.y) < 3);
            u._awayFace = foe && (dx * (foe.pos.x - u.pos.x) + dz * (foe.pos.z - u.pos.z)) < -0.3 * d * Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z) ? this.faceTo(u, foe) : null;
          }
        } else u._awayFace = null;
        const awayBack = u._awayFace != null;
        const backStep = g && ((u.rearWound && u.target?.alive) || (g.order === 'retreat' && g._foeNear) || u.backUntil > this.time || awayBack) && !u.fleeing && !mounted && !u.isPlayer;
        if (backStep && d > 1.2) {
          this.turn(u, u.rearWound && u.target?.alive ? this.faceTo(u, u.target) : u.backUntil > this.time ? u.backFace : awayBack ? u._awayFace : g._face ?? g.facing, dt, rate);
          sp = Math.min(sp, u.speed * 0.75);
        } else if (!mounted && !u.isPlayer && !u.fleeing && face != null &&
            (u.target?.alive || u.pressBack || u.combatRetreat)) {
          // 敵を見たまま横へ寄り、後ずさる。歩く先へ体を向け直して穂先を外さない。
          this.turn(u, face, dt, rate);
          if (dx * Math.sin(face) + dz * Math.cos(face) < 0) sp = Math.min(sp, u.speed * 0.75);
        } else if (d > (mounted ? 0.6 : 1.2) || u.fleeing) {
          const hd = Math.atan2(dx, dz);
          this.turn(u, hd, dt, rate);
          const off = Math.abs(angleDiff(u.heading, hd));
          if (mounted) {
            // 馬は横へは歩けない：向いている方へ進み、大きく曲がるときは速さを落とす
            sp *= Math.max(0.3, Math.cos(Math.min(off, 1.3)));
            fx = Math.sin(u.heading); fz = Math.cos(u.heading);
          } else if (off > 1.3) sp *= 0.4;   // 大きく向きを変えるときは、まず向き直る
        } else {
          // 持ち場の少しの直しは、向きを変えずに横へ寄る
          sp = Math.min(sp, mounted ? 1.2 : 1.6);
          this.turn(u, face ?? (g ? g._face ?? g.facing : u.heading), dt, rate * 0.5);
        }
      } else if (face != null) this.turn(u, face, dt, rate * 1.2);
    } else if (face !== null && face !== undefined) this.turn(u, face, dt, rate * 1.2);
    // 詰まり：行き先がまだ遠いのに二秒ほどでほとんど進めなければ、しばらく斜め横へ回り込む
    // （押し合い・前の者の背・柵の角で、足踏みもせずに止まったままにしない）
    const detourMax = sp;
    let detour = false;
    // 川の中でも、止まった列の後ろから回り込める。深みの判定は下の slopeWay が守る。
    if (IDLE.on && want && !u.isPlayer && sp > 0.2) {
      const S = u.stk || (u.stk = { x: u.pos.x, z: u.pos.z, t: 0, d: 0, s: 1 });
      S.t += dt;
      if (S.t > 2) {
        // 11/5 kaito BQ「ぐちゃぐちゃに動き回る」：止まった隊の持ち場の四歩の内では回り込まず、その場で待つ（列の中を横へ縫い歩かない）
        const far = Math.hypot(want.x - u.pos.x, want.z - u.pos.z) > (!u.target?.alive && g && g.anchorSpeed < 0.3 && g.order !== 'move' && g.order !== 'path' ? 4 : 1.5);
        const moved = Math.hypot(u.pos.x - S.x, u.pos.z - S.z);
        if (far && S.d <= 0 && moved < 0.35 && this.tateDetour(u, want, g)) { S.n = 0; }
        // 11/18 クラウド kaito2：行き先との間に柵・塀の線があれば、その柵を辿った先の端（口）へ回る（今福の手勢が矢来の線に向かって二十秒押し続けた）
        else if (far && moved < 0.35 && !S.wp && this.fenceGap(u, want, S)) { S.n = 0; S.d = 0; S.wpSolid = null; }
        // 11/18 夜50-48 K341①：行き先との間の目の前（4m 内）に建物・置き物（army.solids）があれば、その箱の角の先へ回る。
        //   前は柵の線（fenceGap）しか回らず、比叡山の西塔の加勢・味方の新手が堂の壁に向かって押し続け、20秒立ち尽くした（箱の面に真っすぐ当たると滑る向きが無い）
        else if (far && moved < 0.8 && !S.wp && this.solidGap(u, want, S)) { S.n = 0; S.d = 0; }
        else if (far && S.d <= 0 && moved < 0.35) {
          // 三度続けて抜けられない時は、大きく横（やや後ろ）へ回って、別の筋から寄り直す（20 秒立ち尽くさない）
          S.n = (S.n || 0) + 1;
          const big = S.n >= 3;
          if (big) {
            // 大回りが続けて空振りした時だけ向きを変える（毎回逆へ振ると、長い壁ぞいで行ったり来たりして抜けられない）
            S.bigN = (S.bigN || 0) + 1;
            if (S.bigN > 2 || !S.s) { S.s = S.s ? -S.s : (Math.random() < 0.5 ? -1 : 1); S.bigN = 0; }
            S.d = 2.6 + Math.random() + Math.min(5, (S.bigN) * 1.6); S.a = 1.75;
            S.n = 0;
          } else {
            S.d = 1 + Math.random() * 0.8; S.a = 1.1;
            if (!S.s) S.s = Math.random() < 0.5 ? -1 : 1;
          }
        } else if (moved > 0.8) { S.n = 0; S.bigN = 0; }
        S.t = 0; S.x = u.pos.x; S.z = u.pos.z;
      }
      if (S.wp) {
        const wx = S.wp.x - u.pos.x, wz = S.wp.z - u.pos.z, wl = Math.hypot(wx, wz);
        if (wl < 1 || (S.wpT -= dt) <= 0 || !S.wpSolid && !this.wallBetween(u.pos, -1, want)) { S.wp = null; S.wpSolid = null; }
        else {
          fx = wx / wl; fz = wz / wl; detour = true;
          sp = Math.min(detourMax, Math.max(sp, u.speed * 0.8));
          if (mounted) { this.turn(u, Math.atan2(fx, fz), dt, rate); fx = Math.sin(u.heading); fz = Math.cos(u.heading); }
        }
      }
      if (!S.wp && S.d > 0) {
        S.d -= dt; detour = true;
        // 馬の回り先は行き先から決める。今の向きを毎コマ曲げると、その場を回り続ける。
        const dl = mounted ? Math.hypot(want.x - u.pos.x, want.z - u.pos.z) || 1 : 1;
        const bx = mounted ? (want.x - u.pos.x) / dl : fx, bz = mounted ? (want.z - u.pos.z) / dl : fz;
        const aa = (S.a || 1.1) * S.s, c = Math.cos(aa), s = Math.sin(aa), nx = bx * c + bz * s, nz = -bx * s + bz * c;
        fx = nx; fz = nz;
        sp = Math.min(detourMax, Math.max(sp, u.speed * 0.7));
        // 馬も詰まりを抜ける。横滑りさせず、回る方へ向いて進む。
        if (mounted) {
          this.turn(u, Math.atan2(nx, nz), dt, rate);
          fx = Math.sin(u.heading); fz = Math.cos(u.heading);
          sp = Math.min(sp, u.speed);
        }
      }
    } else if (u.stk) { u.stk.t = 0; u.stk.x = u.pos.x; u.stk.z = u.pos.z; }
    // 振りかぶり中は肩を大きく回せない。足と肩の速さを得物で分ける。
    let dvx = fx * sp, dvz = fz * sp;
    // 押し合い（馬は足軽を押しのける）・前の味方が進んでいれば詰まって待つ・立っている味方はよけて通る
    let px = 0, pz = 0, sx = 0, sz = 0, block = 1;
    const queue = !u.target || u.terrain === 'water';   // 隊列で歩くときだけ、前の者に合わせて詰まる（敵へ向かうときは押し合う）
    const r0 = mounted ? 1.25 : Math.max(0.85, this.world.def.meleeBodySpace || 0);
    // 味方の徒歩どうしは肩の間を空ける（kaito 10/24「ひしめき合うのはダメ」：人と人の間 1.2〜1.5m）。敵との間合いは今のまま。
    const r0Ally = mounted ? r0 : Math.max(ALLY_SPACE_SOFT, r0);
    // 槍衾と遊び手は持ち場を保つ。ほかの徒歩の兵は、走る馬の進路から接触前に横へ避ける。
    const dodge = !mounted && !u.isPlayer && !(u.stagger > 0) && !(u.planted > this.time) &&
      !(g && g.formation === 'yari' && (g.order === 'yari' || g.order === 'hold'));
    const rh = g ? g._face ?? g.facing : u.heading, rfx = Math.sin(rh), rfz = Math.cos(rh);
    const spearFx = Math.sin(u.heading), spearFz = Math.cos(u.heading);
    let support = 0, recoil = 0;
    u._lineFront = null;
    u._spearCrowded = false;
    u.spearFront = null; // 既存の近傍調べで、柄の前にいる味方も記録する。移動と当たりは変えない。
    u._contactFront = null;
    let contactFrontD2 = 2.25;
    let hx = 0, hz = 0;
    // 指定した戦だけ、遊び手のそばで味方の肩が重ならない間合いを取る。
    const personal = this.world.def.allyPersonalSpace || 0;
    // 走る馬を避ける 5m の探しは騎馬の一覧だけで行い、升目は押し合い・支えの届く所だけ見る（中身は同じ）。
    // only：1＝徒歩の者だけ・2＝5m の内の騎馬だけ（探しごとに関数を作らない）
    const visit = (o, only) => {
      if (only === 1 ? o.mounted : only === 2 && (!o.mounted || (u.pos.x - o.pos.x) ** 2 + (u.pos.z - o.pos.z) ** 2 > 25)) return;
      if (o === u || !o.alive || o.downed || o.woundOut || Math.abs(u.pos.y - o.pos.y) > 1.8) return;   // 倒れた者は押し合いに入れない（上を歩ける。10/24）
      const dx = u.pos.x - o.pos.x, dz = u.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      // 升には遠い兵も入る。押し合い・後列の支え・馬を避ける範囲の外なら、壁を調べる必要がない。
      if (d2 > (dodge && o.mounted ? 25 : rankLine ? 4.84 : 2.25)) return;
      // wallBetween が城内の壁も調べる。同じ兵の組で二度たどらない。
      if (this.wallBetween(u.pos, -1, o.pos)) return;
      if (dodge && o.mounted && o.mv && d2 < 25 && Math.abs(u.pos.y - o.pos.y) < 2) {
        const hs = Math.hypot(o.mv.x, o.mv.z);
        if (hs > 4.5) {
          const vx = o.mv.x / hs, vz = o.mv.z / hs;
          const ahead = dx * vx + dz * vz, side = dx * vz - dz * vx;
          if (ahead > -0.5 && ahead < Math.min(5, hs * 0.55) && Math.abs(side) < 1.8) {
            const sign = Math.abs(side) > 0.05 ? Math.sign(side) : (u.id % 2 ? 1 : -1);
            const k = sign * (1.8 - Math.abs(side)) * (1 - Math.max(0, ahead) / 6);
            hx += vz * k; hz -= vx * k;
          }
        }
      }
      // 同じ列で実際に背へ寄った後列だけが支える。別の階・壁越しは支えない。
      if (rankLine && o.group === g && !o.mounted && !o.isPlayer && !o.fleeing && !(o.stagger > 0) && !o.woundOut && !o.rearWound && !o.downed && !(o.pinT > this.time) && !o.dropped && !o.dragging && !o.confused && d2 < 4.84 && Math.abs(u.pos.y - o.pos.y) < 0.7) {
        const cols = g._stepCols || 1, row = Math.floor(u.slot / cols), otherRow = Math.floor(o.slot / cols), ahead = -(dx * rfx + dz * rfz), side = Math.abs(dx * rfz - dz * rfx);
        if (side < g.spacing * 0.45 && Math.abs(ahead) > 0.55 && Math.abs(ahead) < 2.2) {
          const contact = Math.max(0, Math.min(1, (2.2 - Math.abs(ahead)) / 1.1));
          if (ahead < -0.55 && otherRow === row + 1) support = Math.max(support, contact * Math.min(1, o.hp / o.maxHp) * (1 - (o.fat || 0) * 0.5));
          else if (ahead > 0.55 && otherRow === row - 1) {
            recoil = Math.max(recoil, Math.min(0.8, o._lineRecoil || 0) * contact * 0.35);
            if (recoil > 0.02 || o.target?.alive) u._lineFront = o;
          }
        }
      }
      if (!mounted && !u.isPlayer && o.team === u.team && Math.abs(u.pos.y - o.pos.y) < 0.7) {
        const ahead = -(dx * spearFx + dz * spearFz), side = Math.abs(dx * spearFz - dz * spearFx);
        if (ahead > 0.3 && ahead < 1.5 && side < 0.65) u.spearFront = o;
      }
      if (d2 > 2.25) return;
      if (d2 < 1e-6) {
        const side = u.id < o.id ? -1 : 1, h = g?._face ?? u.heading;
        px += Math.cos(h) * side * 0.35; pz -= Math.sin(h) * side * 0.35; return;
      }
      // 味方の背へ長柄を寝かせないための見た目用の印。押す力と間合いは保つ。
      if (o.team === u.team && !mounted && !o.mounted && !u.isPlayer && d2 < 2.25) {
        const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
        const ahead = -dx * fx - dz * fz, side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0.2 && side < 0.55) u._spearCrowded = true;
        // 今ある近隣判定で、肩の前にいる味方を一人だけ覚える。移動や当たりには使わない。
        // 列番号を失った乱戦でも、同じ方を向く徒歩の兵へ押し返しの姿勢を渡す。
        if (ahead > 0.45 && side < 0.65 && d2 < contactFrontD2
          && Math.abs(u.pos.y - o.pos.y) < 0.6 && Math.cos(u.heading - o.heading) > 0.7
          && !o.isPlayer && !o.fleeing && !o.downed && !o.woundOut && !o.rearWound
          && !o.dragging && !o.confused && !(o.stagger > 0.7)) {
          u._contactFront = o; contactFrontD2 = d2;
        }
      }
      const d = Math.sqrt(d2);
      const rr = o.mounted ? 1.25 : personal && o.team === u.team &&
        (o.isPlayer || (!u.isPlayer && this.playerUnit &&
          (u.pos.x - this.playerUnit.pos.x) ** 2 + (u.pos.z - this.playerUnit.pos.z) ** 2 < 36)) ? personal :
          // 11/5 kaito BQ「ぐちゃぐちゃに動き回る」：同じ隊の隣は持ち場の間（横 0.95m ほど）で押し合わない。押されて列が揺れ続けないように
          o.team === u.team && !o.isPlayer && !u.isPlayer ? (o.group === g && g && !u.target?.alive ? Math.min(r0Ally, 0.92) : r0Ally) : r0;
      if (d < rr) {
        const k = o.isPlayer ? 5 : o.mounted && !mounted ? 5.5 : mounted && !o.mounted ? 1.1 : 3.2;
        // 駆ける馬に当たった徒歩の者は、突き飛ばされて膝をつき、蹄にかかって傷を負うことがある
        if (u.alive && o.mounted && !mounted && !u.isPlayer && o.team !== u.team && Math.hypot(o.mv.x, o.mv.z) > 4 && !(u.stagger > 0) && Math.random() < dt * 3) {
          this.damage(u, 4, o, { kind: 'charge', pierce: true });
          if (u.alive) u.stagger = Math.max(u.stagger || 0, 0.95);
        }
        const push = (rr - d) * k;
        px += dx / d * push; pz += dz / d * push;
      }
      // 押し合い：斬り合う敵と間近で向き合うと、士気と人数で勝る側が少しずつ押し込む（押し負けた側の列がじわりと下がる）
      if (o.team !== u.team && !u.isPlayer && !o.isPlayer && !mounted && !o.mounted && d < 1.5 && u.group && o.group && !u.fleeing) {
        g._meleeUntil = this.time + 0.35;
        const adv = (o.group.morale - u.group.morale) / 100 + ((o.group._readyCount ?? o.group.count) - (g._readyCount ?? g.count)) / 40 + Math.max(-0.5, Math.min(0.5, o.pos.y - u.pos.y)) * 0.5;
        if (adv > 0.05) { const k = Math.min(0.5, adv) * 0.9; px += dx / d * k; pz += dz / d * k; }
      }
      if (queue && sp > 0.3 && o.team === u.team && d < 1.3 && !o.isPlayer) {
        const ahead = -(dx * fx + dz * fz);
        if (ahead > 0.25) {
          const lat = -dx * fz + dz * fx;
          if (Math.abs(lat) < 0.7) {
            const along = o.mv ? o.mv.x * fx + o.mv.z * fz : 0;
            if (rankLine && along > 0.3 && o.group === g && Math.floor(o.slot / (g._stepCols || 1)) === Math.floor(u.slot / (g._stepCols || 1)) - 1) block = Math.min(block, Math.max(0, (d - 0.85) / 0.45));
            else if (along > 0.3) block = Math.min(block, Math.max(0.15, (d - 0.75) / 0.5));
            else { const s = (lat >= 0 ? -1 : 1) * sp * 0.7 * (1.3 - d); sx += fz * s; sz -= fx * s; }
          }
        }
      }
    };
    // 升目に写した位置で、押し合い・支えの届く所（2.2m か 1.5m）より遠い兵を開かずに落とす。
    const keep = rankLine ? 2.2 : 1.5;
    if (dodge) {
      this.forNearIn(u.pos.x, u.pos.z, mounted ? 1.5 : rankLine ? 2.2 : 1.3, keep, visit, 1);
      // 走る馬を避ける 5m は騎馬の一覧だけをたどる（升目の 5m を全部開かない）。
      const ml = this.mountedList;
      for (let i = 0; i < ml.length; i++) visit(ml[i], 2);
    } else this.forNearIn(u.pos.x, u.pos.z, mounted ? 1.5 : rankLine ? 2.2 : 1.3, keep, visit);
    // 押し返される前列を後列が受ける。力は段ごとに弱まり、無限に増えない。
    if (rankLine) {
      const back = Math.max(0, -(px * rfx + pz * rfz));
      const brace = back * Math.min(0.55, support * 0.55) * Math.max(0.2, Math.min(1, g.morale / 60));
      px += rfx * (brace - recoil); pz += rfz * (brace - recoil);
    }
    // 数騎が重なっても横へ飛ばさず、小さな避け足に留める。
    const hl = Math.hypot(hx, hz), hk = hl > 1.6 ? 1.6 / hl : 1;
    sx += hx * hk; sz += hz * hk;
    if (!detour) { dvx *= block; dvz *= block; }
    // 切岸や川の深みへ直進すると units.js が歩みを毎回ゼロに戻す。
    // 無作為に振るだけでは同じ斜面へ戻るので、歩ける縁に沿って道を探す。
    // 回る側は保ち、道が開けたら元の行き先へ戻す。兵や行き先は増やさない。
    const world = this.world;
    if (want && !u.isPlayer && sp > 0.2 && world &&
      (world.noClimb || world.def.climbTan != null || world.def.riverCross || world.def.streams?.some(st => st.fords?.length))) {
      // 勾配を調べるのは一秒に八回ほど。間のコマは決めた向きを使う。
      if (!(u._slopeCheckT > this.time) || u._slopeDetour !== detour) {
        u._slopeDetour = detour;
        u._slopeCheckT = this.time + 0.12;
        u._slopeX = u._slopeZ = 0;
        const wx = want.x - u.pos.x, wz = want.z - u.pos.z, wd = Math.hypot(wx, wz);
        if (wd > 1.2 && world.walkable(u.pos.x, u.pos.z, u.pos.y)) {
          // 詰まりを抜ける横足・引き足を、元の行き先への直進で上書きしない。
          // 回り込む向きにも同じ深み・切岸の判定を掛ける。
          const nx = detour ? fx : wx / wd, nz = detour ? fz : wz / wd;
          if (!slopeWay(world, u.pos.x, u.pos.z, nx, nz, u.pos.y)) {
            const side = u._slopeSide || (u.id % 2 ? 1 : -1);
            let found = false;
            for (let pass = 0; pass < 2 && !found; pass++) {
              const s = pass ? -side : side;
              for (let a = 0.4; a < 3; a += 0.4) {
                const c = Math.cos(a), sn = Math.sin(a) * s;
                const tx = nx * c - nz * sn, tz = nx * sn + nz * c;
                if (!slopeWay(world, u.pos.x, u.pos.z, tx, tz, u.pos.y)) continue;
                u._slopeX = tx; u._slopeZ = tz; u._slopeSide = s; found = true;
                break;
              }
            }
          } else u._slopeSide = 0;
        }
      }
      if (u._slopeX || u._slopeZ) {
        if (mounted) {
          this.turn(u, Math.atan2(u._slopeX, u._slopeZ), dt, rate);
          const k = Math.min(sp, u.speed);
          dvx = Math.sin(u.heading) * k; dvz = Math.cos(u.heading) * k;
        } else { dvx = u._slopeX * sp; dvz = u._slopeZ * sp; }
      }
    } else {
      u._slopeCheckT = 0; u._slopeSide = 0; u._slopeX = u._slopeZ = 0;
    }
    // 加減速（馬は立ち上がりが遅い）
    const cur = Math.hypot(u.mv.x, u.mv.z), tgt = Math.hypot(dvx, dvz);
    // 突撃の駆け出しは馬の本当の立ち上がり（約6.5m/秒²）。並足の寄せは今まで通りゆっくり
    const acc = (tgt > cur ? (mounted ? (u.charging ? 6.5 : 3.4) : 5.5) : (mounted ? 5 : 8)) * dt;
    const ex = dvx - u.mv.x, ez = dvz - u.mv.z, el = Math.hypot(ex, ez);
    if (el <= acc) { u.mv.x = dvx; u.mv.z = dvz; } else { u.mv.x += ex / el * acc; u.mv.z += ez / el * acc; }
    // 押し合いはならして使う（兵がガクガク揺れないように）
    const pk = 1 - Math.exp(-dt / 0.1);
    u.push.x += (px + sx - u.push.x) * pk; u.push.z += (pz + sz - u.push.z) * pk;
    u.vel.x = u.mv.x + u.push.x; u.vel.z = u.mv.z + u.push.z;
    if (!u.isPlayer) {   // 人と馬の本物の速さを超えない（甲冑の人は約5m/秒・馬は約11.5m/秒まで）
      const vmax = mounted ? 11.5 : Math.min(5.2, (u.run || 4.5) * 1.05), vl = Math.hypot(u.vel.x, u.vel.z);
      if (vl > vmax) { const k = vmax / vl; u.vel.x *= k; u.vel.z *= k; u.mv.x *= k; u.mv.z *= k; u.push.x *= k; u.push.z *= k; }
    }
    if (!u.isPlayer && dt > 0) {
      const fieldLim = lim - 0.3;
      const vx = fieldSpeed(u.pos.x, u.vel.x, dt, fieldLim);
      const vz = fieldSpeed(u.pos.z, u.vel.z, dt, fieldLim);
      // 外へ向かう力を次のコマへ残さず、縁に沿う歩みは保つ。
      if (vx !== u.vel.x) { u.vel.x = u.mv.x = vx; u.push.x = 0; }
      if (vz !== u.vel.z) { u.vel.z = u.mv.z = vz; u.push.z = 0; }
    }
    u.moving = Math.min(1, Math.max(Math.hypot(u.mv.x, u.mv.z), Math.min(1.6, hl)) / 2.4);
  },

  // 味方は駆け出す前から左右へ退く。近い升だけを見て、押す強さは時間でそろえる。
  makeHorseWay(u, speed, dt, heading = u.heading) {
    if (Math.abs(speed) < 0.1) return;
    const sign = speed < 0 ? -1 : 1, fx = Math.sin(heading) * sign, fz = Math.cos(heading) * sign;
    const way = this._horseWay || (this._horseWay = {});
    way.u = u; way.fx = fx; way.fz = fz; way.dt = dt;
    if (!way.visit) way.visit = (o) => {
      const { u, fx, fz, dt } = way;
      if (o === u || !o.alive || o.isPlayer || o.isStruct || o.team !== u.team || !o.push || o.climb || o.downed || o.woundOut || Math.abs(o.pos.y - u.pos.y) > 1.8) return;
      const rx = o.pos.x - u.pos.x, rz = o.pos.z - u.pos.z;
      const ahead = rx * fx + rz * fz, lat = rx * fz - rz * fx, width = o.mounted ? 2 : u.mounted ? 1.45 : 1.15;
      // 徒歩はすぐ前だけを空け、馬の遠くからの道譲りとは広さを分ける。
      if (ahead < (u.mounted ? -0.8 : 0) || ahead > (u.mounted ? 4.2 : 2.6) || Math.abs(lat) >= width) return;
      const side = Math.abs(lat) < 0.05 ? (o.id % 2 ? 1 : -1) : Math.sign(lat);
      const k = Math.min(1, dt * 8), want = side * Math.min(3, (width - Math.abs(lat)) * 3);
      o._yieldUntil = this.time + 0.6;
      o._yieldX = o.pos.x + fz * side * Math.max(0.5, width - Math.abs(lat));
      o._yieldZ = o.pos.z - fx * side * Math.max(0.5, width - Math.abs(lat));
      const now = o.push.x * fz - o.push.z * fx;
      o.push.x += fz * (want - now) * k; o.push.z -= fx * (want - now) * k;
    };
    this.forNear(u.pos.x + fx * 1.5, u.pos.z + fz * 1.5, 3.2, way.visit);
  },

  // 体どうしの当たり：兵と兵（敵味方とも、遊び手も）の体が重ならないよう、めり込んだ分だけ押し戻す（近い升目だけを見る）
  //   徒歩は半径 0.4m の円、馬は前後に長い（首の側と尻の側の二つの円・半径 0.55m）。押し戻す割合は重さで分ける
  bodies(u, dt = 0.016) {
    if (!u.alive || u.type === 'dummy') return;
    const mounted = !!u.mounted, ra = mounted ? .55 : .4;
    const fx = mounted ? Math.sin(u.heading) : 0, fz = mounted ? Math.cos(u.heading) : 0;
    // 押し出しの合計（1 コマ分）。重なる相手が多い所（柵の口・湧いた直後）で、
    // 一人ずつの押しを足し込むと一息で何m も飛んでしまうので、1 コマで動かす分には時間に応じた上限を付ける
    let tx = 0, tz = 0;
    // 別の芯（army_bodies_worker.js）が前のコマの位置で求めた合計があればそれを使う。遊び手・城内の兵・答えの無い時は下で求める。
    if (bodiesWorkerPush(this, u, BW_OUT)) { const f = 1 - Math.exp(-60 * dt); tx = BW_OUT.x * f; tz = BW_OUT.z * f; }
    else this.forNear(u.pos.x, u.pos.z, u.mounted ? 2.4 : 1.8, (o) => {
      if (o === u || !o.alive || o.downed || o.woundOut || o.isStruct || o.type === 'dummy' || o.fall || Math.abs(u.pos.y - o.pos.y) > 1.8) return;   // 倒れた者の上は歩ける（10/24）
      const om = !!o.mounted, min = !mounted && !om && !u.isPlayer && !o.isPlayer
        ? Math.max(o.team === u.team ? ALLY_SPACE_HARD : ra + .4, this.world.def.meleeBodySpace || 0) : ra + (om ? .55 : .4);
      const ofx = om ? Math.sin(o.heading) : 0, ofz = om ? Math.cos(o.heading) : 0;
      let bx = 0, bz = 0, best2 = min * min, found = false;
      // 馬の前後二点も数だけで比べ、重なる相手ごとの配列を作らない。
      for (let i = 0; i < (mounted ? 2 : 1); i++) {
        const a = mounted ? (i ? -.5 : .6) : 0;
        for (let j = 0; j < (om ? 2 : 1); j++) {
          const b = om ? (j ? -.5 : .6) : 0;
          const dx = (u.pos.x + fx * a) - (o.pos.x + ofx * b), dz = (u.pos.z + fz * a) - (o.pos.z + ofz * b), d2 = dx * dx + dz * dz;
          if (d2 < best2) { bx = dx; bz = dz; best2 = d2; found = true; }
        }
      }
      if (!found) return;
      // 実際に体が触れる相手だけ城内の壁を調べる。
      if ((u.naka || o.naka) && interiorBlocked(INTERIOR_WALLS, u.pos, o.pos)) return;
      let d = Math.sqrt(best2), nx, nz;
      if (d > 1e-4) { nx = bx / d; nz = bz / d; } else { const a = Math.min(u.id, o.id) * 2.39996, sign = u.id < o.id ? 1 : -1; nx = Math.sin(a) * sign; nz = Math.cos(a) * sign; d = 0; }
      // どちらがどれだけ退くか：遊び手は徒歩の兵には押されにくく、馬には押される。徒歩の兵は馬から退く
      let share;
      // （味方の徒歩の兵は、遊び手に道を譲る：人垣で前へ進めなくならないように）
      // （人足・荷を担ぐ者は、遊び手を止めない）
      if (u.isPlayer && this.world.def.yieldAlliedHorse && o.team === u.team && om && !mounted) share = 1;
      else if (u.isPlayer) share = o.team === u.team || o.type === 'porter' ? 0 : o.mounted && !u.mounted ? 1 : u.mounted && o.team === u.team ? 0.02 : u.mounted && !o.mounted ? 0.1 : o.team === u.team ? 0.08 : 0.3;
      else if (o.isPlayer) share = u.mounted && !o.mounted ? 0.3 : 1;
      else if (u.mounted !== !!o.mounted) share = u.mounted ? 0.15 : 1;
      else share = 0.5;
      const k = (min - d) * share * (1 - Math.exp(-60 * dt));
      tx += nx * k; tz += nz * k;
    });
    // 亡骸は踏み越えられる。自分も兵も押し戻さない。
    const tl = Math.hypot(tx, tz), cap = 6 * dt;
    if (tl > cap) { tx = tx / tl * cap; tz = tz / tl * cap; }
    u.pos.x += tx; u.pos.z += tz;
    // 11/18 クラウド21：押し合いで戦場の端（moveLim）の外へ押し出さない（小田原 661秒 井伊の陣の東の足軽が (177,-70)・戦の側の引き戻しは一コマに一度なので早送りの間に外へ出た）
    { const lim = (this.world.def.moveLim || 176) - 0.5; if (u.pos.x > lim) u.pos.x = lim; else if (u.pos.x < -lim) u.pos.x = -lim; if (u.pos.z > lim) u.pos.z = lim; else if (u.pos.z < -lim) u.pos.z = -lim; }
  },

  // 遠い兵の足もと（advanceFar）：(x, z) が建物・置き物・板塀（army.solids）の体の幅の内なら true。押し戻しの collide と同じ物を見る
  solidBlocked(u, x, z) { return this.solidAt(u, x, z) !== null; },

  // (x, z) で体の幅に掛かる建物・置き物（army.solids）の一つを返す（無ければ null）。solidBlocked と solidGap が使う
  solidAt(u, x, z) {
    const SO = this.solids;
    const WG = this.solidCollision || (this.solidCollision = new CollisionGrid());
    WG.update(SO, this.time, false);
    const y = u.pos.y;
    for (const id of WG.query(x, z)) {
      const w = SO[id], rr = u.mounted ? 0.7 : w.naka != null ? 0.3 : 0.45;   // 室内の壁・襖も見る（稲葉山の主殿で遠い守りが襖と壁を抜けていた）
      if (x < w.x0 - rr || x > w.x1 + rr || z < w.z0 - rr || z > w.z1 + rr) continue;
      if (w.struct && (!w.struct.alive || w.struct.opened)) continue;
      if (w.playerOnly) continue;
      if (w.yTop != null && y >= w.yTop - 0.05) continue;
      // 11/14 K168（すり抜け禁止）：床の段の上の壁は、足が床より少し下（坂の上の堂で 0.1m ほど）でも止める。下の階と見なすのは 1.2m より下の時だけ（比叡山で堂の壁を 115 回抜けていた）
      if (w.yBot != null && y + (w.bodyOverlap ? (u.mounted ? 2.4 : 1.7) : 1.2) < w.yBot - 0.1) continue;
      if (w.k === 'r') {
        const dx = x - w.x, dz = z - w.z, lx = dx * w.c - dz * w.s, lz = dx * w.s + dz * w.c;
        const ox = Math.max(0, Math.abs(lx) - w.hw), oz = Math.max(0, Math.abs(lz) - w.hd);
        if (ox * ox + oz * oz < rr * rr) return w;
      } else if (w.k === 'c') {
        if (Math.hypot(x - w.x, z - w.z) < w.r + rr) return w;
      } else {
        const dx = w.bx - w.ax, dz = w.bz - w.az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - w.ax) * dx + (z - w.az) * dz) / l2));
        if (Math.hypot(x - w.ax - dx * t, z - w.az - dz * t) < w.r + rr) return w;
      }
    }
    return null;
  },

  // 11/17 K168：(ax,az)→(bx,bz) の一歩が、始めは外に居て、建物・板塀（army.solids）の芯を跨ぐなら true（升の表で引く・new しない）
  solidCrossed(u, ax, az, bx, bz) {
    const SO = this.solids, WG = this.solidCollision || (this.solidCollision = new CollisionGrid());
    WG.update(SO, this.time, false);
    const y = u.pos.y, mnx = Math.min(ax, bx), mxx = Math.max(ax, bx), mnz = Math.min(az, bz), mxz = Math.max(az, bz);
    // 升の引きは二メートルの余裕を含むので、二メートルより短い一歩は始めの点の一引きで線の全部が入る（押し合いの一歩は 0.35m まで。11/17 K365 比叡山で毎コマ全員が二度引いていた）
    const ends = mxx - mnx < 2 && mxz - mnz < 2 ? 1 : 2;
    for (let e = 0; e < ends; e++) {
      for (const id of WG.query(e ? bx : ax, e ? bz : az)) {
        const w = SO[id];
        if (mxx < w.x0 || mnx > w.x1 || mxz < w.z0 || mnz > w.z1) continue;
        if (w.struct && (!w.struct.alive || w.struct.opened)) continue;
        if (w.playerOnly && !u.isPlayer) continue;
        if (w.yTop != null && y >= w.yTop - 0.05) continue;
        if (w.yBot != null && y + (w.bodyOverlap ? (u.mounted ? 2.4 : 1.7) : 1.2) < w.yBot) continue;
        if (w.k === 'r') {
          // 箱の内の座標へ直し、線分と箱の交わりを板の式（slab）で見る
          const sx = ax - w.x, sz = az - w.z, ex = bx - w.x, ez = bz - w.z;
          const p0 = sx * w.c - sz * w.s, q0 = sx * w.s + sz * w.c, p1 = ex * w.c - ez * w.s, q1 = ex * w.s + ez * w.c;
          if (Math.abs(p0) < w.hw && Math.abs(q0) < w.hd) continue;   // 始めから中に居る者は押し戻しに任せる
          let t0 = 0, t1 = 1;
          const dp = p1 - p0, dq = q1 - q0;
          if (Math.abs(dp) < 1e-9) { if (Math.abs(p0) >= w.hw) continue; }
          else { let a = (-w.hw - p0) / dp, b = (w.hw - p0) / dp; if (a > b) { const t = a; a = b; b = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
          if (Math.abs(dq) < 1e-9) { if (Math.abs(q0) >= w.hd) continue; }
          else { let a = (-w.hd - q0) / dq, b = (w.hd - q0) / dq; if (a > b) { const t = a; a = b; b = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
          if (t0 < t1) return true;
        } else if (w.k === 'c') {
          if (Math.hypot(ax - w.x, az - w.z) < w.r) continue;
          const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((w.x - ax) * dx + (w.z - az) * dz) / l2));
          if (Math.hypot(ax + dx * t - w.x, az + dz * t - w.z) < w.r) return true;
        } else if (w.ax != null) {
          const d1 = (w.bx - w.ax) * (az - w.az) - (w.bz - w.az) * (ax - w.ax), d2 = (w.bx - w.ax) * (bz - w.az) - (w.bz - w.az) * (bx - w.ax);
          const d3 = (bx - ax) * (w.az - az) - (bz - az) * (w.ax - ax), d4 = (bx - ax) * (w.bz - az) - (bz - az) * (w.bx - ax);
          if (d1 * d2 < 0 && d3 * d4 < 0) return true;
        }
      }
    }
    return false;
  },

  // 開戦前に区画表を作り、最初に兵が触れたコマへ全件の組立てを残さない。
  prepareCollisionGrids() {
    const SG = this.structCollision || (this.structCollision = new CollisionGrid());
    SG.update(this.structs, this.time, true);
    if (this.solids?.length) {
      const WG = this.solidCollision || (this.solidCollision = new CollisionGrid());
      WG.update(this.solids, this.time, false);
    }
    this.segGrid();
  },

  collide(u, dt = 0.016) {
    const fromX = u.pos.x, fromZ = u.pos.z, cap = Math.max(0.3, 12 * Math.min(dt, 0.1));
    const SG = this.structCollision || (this.structCollision = new CollisionGrid());
    SG.update(this.structs, this.time, true);
    // 一コマの歩みが大きい時（遅いコマ・駆ける馬）に、薄い柵・塀を飛び越えて向こうへ抜けない：前の位置からの線が壁と交わるなら前の位置へ戻す
    if (u.climb || u.perch || u.downed) u._cpx = undefined;
    // 11/17 K168：本人は小さな一歩でも跨ぎを見る（稲葉山で本人が鹿垣の線の上で押されて向こうへ抜けた。本人一人なので重くならない）
    if (u._cpx !== undefined && u.alive) {
      const mx = u.pos.x - u._cpx, mz = u.pos.z - u._cpz, m2 = mx * mx + mz * mz;
      // 11/17 K168 伊賀：建物・幕の線（army.solids）は小さな一歩でも跨ぎを見る（押し合いの 0.14m で本陣の幕の線を越え、押し戻しが向こう側へ出していた）
      if (m2 > 1e-6 && m2 <= (u.isPlayer ? 1e-6 : 0.1225) && this.solids?.length && this.solidCrossed(u, u._cpx, u._cpz, u.pos.x, u.pos.z)) { u.pos.x = u._cpx; u.pos.z = u._cpz; if (u.vel) { u.vel.x = 0; u.vel.z = 0; } }
      else if (m2 > (u.isPlayer ? 1e-6 : 0.1225) && m2 < 36) {
        const pass = (s) => {
          if (!s.alive || s.opened || !s.seg || (s.yTop != null && u.pos.y >= s.yTop - .05)) return false;
          const [ax, az, bx, bz] = s.seg;
          const d1 = (bx - ax) * (u._cpz - az) - (bz - az) * (u._cpx - ax), d2 = (bx - ax) * (u.pos.z - az) - (bz - az) * (u.pos.x - ax);
          if (d1 * d2 >= 0) return false;
          const e1 = mx * (az - u._cpz) - mz * (ax - u._cpx), e2 = mx * (bz - u._cpz) - mz * (bx - u._cpx);
          return e1 * e2 < 0;
        };
        let crossed = false;
        for (const id of SG.query((u.pos.x + u._cpx) / 2, (u.pos.z + u._cpz) / 2)) if (pass(this.structs[id])) { crossed = true; break; }
        if (crossed) { u.pos.x = u._cpx; u.pos.z = u._cpz; if (u.vel) { u.vel.x = 0; u.vel.z = 0; } }
        // 11/17 K168 クラウド kaito2：建物・板塀・稲架（army.solids）も同じく、一コマで箱を跨いだら前の位置へ戻す
        //   （押し戻しは足が箱の中か体の幅の内に居る時しか効かず、駆ける馬・押し合い・吹き飛びの大きな一歩で薄い壁を越えていた）
        else if (this.solids?.length && this.solidCrossed(u, u._cpx, u._cpz, u.pos.x, u.pos.z)) { u.pos.x = u._cpx; u.pos.z = u._cpz; if (u.vel) { u.vel.x = 0; u.vel.z = 0; } }
      }
    }
    let x0 = u.pos.x, z0 = u.pos.z, ids = SG.query(x0, z0), full = false;
    for (let i = 0; (full ? i < this.structs.length : i < ids.length || Math.abs(u.pos.x - x0) > 2 || Math.abs(u.pos.z - z0) > 2); i++) {
      // 深くめり込んで二メートル以上押された時は、残りを元の順で全て調べる。
      if (!full && (Math.abs(u.pos.x - x0) > 2 || Math.abs(u.pos.z - z0) > 2)) { i = i ? ids[i - 1] + 1 : 0; full = true; if (i >= this.structs.length) break; }
      const s = this.structs[full ? i : ids[i]];
      if (!s.alive || !s.seg || s.opened) continue;   // 開いた門（siege_gate の opened）は素通し
      if (s.yTop != null && u.pos.y >= s.yTop - .05) continue;
      const [ax, az, bx, bz] = s.seg;
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      let t = ((u.pos.x - ax) * dx + (u.pos.z - az) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + dx * t, cz = az + dz * t;
      const ox = u.pos.x - cx, oz = u.pos.z - cz;
      const d = Math.hypot(ox, oz);
      // 馬は前後の長さも当てる。門へ正面から寄る時、前脚が扉を抜けない。
      // 横向きでは幅だけにし、開いた口を無用に狭めない。
      const len0 = Math.sqrt(l2);
      const nx0 = d > 1e-4 ? ox / d : -dz / len0, nz0 = d > 1e-4 ? oz / d : dx / len0;
      const rr = (u.mounted ? 0.55 + 0.7 * Math.abs(Math.sin(u.heading) * nx0 + Math.cos(u.heading) * nz0) + (s.mountPadding || 0) : 0.45) + (s.bodyPadding || 0);   // mountPadding：馬だけ柵から離す（真田丸 11/18 クラウドす）
      if (d < rr) {
        const len = Math.sqrt(l2), side = u.vel.x * (-dz) + u.vel.z * dx > 0 ? -1 : 1;
        const nx = d > 1e-4 ? ox / d : s.nx ?? (-dz / len * side), nz = d > 1e-4 ? oz / d : s.nz ?? (dx / len * side);
        collisionPosition(u, cx + nx * rr, cz + nz * rr, fromX, fromZ, cap);
        // 駆けてきた騎馬は柵に当たって止まる（馬が竿立ちになり、しばらく動けない）
        if (u.mounted && u.charging && u.team !== s.team) {
          this.cavalryStopped(u, cx, cz, 18);
          u.stagger = 1.4;
          // 何騎も当たるほど柵は緩み、一騎ごとの痛みも増す（傾きは structWear）
          s.knock = (s.knock || 0) + 1;
          s.hp -= 8 + Math.min(12, s.knock * 2);
          this.play('knock', { x: cx, z: cz }, 1);
          if (this.hooks.onCavalryStopped) this.hooks.onCavalryStopped(u, s);
          if (u.hp <= 0) this.kill(u, null);
          else if (s.hp <= 0 && s.alive) { s.alive = false; s.hp = 0; s.hitFrom = { x: u.pos.x, z: u.pos.z }; this.structFall(s); if (this.hooks.onStructDestroyed) this.hooks.onStructDestroyed(s); }
          else { s.hitFrom = { x: u.pos.x, z: u.pos.z }; this.structWear(s); }
        }
        // 柵・塀・石垣にただ突っかかるだけに見えないよう、しばらく押し続けた歩兵はよじ登る（門は siege_gate.js の仕組みに任せる）
        else if (!u.mounted && !u.isPlayer && u.alive && !u.fleeing && !u.group?.routed && !u.downed && !(u.pinT > this.time) && !(u.stagger > 0) && !u.woundOut && !u.rearWound && !u.dragging && u.team !== s.team && !u.climb && !s.noClimb && s.name !== '崖' && !(s.name && s.name.indexOf('門') >= 0)) {
          u._wallStuckT = (u._wallStuckS === s ? (u._wallStuckT || 0) + dt : 0);
          u._wallStuckS = s;
          if (u._wallStuckT > 1.3 && Math.random() < 1 - Math.pow(0.98, dt * 60)) startWallClimb(u, s, { height: s.h });
        }
      }
    }
    if (u._wallStuckS && (!u._wallStuckS.alive || u._wallStuckS.opened || distToSeg(u.pos.x, u.pos.z, u._wallStuckS.seg) > (u.mounted ? 0.7 : 0.45) + 0.05)) { u._wallStuckS = null; u._wallStuckT = 0; }
    x0 = u.pos.x; z0 = u.pos.z; ids = SG.query(x0, z0); full = false;
    for (let i = 0; (full ? i < this.structs.length : i < ids.length || Math.abs(u.pos.x - x0) > 2 || Math.abs(u.pos.z - z0) > 2); i++) {
      if (!full && (Math.abs(u.pos.x - x0) > 2 || Math.abs(u.pos.z - z0) > 2)) { i = i ? ids[i - 1] + 1 : 0; full = true; if (i >= this.structs.length) break; }
      const s = this.structs[full ? i : ids[i]];
      if (!s.alive || s.opened || !s.solidR) continue;
      if (s.yTop != null && u.pos.y >= s.yTop - .05) continue;
      const dx = u.pos.x - s.x, dz = u.pos.z - s.z;
      const d = Math.hypot(dx, dz);
      if (d < s.solidR) {
        const nx = d > 1e-4 ? dx / d : Math.sin(u.heading), nz = d > 1e-4 ? dz / d : Math.cos(u.heading);
        collisionPosition(u, s.x + nx * s.solidR, s.z + nz * s.solidR, fromX, fromZ, cap);
      }
    }
    // 建物・陣幕・置き物（props.js の SOLIDS。battle.js が army.solids に渡す）：押し戻すだけ
    const SO = this.solids;
    if (SO && SO.length) {
      const WG = this.solidCollision || (this.solidCollision = new CollisionGrid());
      WG.update(SO, this.time, false);
      x0 = u.pos.x; z0 = u.pos.z; ids = WG.query(x0, z0); full = false;
      for (let i = 0; (full ? i < SO.length : i < ids.length || Math.abs(u.pos.x - x0) > 2 || Math.abs(u.pos.z - z0) > 2); i++) {
        if (!full && (Math.abs(u.pos.x - x0) > 2 || Math.abs(u.pos.z - z0) > 2)) { i = i ? ids[i - 1] + 1 : 0; full = true; if (i >= SO.length) break; }
        const w = SO[full ? i : ids[i]];
        // 11/9 重さ：城の中は一升に何百の置き物がある（伏見で一人あたり平均 52・最大 383）。体の幅の最大 1.25m で先に四角を外す
        //   （下の四角の比べは rr ≤ 1.25 なので、ここで外れる物は下でも必ず外れる。答えは同じ）
        if (u.pos.x < w.x0 - 1.25 || u.pos.x > w.x1 + 1.25 || u.pos.z < w.z0 - 1.25 || u.pos.z > w.z1 + 1.25) continue;
        // 室内では体の幅で通す。幅九十センチの戸口にも壁の厚みを残して通れる。
        let rr = u.mounted ? 0.7 : w.naka != null ? 0.3 : 0.45;
        if (u.mounted && w.k !== 'r' && w.k !== 'c') {
          const dx = w.bx - w.ax, dz = w.bz - w.az, len = Math.hypot(dx, dz) || 1;
          rr = 0.55 + 0.7 * Math.abs((-Math.sin(u.heading) * dz + Math.cos(u.heading) * dx) / len);
        }
        if (w.struct && (!w.struct.alive || w.struct.opened)) continue;
        if (w.playerOnly && !u.isPlayer) continue;   // 本人だけを止める当たり（伏見城の石垣の上の塀。寄せ手の道は今までどおり）
        if (w.yTop != null && u.pos.y >= w.yTop - 0.05) continue;   // 中の床（floors.js）まで登った後は、外壁の足もとの当たりは素通し
        if (w.yBot != null && u.pos.y + (w.bodyOverlap ? (u.mounted ? 2.4 : 1.7) : 1.2) < w.yBot) continue;   // 11/14 K168：下の階と見なすのは床より 1.2m 下から   // 横木は体の高さも見る。室内壁は従来どおり階で区切る。
        const px = u.pos.x, pz = u.pos.z;
        if (px < w.x0 - rr || px > w.x1 + rr || pz < w.z0 - rr || pz > w.z1 + rr) continue;
        if (w.k === 'r') {
          const dx = px - w.x, dz = pz - w.z, lx = dx * w.c - dz * w.s, lz = dx * w.s + dz * w.c;
          // 体は円。角まで四角く膨らませると、見える隙間が狭まり角で引っかかる。
          let nx = Math.max(-w.hw, Math.min(w.hw, lx)), nz = Math.max(-w.hd, Math.min(w.hd, lz));
          const ox = lx - nx, oz = lz - nz, d = Math.hypot(ox, oz);
          if (d >= rr) continue;
          if (d > 1e-6) { nx += ox / d * rr; nz += oz / d * rr; }
          else {
            // 11/16 K168（上田の稲架 厚さ0.8m）：足が箱の中に入った時、押し出す向きは来た側（このコマの始めの足）で決める。
            //   今の足の側で決めると、押されて芯を越えた兵が薄い塀・稲架の向こうへ抜けていた
            const fx = fromX - w.x, fz = fromZ - w.z, flx = Number.isFinite(fx) ? fx * w.c - fz * w.s : lx, flz = Number.isFinite(fz) ? fx * w.s + fz * w.c : lz;
            if (w.hw - Math.abs(lx) < w.hd - Math.abs(lz)) { nx = (flx < 0 ? -1 : 1) * (w.hw + rr); nz = lz; }
            else { nx = lx; nz = (flz < 0 ? -1 : 1) * (w.hd + rr); }
          }
          collisionPosition(u, w.x + nx * w.c + nz * w.s, w.z - nx * w.s + nz * w.c, fromX, fromZ, cap);
        } else if (w.k === 'c') {
          const dx = px - w.x, dz = pz - w.z, d = Math.hypot(dx, dz), R = w.r + rr;
          if (d < R) { const nx = d > 1e-4 ? dx / d : Math.sin(u.heading), nz = d > 1e-4 ? dz / d : Math.cos(u.heading); collisionPosition(u, w.x + nx * R, w.z + nz * R, fromX, fromZ, cap); }
        } else {
          const dx = w.bx - w.ax, dz = w.bz - w.az, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((px - w.ax) * dx + (pz - w.az) * dz) / l2));
          const cx = w.ax + dx * t, cz = w.az + dz * t, ox = px - cx, oz = pz - cz, d = Math.hypot(ox, oz), R = w.r + rr;
          if (d < R) { const nx = d > 1e-4 ? ox / d : -dz / Math.sqrt(l2), nz = d > 1e-4 ? oz / d : dx / Math.sqrt(l2); collisionPosition(u, cx + nx * R, cz + nz * R, fromX, fromZ, cap); }
        }
      }
    }
    u._cpx = u.pos.x; u._cpz = u.pos.z;
    // 押し合い・敗走でも深みに入れない。直前の通れる場所を数だけで覚える。
    if ((this.world.def.riverCross || this.world._deepMoat || this.world.def.streams?.some(st => st.fords?.length)) && !u.climb && !u.perch) {
      if (this.world.waterFootDepthAt(u.pos.x, u.pos.z, groundAt(this.world, u.pos.x, u.pos.z, u.pos.y)) > (this.world.def.wadeDepth ?? 0.85)) {
        // 覚えた浅い所が二m より遠い（遠景で歩いた間・出し直しの前の古い値）なら戻さない：戻すと一息で七〜十六m 飛ぶ
        //   （11/15 クラウドせ 姉川 act bot：磯野の隊の足軽 (9,-21)→(16,-23)・新手の逃げる足軽 (-45,7)→(-61,8)）。古い値は捨て、下の八方の寄せだけにする
        if (u._riverX != null && (u.pos.x - u._riverX) ** 2 + (u.pos.z - u._riverZ) ** 2 > 4) { u._riverX = u.pos.x; u._riverZ = u.pos.z; }
        // 11/18 K168 クラウド kaito2：覚えた浅い所が柵・塀の向こうなら戻さない（今福の砦の矢来の際で、深みから戻す一歩が矢来を越えていた）
        if (u._riverX != null && this.wallBetween(u.pos, -1, { x: u._riverX, z: u._riverZ })) { u._riverX = u.pos.x; u._riverZ = u.pos.z; }
        if (u._riverX != null) {
          u.pos.x = u._riverX; u.pos.z = u._riverZ;
          u.vel.x = 0; u.vel.z = 0; u.mv.x = 0; u.mv.z = 0;
          // 岸の押し合いで毎コマ深みへ押され、戻されては歩みも消え、深みの縁で二十秒ほど立ち尽くした（戸次川の味方の新手 K135 11/14）。
          //   押しの力を消し、戻した所から浅い側へ少しだけ寄せる（八方を〇・六m で測る）。浅い所が無ければそのまま
          u.push.x = 0; u.push.z = 0;
          const W = this.world, y0 = groundAt(W, u.pos.x, u.pos.z, u.pos.y);
          let bd = W.waterFootDepthAt(u.pos.x, u.pos.z, y0), bx = 0, bz = 0;
          for (let k = 0; k < 8; k++) {
            const a = k * Math.PI / 4, qx = u.pos.x + Math.sin(a) * 0.6, qz = u.pos.z + Math.cos(a) * 0.6;
            const d = W.waterFootDepthAt(qx, qz, groundAt(W, qx, qz, u.pos.y));
            if (d < bd - 0.01) { bd = d; bx = Math.sin(a); bz = Math.cos(a); }
          }
          if (bx || bz) { u.pos.x += bx * 0.12; u.pos.z += bz * 0.12; u._riverX = u.pos.x; u._riverZ = u.pos.z; }
        }
      } else { u._riverX = u.pos.x; u._riverZ = u.pos.z; }
    }
  },

  // 待つ間の小さな動き：棒立ちにしない。一人ずつ時をずらして、
  //   ・いつも：重心を左右へ移す（力を抜いた脚の膝がゆるむ）・首を少し回す
  //   ・ときどき：足の踏みかえ・見回し・隣と話す・槍の持ち替え・得物の手入れ
  //   ・陣の中（持ち場で待ち、敵が遠い）：膝をつく者もいる。敵が近ければ（見張る相手がいれば）立って腰を落として構える
  // 返す物 u.idl：drop（手を下げる分）・low（身構え）・sit（膝つき）・rx（槍の傾けの足し）。骨の入った人（humans.js）も low と sit を使う
  idleFx(u, dt) {
    const I = u.idl || (u.idl = { ph: Math.random(), a: null, k: 0, d: 0, t: 1 + Math.random() * 7, s: 1, tw: 0, hy: 0, hp: 0, rx: 0, sit: 0, sitW: 0, sitT: 3 + Math.random() * 10, low: 0, drop: 0, hOff: 0, talk: false });
    const g = u.group, w = u.wpnKind || u.lookWeapon;
    // 崩れて帰る小勢も敗走と同じ扱い。道の角で止まるたびに休息や雑談へ戻さない。
    const flight = this.world.def.routedFlightPose && (g?.routed || g?.brokenWithdrawalPose);
    // 狙う相手はいるが、まだ撃たない・打ちかからない者（「放て」を待つ鉄砲・間合いの外で待つ者）も、構えたまま小さく動く
    const waitT = !!u.target && !u.target.isStruct && u.target.alive !== false && !u.atk && !u.swing && !(u.guarding > 0) && u.moving < 0.15;
    const idle = !u.fleeing && !flight && (!u.target || waitT) && !u.atk && !u.swing && !u.hit && !(u.stagger > 0) && !(u.cheer > 0) && !(u.confused > 0) && u.moving < 0.15
      && !(u.reload && w === 'gun') && !(u.bowPh && u.bowPh !== 'rest');
    if (idle && !(u._idleSenseAt > this.time)) { u._idleSenseAt = this.time + 0.5; u._idleFoe = this.nearestEnemy(u, 30, o => Math.abs(o.pos.y - u.pos.y) < 1.8 && !this.wallBetween(u.pos, -1, o.pos)); }
    const foe = !idle ? null : u._desp && u._despFoe?.alive ? u._despFoe : u._idleFoe?.alive ? u._idleFoe : waitT ? u.target : u.watch && u.watch.alive ? u.watch : null;
    // 身構え（敵が 30m ほどに来た）。殺し合いの間合いでは腰をさらに落とし、相手から目を離さない（見回しをしない）
    I.low += ((foe ? (u._desp ? 1.35 : 1) : 0) - I.low) * Math.min(1, dt * 3);
    // 陣の中で膝をつく：持ち場で落ち着いて待ち、敵が遠い時だけ。しばらくすると立ち上がる（槍衾の前の列は立ったまま）
    const jinchu = u.jinchu;
    const sitting = jinchu && !jinchu.standing && idle && !foe && u._chore !== 'banner' && u._chore !== 'tend';
    const camp = idle && !foe && !(u._alvSeen > this.time - 0.6) && g && g.order === 'hold' && u.settled && !(g.formation === 'yari' && u.row === 0) && !u.isSub;
    const fatigue = Math.max(0, Math.min(1, Math.max(u.fat || 0, u.human ? u.human.heavy || 0 : 0)));
    I.sitT -= dt;
    if (I.sitT <= 0) {
      // 疲れた者ほど座って休む。休みの長さも一人ずつ違い、必ず立つ間を挟む
      I.sitW = I.sitW ? 0 : Math.random() < 0.2 + fatigue * 0.65 ? 1 : 0;
      I.sitT = I.sitW ? 6 + Math.random() * 8 + fatigue * 8 : 8 + Math.random() * 18;
    }
    // 騎馬を迎える槍衾（g.yariKneel）：前の段は膝をついて石突を地に立て、後ろの段がその上から穂先を揃える
    const brace = g && g.yariKneel && u.row === 0 && yariHolds(this, g) && !u.fleeing && !flight && !u.atk && !u.swing && u.moving < 0.3;
    // 込め直しの鉄砲足軽は、足を止めて膝をつき（柵・塀の陰に身を低くして）込める
    // 込め矢の手が止まる速さと膝を解く速さをそろえ、横詰めで膝を引きずらない。
    const reloadMoving = this.world.def.ridgeCombatMotion && !u.isPlayer && w === 'gun' && u.reload &&
      (u.farSim ? u.moving > 0.05 : Math.hypot(u.mv.x, u.mv.z) > 0.05 || Math.hypot(u.vel.x, u.vel.z) > 0.05);
    const reloadKneel = w === 'gun' && u.reload && u.moving < 0.15 && !reloadMoving && !u.fleeing && !flight && !u.isPlayer;
    // 弓・鉄砲の足軽は膝を着いて射る（kaito 11/1 の手本 docs/ashigaru_ref_1101 の ref2・3）：足を止めて狙う・放つ・番える・「放て」を待つ間
    // 11/6 kaito 九-4：的が届かない所にいる者・前の味方に射線を塞がれ続ける者は、膝をついて構えたまま待たない（立って構え、寄るか撃てる時に膝をつく）
    const shootReach = waitT && (u.lineBlk || 0) < 3 && Math.abs(u.target.pos.x - u.pos.x) + Math.abs(u.target.pos.z - u.pos.z) < (u.range || 40) * 1.3;
    const shootKneel = (w === 'gun' || w === 'bow') && !u.isPlayer && !u.mounted && u.moving < 0.15 && !u.fleeing && !flight && !u.hit
      && (shootReach || !!u.reload || !!(u.atk && (u.atk.ranged || u.atk.bow)) || u.gunPh === 'aim' || u.gunPh === 'fire' || u.gunPh === 'kiri' || (!!u.bowPh && u.bowPh !== 'rest'));
    // 11/7 kaito（全戦）：本陣の者は座る。本陣・旗本・居所の組と総大将は、敵が迫らない間は床几・地に腰を下ろして待つ
    if (g && g._honjin === undefined) g._honjin = !!(g.honjin || /本陣|旗本|居所/.test(g.name || '') || g.units.some((o) => o.isTaisho));
    const honjinSit = idle && !foe && g && g._honjin && g.order === 'hold' && !g.routed && !(g.formation === 'yari' && u.row === 0) && !u.isSub && !u.stdHeld && !u.banner && !u.mounted;
    const sitWant = jinchu ? (sitting ? 1 : 0) : brace || reloadKneel || shootKneel || honjinSit ? 1 : camp ? I.sitW : 0;
    // 信貴山の敗走では込め直しの膝を早めに解き、座ったまま走り出す姿を避ける。
    const flightRise = this.world.def.ridgeCombatMotion && u.fleeing && !u.isPlayer && !u.mounted;
    I.sit += (sitWant - I.sit) * Math.min(1, dt * (flightRise || reloadMoving || jinchu?.standing ? 7 : brace || reloadKneel || shootKneel ? 4 : 2.2));
    // ときどきの仕草
    if (!idle) { I.a = null; I.t = Math.max(I.t, 1 + Math.random() * 2); }
    else if (I.a) { I.k += dt; if (I.k >= I.d) { I.a = null; I.t = foe ? 0.6 + Math.random() * 2 : 1.5 + Math.random() * 5; } }
    else if ((I.t -= dt) <= 0) {
      const r = Math.random();
      let a = foe ? 'step' : r < 0.18 + fatigue * 0.18 ? 'breathe'
        : r < 0.4 ? 'sky' : r < 0.62 ? 'talk' : r < 0.82 && w !== 'bow' ? 'regrip'
        : I.sit > 0.5 ? 'tend' : r < 0.92 ? 'step' : 'look';
      // 持ち場を空けず、近くの味方は笠・柄・具足を手入れする。戦う時の構えには割り込まない。
      if (!foe && u.team === 0 && !u.name && !u.isSub && !u.stdHeld && g?.order === 'hold' &&
          this.playerUnit && Math.hypot(u.pos.x - this.playerUnit.pos.x, u.pos.z - this.playerUnit.pos.z) < 24 && r > 0.55) a = 'tend';
      I.s = Math.random() < 0.5 ? -1 : 1;
      if (a === 'talk') {
        // 隣の者へ顔を向けて話す（相手も手が空いていれば、こちらを向いて聞く）
        let m = null;
        this.forNear(u.pos.x, u.pos.z, 2.6, (o) => { if (!m && o !== u && o.alive && o.team === u.team && Math.abs(o.pos.y - u.pos.y) < 0.7 && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= 2.6 && !this.wallBetween(u.pos, -1, o.pos) && !o.isPlayer && !o.target && !o.mounted && !o.atk && !o.swing && !o.hit && !o.fleeing && !(o.stagger > 0) && !(o.reload || o.cheer > 0 || o.confused > 0) && !(o.bowPh && o.bowPh !== 'rest') && o.moving < 0.15 && o.idl && !o.idl.a && o.idl.low < 0.1) m = o; });
        if (!m) a = 'look';
        else {
          const rel = (o) => Math.max(-1, Math.min(1, angleDiff(o === u ? u.heading : m.heading, o === u ? Math.atan2(m.pos.x - u.pos.x, m.pos.z - u.pos.z) : Math.atan2(u.pos.x - m.pos.x, u.pos.z - m.pos.z))));
          I.tw = rel(u); I.talk = true;
          const J = m.idl;
          if (J && !J.a) { J.a = 'talk'; J.k = 0; J.d = 3 + Math.random() * 3; J.tw = rel(m); J.talk = false; }
        }
      }
      I.a = a; I.k = 0;
      I.d = a === 'step' ? 1.1 : a === 'look' ? 2 + Math.random() * 2 : a === 'talk' ? 3 + Math.random() * 3 : a === 'regrip' ? 1.2 + I.ph * 0.6 : a === 'breathe' ? 4 + I.ph * 2 : 3 + Math.random() * 2;
    }
    // 太鼓が詰まるにつれて目を前へ。座ったまま踏みかえや空を仰ぐ仕草はしない。
    if (jinchu && (jinchu.standing || I.a !== 'talk' && I.a !== 'breathe')) I.a = null;
    // 仕草ごとの体の向き・首・槍
    let yaw = 0, hy = 0, hp = 0, rx = 0, lean = 0, lift = 0, liftL = true;
    if (I.a) {
      const q = I.k / I.d, env = sm(0, 0.2, q) * (1 - sm(0.78, 1, q));
      if (I.a === 'step') { const q2 = (q * 2) % 1; lift = Math.sin(q2 * Math.PI); liftL = (q < 0.5) === (I.s > 0); yaw = I.s * 0.1 * env; }
      else if (I.a === 'look') { hy = I.s * (0.55 + I.ph * 0.45) * env; yaw = I.s * 0.2 * env; }
      else if (I.a === 'sky') { hp = -(0.35 + I.ph * 0.2) * env; hy = I.s * 0.2 * env; lean = -0.03 * env; }
      else if (I.a === 'breathe') {
        const breath = Math.sin(q * Math.PI * 4 + I.ph * 0.4) * env;
        lean = (0.07 + fatigue * 0.08) * env - 0.04 * breath;
        hp = 0.12 * env; rx = 0.04 * breath;
        u.body.position.y += 0.014 * breath;
      }
      else if (I.a === 'talk') { yaw = I.tw * 0.5 * env; hy = I.tw * 0.45 * env; hp = env * (0.05 + 0.07 * Math.sin(I.k * (I.talk ? 5.5 : 2.2) + I.ph * 9)); }
      else if (I.a === 'regrip') rx = -0.45 * Math.sin(q * Math.PI);
      else if (I.a === 'tend') { lean = 0.16 * env; hp = 0.42 * env; rx = -0.5 * env; }
    }
    // 戦前の陣中の支度（prelude.js）：草鞋を締める者は前へ屈んで足もとを見る・食う者は少しうつむく
    if (jinchu && !jinchu.standing && u._chore) {
      if (u._chore === 'sandal') { lean += 0.34; hp += 0.45; }
      else if (u._chore === 'tend') {
        // 本陣の支度：屈んで床几・幕の杭を整え、起きて一息つく（一人ずつ間をずらす）
        const c = ((jinchu.t + u._choreT) % 5.5) / 5.5, k = c < 0.55 ? Math.sin(c / 0.55 * Math.PI) : 0;
        lean += 0.55 * k; hp += 0.4 * k;
      } else if (u._chore === 'banner') {
        // 幟を起こす時は前へ踏ん張る
        const q = (jinchu.t - u._choreT) / 2.6;
        if (q > 0 && q < 1) lean += 0.18 * Math.sin(q * Math.PI);
      } else hp += 0.1;
    }
    // 敵が近い時は、見張る相手へ顔を向ける
    if (foe) hy += Math.max(-0.8, Math.min(0.8, angleDiff(u.heading + u.body.rotation.y, Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z)))) * 0.6;
    const T = this.time, ph = I.ph, on = idle ? 1 : 0;
    // 重心の左右（人ごとに速さと向きが違う）
    // 敵が近い時は落ち着かず、速く小さく揺れる。穂先・筒先もわずかに上下する
    const ws = Math.sin(T * (0.45 + ph * 0.35) * (1 + I.low * 1.6) + ph * 40) * on;
    u.body.rotation.z += ws * 0.045 * (1 - I.sit * 0.5);
    if (foe) rx += 0.06 * Math.sin(T * (1.1 + ph * 0.6) + ph * 20);
    u.body.rotation.y += yaw;
    u.body.rotation.x += lean + I.low * 0.14 + I.sit * 0.05;
    // 首（胴の子）：なめらかに向きを追い、うなずきは首の付け根を軸に
    const kh = Math.min(1, dt * 5);
    I.hy += (hy + 0.12 * Math.sin(T * 0.31 + ph * 17) * on - I.hy) * kh;
    if (jinchu && !jinchu.standing) hp += 0.08 * Math.min(1, jinchu.t / (jinchu.len * 0.7));
    I.hp += (hp - I.hp) * kh;
    I.rx += (rx - I.rx) * Math.min(1, dt * 8);
    if (u.head) {
      const N = 1.5;
      u.head.rotation.set(I.hp, I.hy, 0);
      u.head.position.set(0, N - N * Math.cos(I.hp), -N * Math.sin(I.hp));
    }
    // 脚（units.js の形の時だけ。骨の入った人は humans.js が low・sit から脚を折る）
    // 鉄砲は右の踵に腰を落として低く構える（手本 ref3。humans_motion.js の脚と同じ深さ）
    const drop = I.sit * (w === 'gun' ? 0.5 : 0.29) + I.low * 0.06;
    I.drop = drop;
    if (u.shinL && u.body.visible !== false) {
      let lL = u.legL.rotation.x, lR = u.legR.rotation.x, sL = u.shinL.rotation.x, sR = u.shinR.rotation.x;
      // 力を抜いた脚の膝がゆるむ
      if (ws > 0) { sL += 0.14 * ws; lL -= 0.05 * ws; } else { sR -= 0.14 * ws; lR += 0.05 * ws; }
      // 踏みかえ：片足ずつ軽く上げて置き直す
      if (lift) { if (liftL) { lL -= 0.38 * lift; sL += 0.7 * lift; } else { lR -= 0.38 * lift; sR += 0.7 * lift; } }
      // 身構え：左足を前、膝を曲げて腰を落とす
      lL -= 0.25 * I.low; sL += 0.35 * I.low; lR += 0.12 * I.low; sR += 0.3 * I.low;
      // 膝つき：右の膝を立て、左の膝を地につける（骨の入った人と同じ向き）
      const k = I.sit;
      //   鉄砲・槍は左の膝を立てる（手本 ref3・4：立てた左膝が左肘の台）
      if (k > 0.01 && (w === 'gun' || w === 'spear')) { lL += (-1.4 - lL) * k; sL += (1.45 - sL) * k; lR += (0.1 - lR) * k; sR += (1.5 - sR) * k; }
      else if (k > 0.01) { lR += (-1.4 - lR) * k; sR += (1.45 - sR) * k; lL += (0.1 - lL) * k; sL += (1.5 - sL) * k; }
      u.legL.rotation.x = lL; u.legR.rotation.x = lR; u.shinL.rotation.x = sL; u.shinR.rotation.x = sR;
      u.body.position.y -= drop + Math.abs(ws) * 0.008;
    }
    return I;
  }
};
