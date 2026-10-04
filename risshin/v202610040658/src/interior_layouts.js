// 外壁の内寸から間取りを作る。局所の＋奥行きが戸口。設営時だけ呼ぶ。
export function interiorLayout(kind, w, d, { oku = .4, side = 1, profile = null, entryX = 0 } = {}) {
  const hw = w / 2, hd = d / 2;
  // 宿は泊まる座敷、問屋は荷を扱う土間、使者の間は応対の座敷を広く取る。
  const hall = kind === 'toiya' ? Math.min(3, w * .34)
    : kind === 'inn' ? Math.min(1.5, w * .18)
    : kind === 'shisha' ? Math.min(1.2, w * .18) : Math.min(1.5, w * .24);
  const rooms = [], walls = [], props = [], portals = [];
  const room = (name, x0, x1, z0, z1, floor = 'tatami') => rooms.push({ name, x0, x1, z0, z1, floor });
  const cross = (z, x0, x1, door, paper = true) => {
    const gap = Math.min(profile === 'council' ? 2.1 : 1.05, (x1 - x0) * .25);
    door = Math.max(x0 + gap, Math.min(x1 - gap, door));
    portals.push({ x: door, z, axis: 'z' });
    if (door - gap > x0) walls.push({ ax: x0, az: z, bx: door - gap, bz: z, paper });
    if (door + gap < x1) walls.push({ ax: door + gap, az: z, bx: x1, bz: z, paper });
  };
  const prop = (part, x, z) => props.push({ part, x, z });
  if (kind === 'tenshu' || kind === 'yagura' || kind === 'gate') {
    room('武具の間', -hw, hw - hall, -hd, hd, 'boards');
    room('狭い廊下', hw - hall, hw, -hd, hd, 'boards');
    if (profile === 'yagura') {
      // 井楼の床は一間半ほど。箱を小さくし、中央と梯子の上り口を空ける。
      const narrow = w < 4 || d < 3;
      props.push({ part: 'ammo', x: -hw + .55, z: hd * .3, w: narrow ? .5 : .85, d: narrow ? .4 : .7, h: .55 });
      if (!narrow) props.push({ part: 'stones', x: -hw + .55, z: -hd + .6, w: .7, d: .6, h: .75 });
    } else {
      prop('ammo', -hw + .65, hd * .3);
      prop('stones', -hw + .65, -hd + .7);
    }
  } else if (kind === 'goten') {
    const cut = -hd + d * oku, entry = hd - Math.min(1.5, d * .2);
    room('上段の間', -hw, hw, -hd, cut);
    rooms[0].y = .16;
    room('広間', -hw, hw, cut, entry);
    room('廊下と縁側', -hw, hw, entry, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, profile === 'council' ? 0 : hw * .45);
    cross(entry, -hw + .1, hw - .1, profile ? entryX : 0);
    prop('alcove', hw - 1.4, -hd + .55);
    prop('desk', -hw + .85, -hd + 1.15);
    for (const p of props) p.y = .16;
  } else if (kind === 'chudo' || kind === 'hondo') {
    // 個別の室内図は残らない。板敷きの外陣と灯明のある内陣を推定し、左右に戦える口を残す。
    const cut = -hd + d * .38;
    room('内陣', -hw, hw, -hd, cut, 'boards');
    room('外陣', -hw, hw, cut, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, hw * .5);
    prop('altar', 0, -hd + .85);
  } else if (kind === 'kuri') {
    const hx = hw - Math.min(2.6, w * .38);
    room('炊事の土間', -hw, hx, -hd, hd, 'earth');
    room('食事の間', hx, hw, -hd, hd);
    if (d > 4) walls.push({ ax: hx, az: -hd + 1.5, bx: hx, bz: hd - 1.5, paper: false });
    prop('stove', -hw + .8, -hd + .85);
    prop('storage', hw - .65, -hd + .7);
  } else if (kind === 'sobo') {
    const cut = hd - Math.min(1.8, d * .3);
    room('僧の座敷', -hw, hw, -hd, cut);
    room('板敷きの入口', -hw, hw, cut, hd, 'boards');
    cross(cut, -hw + .1, hw - .1, 0);
    prop('desk', -hw + .8, -hd + .8);
    prop('storage', hw - .65, -hd + .7);
  } else if (kind === 'temple') {
    const cut = hd - d * .3;
    room('本堂', -hw, hw - hall, -hd, cut, 'boards');
    room('庫裏', -hw, hw - hall, cut, hd, 'earth');
    room('回廊', hw - hall, hw, -hd, hd, 'boards');
    cross(cut, -hw, hw - hall, 0);
    prop('altar', 0, -hd + .75);
    prop('stove', -hw + .7, hd - .65);
  } else if (kind === 'nagaya') {
    const cut = hd - Math.min(1.4, d * .3);
    room('兵の寝る間', -hw, hw, -hd, cut, 'boards');
    room('入口の土間', -hw, hw, cut, hd, 'earth');
    for (const x of [-hw + .9, hw - .9]) props.push({ part: 'bedding', x, z: -hd + 1, w: .75, d: 1.5, h: .12 });
    prop('chest', -hw + .6, cut - .5);
  } else if (kind === 'shrine') {
    room('神前', -hw, hw, -hd, 0, 'boards');
    room('拝む所', -hw, hw, 0, hd, 'boards');
    props.push({ part: 'offering', x: 0, z: -hd + .65, w: 1.2, d: .5, h: .65 });
  } else if (['machiya', 'inn', 'toiya', 'shisha'].includes(kind)) {
    const front = kind === 'inn' ? .24 : kind === 'toiya' ? .55 : kind === 'shisha' ? .2 : .36;
    const cut = hd - d * front, hx = hw - hall;
    room(kind === 'inn' ? '泊まる座敷' : kind === 'toiya' ? '帳場の座敷' : kind === 'shisha' ? '使者の座敷' : '奥の間', -hw, hx, -hd, cut);
    room(kind === 'inn' ? '宿の入口' : kind === 'toiya' ? '荷の土間' : kind === 'shisha' ? '控えの間' : '店の間', -hw, hx, cut, hd, kind === 'toiya' ? 'earth' : 'boards');
    room('通り庭', hx, hw, -hd, hd, 'earth');
    cross(cut, -hw, hx, Math.min(0, hx - 1.1));
    prop('counter', -hw + .7, hd - .75);
    if (kind === 'shisha') prop('desk', -hw + .8, -hd + .8);
    else prop('stove', hw - hall / 2, -hd + .65);
  } else {
    const cut = hd - d * .3, hx = hw - hall;
    room('座敷', -hw, hx, -hd, cut);
    room('玄関と式台', -hw, hx, cut, hd, 'boards');
    room('台所の土間', hx, hw, -hd, hd, 'earth');
    cross(cut, -hw, hx, Math.min(0, hx - 1.1));
    prop('alcove', -hw + 1.4, -hd + .55);
    prop('stove', hw - hall / 2, -hd + .65);
  }
  // 土間と回廊を区切る。前後に通れる口を残す。
  if (['temple', 'machiya', 'inn', 'toiya', 'shisha', 'yashiki'].includes(kind)) {
    if (d > 4) walls.push({ ax: hw - hall, az: -hd + 1.5, bx: hw - hall, bz: hd - 1.5, paper: kind !== 'temple' });
  }
  // 指定の山城の室内は推定復元。土の曲輪に平屋の館を置き、中央を戦える広さに残す。
  if (profile && profile !== 'council' && kind === 'goten') {
    const military = profile === 'odani_kyogoku' || profile === 'mitsukuri';
    rooms[0].raised = !military;
    rooms[0].y = military ? 0 : .16;
    rooms[0].name = military ? '控えの間' : '奥の座敷';
    if (military) {
      rooms[1].floor = 'boards'; rooms[1].name = '兵の広間';
      props.length = 0;
      props.push({ part: 'ammo', x: -hw + .7, z: -hd + .65 });
      props.push({ part: 'chest', x: hw - .8, z: -hd + .65, w: 1.1, d: .6, h: .75 });
    } else {
      for (const p of props) p.y = .16;
      // 大広間は集まる場所。屋敷には壁際の小さな炉と収納を置く。
      if (profile === 'odani_onogi' || profile === 'odani_akao') {
        props.push({ part: 'hearth', x: -hw + 1, z: hd - .75, w: .9, d: .8, h: .45 });
      }
      if (profile !== 'odani_hall') props.push({ part: 'chest', x: hw - .75, z: hd - .7, w: 1.1, d: .6, h: .75 });
    }
  }
  // 対象の城の調度も残す。鳥取には満ちた米俵を置かない。
  if (profile) {
    if (['arioka', 'miki', 'tottori', 'takato', 'iwamura'].includes(profile) && kind === 'goten' && w >= 9 && d >= 6) prop('chest', -hw + .65, hd - .7);
    if (kind === 'machiya') prop('chest', -hw + .6, -hd + .65);
    if (profile === 'tottori') for (const p of props) if (p.part === 'ammo') p.part = 'chest';
  }
  // 調度の寸法は見た目・当たり・通路の判断で共有する。
  for (const p of props) {
    p.w ??= p.part === 'alcove' ? 2.3 : p.part === 'altar' ? 2.1 : p.part === 'desk' ? 1.2 : p.part === 'counter' ? 1.1 : .85;
    p.d ??= p.part === 'alcove' ? .85 : p.part === 'altar' ? 1 : .7;
    p.h ??= p.part === 'alcove' ? 2.5 : p.part === 'altar' ? 1.5 : p.part === 'desk' ? .46 : p.part === 'stove' ? .9 : p.part === 'storage' ? .8 : p.part === 'chest' ? .7 : .55;
    // 狭い建物でも家具の外側を壁の中へ収める。寸法は絵と当たりの両方へ渡す。
    p.w = Math.min(p.w, Math.max(.1, w - .4));
    p.d = Math.min(p.d, Math.max(.1, d - .4));
    p.x = Math.max(-hw + .2 + p.w / 2, Math.min(hw - .2 - p.w / 2, p.x));
    p.z = Math.max(-hd + .2 + p.d / 2, Math.min(hd - .2 - p.d / 2, p.z));
  }
  if (side < 0) {
    for (const r of rooms) { const a = r.z0; r.z0 = -r.z1; r.z1 = -a; }
    for (const v of walls) { v.az *= -1; v.bz *= -1; }
    for (const p of props) p.z *= -1;
    for (const p of portals) p.z *= -1;
  }
  return { kind, profile, rooms, walls, props, portals, dim: kind === 'tenshu' || kind === 'yagura' || kind === 'gate' ? .42 : .68 };
}

export function interiorFloorAt(layout, x, z) {
  for (const r of layout.rooms) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.floor;
  return 'boards';
}

// 壁と家具の周りの通路を設営時に作る。毎コマは既存の点と距離だけを使う。
function pathClear(rects, x, z, tx, tz) {
  const dx = tx - x, dz = tz - z;
  for (const r of rects) {
    let lo = 0, hi = 1;
    if (Math.abs(dx) < 1e-8) { if (x <= r.x0 || x >= r.x1) continue; }
    else { const a = (r.x0 - x) / dx, b = (r.x1 - x) / dx; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
    if (Math.abs(dz) < 1e-8) { if (z <= r.z0 || z >= r.z1) continue; }
    else { const a = (r.z0 - z) / dz, b = (r.z1 - z) / dz; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
    if (lo < hi && hi > 0 && lo < 1) return false;
  }
  return true;
}

export function prepareInteriorPaths(layout, w, d) {
  const rects = [], nodes = [], margin = .36;
  for (const p of layout.props) rects.push({ x0: p.x - p.w / 2 - margin, x1: p.x + p.w / 2 + margin, z0: p.z - p.d / 2 - margin, z1: p.z + p.d / 2 + margin });
  for (const v of layout.walls) rects.push({ x0: Math.min(v.ax, v.bx) - margin, x1: Math.max(v.ax, v.bx) + margin, z0: Math.min(v.az, v.bz) - margin, z1: Math.max(v.az, v.bz) + margin });
  for (const r of rects) for (const x of [r.x0 - .08, r.x1 + .08]) for (const z of [r.z0 - .08, r.z1 + .08]) {
    if (Math.abs(x) > w / 2 - .4 || Math.abs(z) > d / 2 - .4 || rects.some(v => x > v.x0 && x < v.x1 && z > v.z0 && z < v.z1)) continue;
    nodes.push({ x, z });
  }
  const n = nodes.length, distances = new Float32Array(n * n);
  distances.fill(Infinity);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = nodes[i], b = nodes[j];
    if (i === j || pathClear(rects, a.x, a.z, b.x, b.z)) distances[i * n + j] = Math.hypot(a.x - b.x, a.z - b.z);
  }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = distances[i * n + k] + distances[k * n + j];
    if (v < distances[i * n + j]) distances[i * n + j] = v;
  }
  layout.paths = { rects, nodes, distances, from: new Float32Array(n), to: new Float32Array(n) };
}

// 廊下の端・襖の開いた口へ回る。行き先の箱は呼び出し側が使い回す。
export function interiorWaypoint(layout, x, z, tx, tz, out) {
  out.x = tx; out.z = tz;
  const nav = layout.paths;
  if (nav) {
    if (pathClear(nav.rects, x, z, tx, tz)) return out;
    const n = nav.nodes.length;
    for (let i = 0; i < n; i++) {
      const q = nav.nodes[i];
      nav.from[i] = pathClear(nav.rects, x, z, q.x, q.z) ? Math.hypot(x - q.x, z - q.z) : Infinity;
      nav.to[i] = pathClear(nav.rects, q.x, q.z, tx, tz) ? Math.hypot(tx - q.x, tz - q.z) : Infinity;
    }
    let best = Infinity, first = -1;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(nav.from[i]) || nav.from[i] < .12) continue;
      for (let j = 0; j < n; j++) {
        const cost = nav.from[i] + nav.distances[i * n + j] + nav.to[j];
        if (cost < best) { best = cost; first = i; }
      }
    }
    if (first >= 0) { out.x = nav.nodes[first].x; out.z = nav.nodes[first].z; }
    else { out.x = x; out.z = z; }
    return out;
  }
  let first = 2, wall = null;
  for (const v of layout.walls) {
    const dx = tx - x, dz = tz - z, sx = v.bx - v.ax, sz = v.bz - v.az, den = dx * sz - dz * sx;
    if (Math.abs(den) < .00001) continue;
    const ax = v.ax - x, az = v.az - z;
    const t = (ax * sz - az * sx) / den, u = (ax * dz - az * dx) / den;
    if (t >= 0 && t < first && t <= 1 && u >= 0 && u <= 1) { first = t; wall = v; }
  }
  if (!wall) return out;
  if (Math.abs(wall.az - wall.bz) < .01) {
    const portal = layout.portals.find((p) => Math.abs(p.z - wall.az) < .01);
    if (portal) { out.x = portal.x; out.z = portal.z + (Math.abs(x - portal.x) < .45 ? Math.sign(tz - portal.z) || 1 : Math.sign(z - portal.z) || -Math.sign(tz - portal.z) || 1) * .9; }
    else {
      const left = Math.min(wall.ax, wall.bx) - .85, right = Math.max(wall.ax, wall.bx) + .85;
      out.x = Math.abs(x - left) + Math.abs(tx - left) <= Math.abs(x - right) + Math.abs(tx - right) ? left : right;
      out.z = Math.abs(x - out.x) < .4 ? tz : z;
    }
  } else {
    const front = Math.max(wall.az, wall.bz) + .85, back = Math.min(wall.az, wall.bz) - .85;
    out.z = Math.abs(z - front) + Math.abs(tz - front) <= Math.abs(z - back) + Math.abs(tz - back) ? front : back;
    out.x = Math.abs(z - out.z) < .4 ? tx : x;
  }
  return out;
}
