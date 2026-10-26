import { S } from "./settings.js";
import { EMPTY_MAP_PATH, ENEMY_MON, groupKind, TAG_COL, tagOf, moraleWord } from "./hud_common.js";
import { weatherSight, weatherSees } from "./weather_gameplay.js";
import { sightRef, sightPoint, sightUnit } from "./battle_sight.js";
import { terrainHints } from "./rts.js";
import { NAKA } from "./naka.js";
import { CAPTURE, GATE_STATE } from "./nawabari.js";
import { currentObjective } from "./mission_guide.js";
import { campKnown, enemyKnown } from "./battle_intel.js";
import { GROUP_NAME } from "./player.js";
import { markedEnemy } from "./mission_pin.js";
import { inouSignVisible } from "./battle_sight.js";

export class HudMap {


  // 行き先の白い小旗（戦場の小旗と同じ：白地に墨の縁、細い竿）
  flagIcon(g, x, y, h) {
    g.strokeStyle = '#1a1510'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    g.strokeStyle = '#f1e9d6'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    g.fillStyle = '#f1e9d6'; g.fillRect(x, y - h, h * 0.62, h * 0.44);
    g.strokeStyle = '#1a1510'; g.lineWidth = 1.2; g.strokeRect(x, y - h, h * 0.62, h * 0.44);
    g.beginPath(); g.ellipse(x, y, h * 0.3, h * 0.1, 0, 0, Math.PI * 2); g.strokeStyle = 'rgba(241,233,214,.8)'; g.lineWidth = 1.2; g.stroke();
  }

  // 隊旗の形：幟（槍・弓）・四角の小旗（鉄砲）・吹流し（騎馬）・大旗（本陣）
  stdIcon(g, x, y, h, kind, col, lean = 0) {
    g.save(); g.translate(x, y); g.rotate(lean);
    const H = kind === 'honjin' ? h * 1.35 : kind === 'gun' ? h * 0.75 : h;
    g.lineWidth = 3; g.strokeStyle = '#120f0b'; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -H); g.stroke();
    g.lineWidth = 1.4; g.strokeStyle = col; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -H); g.stroke();
    g.fillStyle = col; g.strokeStyle = '#120f0b'; g.lineWidth = 1.2;
    g.beginPath();
    if (kind === 'gun') g.rect(0, -H, H * 0.62, H * 0.52);
    else if (kind === 'cavalry') { g.moveTo(0, -H); g.lineTo(h * 0.9, -H + h * 0.08); g.lineTo(h * 0.9, -H + h * 0.16); g.lineTo(0, -H + h * 0.3); g.closePath(); }
    else if (kind === 'honjin') g.rect(0, -H, H * 0.4, H * 0.62);
    else g.rect(0, -H, h * 0.24, kind === 'bow' ? h * 0.5 : h * 0.62);
    g.fill(); g.stroke();
    g.restore();
  }


  // 和紙の地（生成りの地に漉きむらと繊維）。一度だけ描いて、絵の模様として使い回す
  washi(g) {
    if (!this._washiC) {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const w = c.getContext('2d');
      w.fillStyle = '#e8ddc2'; w.fillRect(0, 0, 256, 256);
      let s = 7; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 70; i++) { w.fillStyle = `rgba(${170 + R() * 40},${150 + R() * 36},${110 + R() * 30},${0.08 + R() * 0.1})`; w.beginPath(); w.ellipse(R() * 256, R() * 256, 10 + R() * 34, 6 + R() * 20, R() * 3, 0, Math.PI * 2); w.fill(); }
      for (let i = 0; i < 260; i++) {
        const x = R() * 256, y = R() * 256, a = R() * 6.28, l = 4 + R() * 14;
        w.strokeStyle = `rgba(${120 + R() * 40},${100 + R() * 30},${70 + R() * 20},${0.12 + R() * 0.16})`; w.lineWidth = 0.5 + R() * 0.8;
        w.beginPath(); w.moveTo(x, y); w.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); w.stroke();
      }
      this._washiC = c; this._washiP = new Map();
    }
    if (!this._washiP.has(g)) this._washiP.set(g, g.createPattern(this._washiC, 'repeat'));
    return this._washiP.get(g);
  }

  // 大軍の塊を墨のにじみで描く下地（敵・味方で一枚ずつ。大きさが同じなら使い回す）
  massLayer(i, Sz) {
    this._mass = this._mass || [];
    let c = this._mass[i];
    if (!c || c.width !== Sz) { c = document.createElement('canvas'); c.width = c.height = Sz; this._mass[i] = c; }
    return c;
  }

  drawMap(cv, rt, range, rotate) {
    const g = cv.getContext('2d');
    const Sz = cv.width;
    g.clearRect(0, 0, Sz, Sz);
    const p = rt.player.u;
    // 桶狭間も稲生と同じ小さな地図：名は自分の組と信長だけ、行き先は▼と大将の菱形。
    const oke = rt.def.key === 'okehazama';
    const inou = rt.def.key === 'inou' || oke || !!rt.def.missionSingleLine;
    const ownGroup = rt.def.key === 'inou' ? rt.flags.hata : rt.hostGroup;
    // 名前は自分の組と大将だけ。同じ場所の札を重ねない。
    const names = this._mapNameRects || (this._mapNameRects = []);
    let nameCount = 0;
    const drawName = (label, x, y) => {
      if (!label) return;
      const width = g.measureText(label).width, height = Math.ceil(12 * px);
      x = Math.max(4 * px, Math.min(Sz - width - 4 * px, x));
      y = Math.max(height + 4 * px, Math.min(Sz - 4 * px, y));
      for (let i = 0; i < nameCount; i++) {
        const r = names[i];
        if (x < r[2] + 5 * px && x + width > r[0] - 5 * px && y - height < r[3] + 5 * px && y > r[1] - 5 * px) return;
      }
      const r = names[nameCount] || (names[nameCount] = [0, 0, 0, 0]); nameCount++;
      r[0] = x; r[1] = y - height; r[2] = x + width; r[3] = y;
      g.lineWidth = 3 * px; g.strokeStyle = C.paper; g.strokeText(label, x, y); g.fillText(label, x, y);
    };
    const cx = rotate ? p.pos.x : (this.bigC ? this.bigC.x : 0), cz = rotate ? p.pos.z : (this.bigC ? this.bigC.z : 0);
    const sc = Sz / 2 / range;
    const northUp = rotate && S.mapNorth;
    const yaw = rotate && !northUp ? rt.player.yaw : Math.PI;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    // 一度の地図描画中は別々の座標を保ち、次の描画で同じ枠を使う。
    const points = this._mapPoints || (this._mapPoints = []);
    let pointAt = 0;
    const tr = (x, z) => {
      const dx = x - cx, dz = z - cz;
      // 画面上方向＝向いている方向
      const rx = -(dx * cos - dz * sin), rz = dx * sin + dz * cos;
      const out = points[pointAt] || (points[pointAt] = [0, 0]);
      pointAt++; out[0] = Sz / 2 + rx * sc; out[1] = Sz / 2 - rz * sc;
      return out;
    };
    // 画面での大きさ：iPhone 横では小地図が 60px ほどの小さな丸になる。その時は細かい物（兵の点・味方の鉄砲の扇・字）を描かず、線を太く
    const shown = cv.clientWidth || Sz, px = Sz / Math.max(40, shown), tiny = rotate && shown < 100;
    if (rotate) this.mmTiny = tiny;
    const k = Sz / 340;
    // 墨と顔料の色（和紙の上で読める濃さ。色だけに頼らず、敵は三角・味方は四角・自分の組は輪）
    const ca = S.colorAssist;
    const C = { ink: '#1b1712', ally: ca ? '#0a6fa8' : '#2c4f86', enemy: ca ? '#c25a00' : '#b2331f', own: '#6e4508', gold: '#7a5a10', paper: 'rgba(240,232,212,.92)' };
    const TC = (team) => (team !== 0 ? C.enemy : C.ally);
    g.save();
    if (rotate) { g.beginPath(); g.arc(Sz / 2, Sz / 2, Sz / 2 - 1, 0, Math.PI * 2); g.clip(); }
    // 和紙の地（小さい時は少し透かして、戦場を隠しすぎない）
    g.globalAlpha = tiny ? 0.74 : 0.88;
    g.fillStyle = this.washi(g); g.fillRect(0, 0, Sz, Sz);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(110,86,52,.5)'; g.lineWidth = Math.max(2 * k, 1.6 * px);
    // 道が二本以上ある戦：自分のいる道（いちばん近い道）を太く濃く引く（B062）
    let mapPaths = rt.def.mapPaths?.(rt, rotate);
    if (!mapPaths) {
      mapPaths = this._mapPaths || (this._mapPaths = []);
      mapPaths.length = 0;
      if (rt.world.def.paths) for (const path of rt.world.def.paths) mapPaths.push(Array.isArray(path) ? path : path?.pts || EMPTY_MAP_PATH);
    }   // 道は点の並びか { pts, half } の形
    let mine = -1;
    if (mapPaths.length > 1 && rt.player && rt.player.u) {
      const pp = rt.player.u.pos; let bd = 30;
      mapPaths.forEach((path, pi) => {
        for (let i = 0; i < path.length - 1; i++) {
          const [x1, z1] = path[i], [x2, z2] = path[i + 1], dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((pp.x - x1) * dx + (pp.z - z1) * dz) / l2));
          const d = Math.hypot(pp.x - (x1 + dx * t), pp.z - (z1 + dz * t));
          if (d < bd) { bd = d; mine = pi; }
        }
      });
    }
    mapPaths.forEach((path, pi) => {
      const my = pi === mine;
      g.strokeStyle = my ? 'rgba(110,70,30,.9)' : 'rgba(110,86,52,.5)'; g.lineWidth = my ? Math.max(4 * k, 3 * px) : Math.max(2 * k, 1.6 * px);
      g.beginPath(); path.forEach(([x, z], i) => { const [a, b] = tr(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
    });
    g.lineWidth = Math.max(2 * k, 1.6 * px);
    if (rt.world.def.water) {
      g.fillStyle = 'rgba(78,108,122,.4)';
      const Wx = rt.world.def.water.x;
      const pts = [tr(Wx, -200), tr(200, -200), tr(200, 200), tr(Wx, 200)];
      g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.fill();
    }
    const now = rt.army.time;
    for (const s of rt.army.structs) {
      if (!s.seg) continue;
      const hot = s.alive && s.hitT && now - s.hitT < 1.2;
      g.strokeStyle = !s.alive ? C.enemy : hot ? '#b86a0e' : 'rgba(40,33,24,.85)';
      g.lineWidth = Math.max((hot ? 5 : 3) * k, (hot ? 2.4 : 1.5) * px);
      const [a1, b1] = tr(s.seg[0], s.seg[1]), [a2, b2] = tr(s.seg[2], s.seg[3]);
      g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke();
    }
    const r0 = Math.max(3, Sz / 110);
    // 身分が上がっても、敵の位置を見通せるわけではない。
    const PU = rt.player.u.pos, sight = Math.min(weatherSight(rt.world), 170);
    const seen = (x, z, grp) => grp ? sightRef(rt, grp, grp.center()) : false;
    const far = (x, z, m = 1.5) => Math.abs(x - cx) > range * m || Math.abs(z - cz) > range * m;

    // ---- 山・砦・城の地形の読み（M4）：尾根・谷の色分け・見える範囲・火の所・分かれ道と伏兵注意（bigmap だけ）----
    {
      const H = terrainHints(rt, false);
      if (H && (H.ridge.length || H.valley.length)) {
        for (const [list, col] of [[H.ridge, 'rgba(168,120,40,.55)'], [H.valley, 'rgba(60,96,120,.55)']]) {
          g.fillStyle = col;
          for (const p of list) { if (far(p.x, p.z)) continue; const [a, bb] = tr(p.x, p.z); g.beginPath(); g.arc(a, bb, Math.max(1.4 * k, 1 * px), 0, Math.PI * 2); g.fill(); }
        }
      }
      if (!rotate && H) {
        // 押して開く俯瞰だけ：分かれ道（丸に十）と、伏兵に気を付ける所（三角の注意）
        g.strokeStyle = 'rgba(40,33,24,.8)'; g.lineWidth = Math.max(1.6 * k, 1 * px);
        for (const p of H.branch) { if (far(p.x, p.z)) continue; const [a, bb] = tr(p.x, p.z); const rr = 4 * k; g.beginPath(); g.arc(a, bb, rr, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(a - rr, bb); g.lineTo(a + rr, bb); g.moveTo(a, bb - rr); g.lineTo(a, bb + rr); g.stroke(); }
        g.fillStyle = 'rgba(178,51,31,.75)';
        for (const p of H.ambush) { if (far(p.x, p.z)) continue; const [a, bb] = tr(p.x, p.z); const rr = 3.6 * k; g.beginPath(); g.moveTo(a, bb - rr); g.lineTo(a + rr, bb + rr); g.lineTo(a - rr, bb + rr); g.closePath(); g.fill(); }
      }
    }
    // 見える範囲（自分の目の届く輪）：無限の時は描かない
    if (rotate && Number.isFinite(sight)) {
      const [a, bb] = tr(PU.x, PU.z);
      g.strokeStyle = 'rgba(110,86,52,.35)'; g.lineWidth = Math.max(1.2 * k, 1 * px);
      g.beginPath(); g.arc(a, bb, sight * sc, 0, Math.PI * 2); g.stroke();
    }
    // 火の所（siege_fire.js が燃やした柵・木戸・堂など）
    if (rt.army.burning && rt.army.burning.length) {
      for (const s of rt.army.burning) {
        const px = s.seg ? (s.seg[0] + s.seg[2]) / 2 : s.x, pz = s.seg ? (s.seg[1] + s.seg[3]) / 2 : s.z;
        if (px == null || far(px, pz) || !sightPoint(rt, { x: px, z: pz })) continue;
        const [a, bb] = tr(px, pz);
        g.fillStyle = '#c25a00'; g.beginPath(); g.arc(a, bb, Math.max(2.2 * k, 1.4 * px), 0, Math.PI * 2); g.fill();
      }
    }
    // ふさいだ道（退路封鎖・siege_zones.js が持てば）：道の上に×を引く
    if (rt.sz && rt.sz.blockedPaths) {
      g.strokeStyle = 'rgba(178,51,31,.8)'; g.lineWidth = Math.max(2 * k, 1.4 * px);
      for (const [x, z] of rt.sz.blockedPaths) { if (far(x, z) || !sightPoint(rt, { x, z })) continue; const [a, bb] = tr(x, z); const rr = 4 * k; g.beginPath(); g.moveTo(a - rr, bb - rr); g.lineTo(a + rr, bb + rr); g.moveTo(a + rr, bb - rr); g.lineTo(a - rr, bb + rr); g.stroke(); }
    }

    // ---- 城・砦の場（siege_zones.js の SZ）：塗り分けと形。色だけに頼らず、本丸は角、曲輪は丸、交戦中は縞 ----
    if (rt.sz && rt.sz.zones) {
      for (const z of rt.sz.zones) {
        const q = z.pos; if (!q || far(q.x, q.z, 2) || !sightRef(rt, z, q)) continue;
        const [a, bb] = tr(q.x, q.z);
        const col = z.state === 'friend' ? C.ally : z.state === 'enemy' ? C.enemy : z.state === 'contested' ? '#c2961e' : 'rgba(150,140,120,.8)';
        const R = (z.honmaru ? r0 * 2.2 : r0 * 1.5) * k;
        g.save(); g.translate(a, bb);
        if (z.honmaru) {
          g.rotate(Math.PI / 4);
          g.strokeStyle = C.ink; g.lineWidth = Math.max(4 * k, 3 * px); g.strokeRect(-R, -R, R * 2, R * 2);
          g.strokeStyle = col; g.lineWidth = Math.max(2 * k, 1.6 * px); g.strokeRect(-R, -R, R * 2, R * 2);
        } else {
          g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2);
          g.globalAlpha = z.state === 'contested' ? 0.5 : 0.3; g.fillStyle = col; g.fill(); g.globalAlpha = 1;
          g.strokeStyle = C.ink; g.lineWidth = Math.max(2.5 * k, 1.8 * px); g.stroke();
          g.strokeStyle = col; g.lineWidth = Math.max(1.4 * k, 1 * px); g.stroke();
          if (z.state === 'contested') {
            g.save(); g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.clip();
            g.strokeStyle = C.ink; g.lineWidth = Math.max(1 * k, 0.8 * px);
            for (let i = -R; i < R; i += 3 * k) { g.beginPath(); g.moveTo(i, -R); g.lineTo(i + R, R); g.stroke(); }
            g.restore();
          }
        }
        g.restore();
        if (!rotate && !tiny) {
          g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 60))}px sans-serif`;
          g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(z.name, a + R + 3, bb + 4);
          g.fillStyle = C.ink; g.fillText(z.name, a + R + 3, bb + 4);
        }
      }
    }

    // ---- 中に入れる建物（天守・櫓・主殿。naka.js）：地図に建物の形と戸口の印（B029：主殿へ着く道が地図で分かるように）----
    for (const I of NAKA.list) {
      if (I.kind === 'gate' || far(I.x, I.z, 2)) continue;
      const lv0 = I.levels[0], hw = lv0.w / 2, hd = lv0.d / 2;
      const q = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => { const [wx, wz] = I.P(lx, lz); return tr(wx, wz); });
      g.beginPath(); q.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath();
      g.globalAlpha = 0.45; g.fillStyle = I.kind === 'goten' ? '#a8824a' : '#8a7a62'; g.fill(); g.globalAlpha = 1;
      g.strokeStyle = C.ink; g.lineWidth = Math.max(1.4 * k, 1 * px); g.stroke();
      const [dx, dz] = I.P(I.door.lx, I.door.side * hd), [da, db] = tr(dx, dz);
      g.fillStyle = '#e8d29a'; g.beginPath(); g.arc(da, db, Math.max(2 * k, 1.5 * px), 0, Math.PI * 2); g.fill(); g.strokeStyle = C.ink; g.lineWidth = Math.max(0.8 * k, 0.7 * px); g.stroke();
    }
    // ---- 束32：rt.nawabari（K＝nawabari.js の makeNawabari の戻り）があれば、場の中心の丸の代わりに
    // 曲輪の形（bbox。K は頂点の poly までは持たないので矩形で近似）を持ち主で塗り分ける。
    // 色だけに頼らず、本丸は太い縁・交戦中は縞・無人は点線。門は小さな印（閉＝横棒・開＝隙間・破れ＝×）----
    if (rt.nawabari && rt.nawabari.kuruwa) {
      const K = rt.nawabari;
      for (const ku of Object.values(K.kuruwa)) {
        const b = ku._box; if (!b) continue;
        const kcx = (b.x0 + b.x1) / 2, kcz = (b.z0 + b.z1) / 2;
        if (far(kcx, kcz, 2) || !sightRef(rt, ku, { x: kcx, z: kcz })) continue;
        const isHon = ku.kind === 'hon';
        const pts = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]].map(([x, z]) => tr(x, z));
        const col = ku.captureState === CAPTURE.FRIEND ? C.ally : ku.captureState === CAPTURE.ENEMY ? C.enemy
          : ku.captureState === CAPTURE.CONTESTED ? '#c2961e' : 'rgba(150,140,120,.8)';
        g.save();
        g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath();
        g.clip();
        g.globalAlpha = ku.captureState === CAPTURE.CONTESTED ? 0.5 : ku.captureState === CAPTURE.EMPTY ? 0.14 : 0.3;
        g.fillStyle = col; g.fill(); g.globalAlpha = 1;
        if (ku.captureState === CAPTURE.CONTESTED) {
          g.strokeStyle = C.ink; g.lineWidth = Math.max(isHon ? 1.2 * k : 1 * k, 0.8 * px);
          const span = Math.max(b.x1 - b.x0, b.z1 - b.z0) * sc + 10;
          for (let i = -span; i < span; i += 3 * k) { g.beginPath(); g.moveTo(pts[0][0] + i, pts[0][1] - span); g.lineTo(pts[0][0] + i + span, pts[0][1] + span); g.stroke(); }
        }
        g.restore();
        g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath();
        g.strokeStyle = isHon ? C.ink : col;
        g.lineWidth = Math.max((isHon ? 3.2 : 1.6) * k, (isHon ? 2.2 : 1) * px);
        if (ku.captureState === CAPTURE.EMPTY) g.setLineDash([3 * k, 3 * k]);
        g.stroke();
        g.setLineDash([]);
        if (!rotate && !tiny) {
          g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 62))}px sans-serif`;
          const [lx, lz] = tr(kcx, kcz);
          g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(ku.name, lx + 4, lz + 4);
          g.fillStyle = C.ink; g.fillText(ku.name, lx + 4, lz + 4);
        }
      }
      for (const gt of Object.values(K.gates || {})) {
        if (!gt.at || far(gt.at.x, gt.at.z) || !sightRef(rt, gt, gt.at)) continue;
        const [a, bb] = tr(gt.at.x, gt.at.z);
        const rr = Math.max(3 * k, 2 * px);
        g.strokeStyle = C.ink; g.lineWidth = Math.max(2 * k, 1.4 * px);
        if (gt.state === GATE_STATE.BROKEN) { g.beginPath(); g.moveTo(a - rr, bb - rr); g.lineTo(a + rr, bb + rr); g.moveTo(a + rr, bb - rr); g.lineTo(a - rr, bb + rr); g.stroke(); }
        else if (gt.state === GATE_STATE.OPEN) { g.beginPath(); g.moveTo(a - rr, bb); g.lineTo(a - rr * 0.3, bb); g.moveTo(a + rr * 0.3, bb); g.lineTo(a + rr, bb); g.stroke(); }
        else { g.beginPath(); g.moveTo(a - rr, bb); g.lineTo(a + rr, bb); g.stroke(); }
      }
    }

    // ---- 大軍の塊：本物の兵に、軽い兵（遠景の大軍・軽い大軍の合戦）の広がりも足して、敵・味方の墨のにじみにする ----
    // 大軍も見通せる物だけ描く。
    {
      const shapes = [[], []];   // [味方, 敵] ごとに、{ pts } か { x, z, r }
      for (const u of rt.army.units) {
        if (!u.alive || u.isPlayer || u.team !== 0 || u.type === 'dummy' || u.type === 'porter' || u.fleeing) continue;
        if (!sightUnit(rt, u)) continue;
        if (far(u.pos.x, u.pos.z)) continue;
        shapes[u.team !== 0 ? 1 : 0].push({ x: u.pos.x, z: u.pos.z, r: 3.2 });
      }
      const W = rt.world, sides = rt.def.sides || {};
      for (const A of W.armies || []) {
        if (!A.mesh || !A.mesh.visible || A.rout) continue;
        const n = (A.n || 0) - (A.took || 0);
        if (n < 6) continue;
        A.mesh.updateMatrixWorld();
        const e = A.mesh.matrixWorld.elements, ox = A.cx + A.off.x, oz = A.cz + A.off.z;
        const x = e[0] * ox + e[8] * oz + e[12], z = e[2] * ox + e[10] * oz + e[14];
        if (far(x, z, 2.2)) continue;
        // 軍配（gunbai.js）と同じ見分け：戦の定義の両軍の家紋、敵方の家紋
        const team = A.team !== undefined ? A.team : sides.b && A.mon === sides.b.mon ? 1 : sides.a && A.mon === sides.a.mon ? 0 : ENEMY_MON.has(A.mon) ? 1 : 0;
        if (team) continue;
        // 広がりは数から見積もる（横に長い備：幅は奥行きのおよそ三倍）
        const wd = Math.sqrt(n * 1.5 * 3), dp = n * 1.5 / wd, F = A.facing || 0, fc = Math.cos(F), fs = Math.sin(F), pts = [];
        for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2, lx = Math.cos(t) * wd / 2, lz = Math.sin(t) * dp / 2; pts.push(tr(x + lx * fc + lz * fs, z - lx * fs + lz * fc)); }
        shapes[team ? 1 : 0].push({ pts });
      }
      for (const Cl of W.clashes || []) {
        if (!Cl.blocks || !Cl.frontAt) continue;
        if (far(Cl.x, Cl.z, 2.5)) continue;
        for (const Sd of [Cl.A, Cl.B]) {
          if (!Sd || !Sd.P || Sd.P.hidden || Sd.routed || !Sd.alive) continue;
          if (!sightRef(rt, Cl, Cl)) continue;
          const team = Sd.P.team !== undefined ? Sd.P.team : Sd === Cl.A ? 0 : 1;
          if (team) continue;
          // 前線の列から後ろへ、残った数の厚み（後詰めがあれば厚く）
          const D = ((Sd.rows || 4) * 1.15 + (Sd.host ? 12 : 3)) * Math.max(0.3, Sd.alive / (Sd.n0 || Sd.alive)), g0 = (Cl.o && Cl.o.gap || 3.4) / 2;
          const front = [], back = [];
          for (let j = 0; j < Cl.nb; j++) { const a = Cl.frontAt(j, -Sd.sgn * g0), b = Cl.frontAt(j, -Sd.sgn * (g0 + D)); front.push(tr(a.x, a.z)); back.push(tr(b.x, b.z)); }
          shapes[team ? 1 : 0].push({ pts: front.concat(back.reverse()) });
        }
      }
      // 二度塗り：外は淡く広く、芯は濃く。塊が重なっても濃くなりすぎないよう、下地に塗ってから一度に重ねる
      for (let t = 0; t < 2; t++) {
        if (!shapes[t].length) continue;
        const L = this.massLayer(t, Sz), m = L.getContext('2d');
        for (const [grow, alpha] of [[1.5, 0.16], [1, 0.2]]) {
          m.clearRect(0, 0, Sz, Sz);
          m.fillStyle = t ? C.enemy : C.ally; m.strokeStyle = m.fillStyle; m.lineJoin = 'round';
          m.lineWidth = Math.max(2, 5 * sc * grow);
          for (const s of shapes[t]) {
            m.beginPath();
            if (s.pts) { s.pts.forEach(([a, b], i) => (i ? m.lineTo(a, b) : m.moveTo(a, b))); m.closePath(); m.fill(); m.stroke(); }
            else { const [a, b] = tr(s.x, s.z); m.arc(a, b, Math.max(1.5 * px, s.r * sc * grow), 0, Math.PI * 2); m.fill(); }
          }
          g.globalAlpha = alpha; g.drawImage(L, 0, 0); g.globalAlpha = 1;
        }
      }
    }

    // ---- 鉄砲隊の向き：筒先の向きへ、玉の届く扇（敵の扇は小さい時も描く。味方は大きい時だけ） ----
    for (const grp of rt.army.groups) {
      if (!grp.count || grp.routed || grp.name === 'player') continue;
      if (!(grp.isGun || (grp._kind || groupKind(grp)) === 'gun')) continue;
      const c = grp.center();
      if (far(c.x, c.z)) continue;
      if (grp.team !== 0 && !seen(c.x, c.z, grp)) continue;
      if (grp.team !== 0 || tiny) continue;
      const f = grp.forward(), fa = Math.atan2(f.x, f.z), R = 45;
      const [a0, b0] = tr(c.x, c.z);
      g.beginPath(); g.moveTo(a0, b0);
      for (let i = 0; i <= 6; i++) { const t = fa - 0.3 + i * 0.1; const [a, b] = tr(c.x + Math.sin(t) * R, c.z + Math.cos(t) * R); g.lineTo(a, b); }
      g.closePath();
      g.fillStyle = grp.team !== 0 ? 'rgba(178,51,31,.14)' : 'rgba(44,79,134,.12)'; g.fill();
      g.strokeStyle = grp.team !== 0 ? 'rgba(178,51,31,.55)' : 'rgba(44,79,134,.45)'; g.lineWidth = Math.max(1.4 * k, 1.1 * px);
      g.setLineDash([5 * k, 4 * k]); g.stroke(); g.setLineDash([]);
    }

    // ---- 兵の点（小さい時は塊だけにして、点は描かない） ----
    if (!tiny) for (const u of rt.army.units) {
      if (!u.alive || u.isPlayer || u.type === 'dummy') continue;
      if (u.team !== 0) continue;
      if (!sightUnit(rt, u)) continue;
      if (far(u.pos.x, u.pos.z)) continue;
      const [a, b] = tr(u.pos.x, u.pos.z);
      if (u.team !== 0) {
        // 敵は三角（色だけに頼らない）
        g.fillStyle = u.fleeing ? 'rgba(178,51,31,.4)' : C.enemy;
        g.beginPath(); g.moveTo(a, b - r0 * 0.9); g.lineTo(a + r0 * 0.8, b + r0 * 0.6); g.lineTo(a - r0 * 0.8, b + r0 * 0.6); g.closePath(); g.fill();
      } else if (u.isSub) {
        g.fillStyle = C.own;
        g.beginPath(); g.arc(a, b, r0 * 0.7, 0, Math.PI * 2); g.fill();
      } else {
        g.fillStyle = u.invuln && u.name ? C.gold : C.ally;
        g.fillRect(a - r0 / 2, b - r0 / 2, r0, r0);
      }
    }
    const missionEnemy = rt.def.commanderSignTarget?.(rt) || (inou || rt.def.key === 'moribe' || rt.def.missionSingleLine || rt.def.mapMissionEnemy ? markedEnemy(rt) : null);
    // 名のある敵将は小さな地図でも菱形。点と同じ見通し判定で、文字は添えない。
    for (const u of rt.army.units) {
      if (u === missionEnemy || u.team === 0 || !u.name || !u.alive || u.gone || u.dying || u.woundOut || u.type === 'dummy') continue;
      if (far(u.pos.x, u.pos.z) || !sightUnit(rt, u)) continue;
      const [a, b] = tr(u.pos.x, u.pos.z), r = 6 * px;
      g.beginPath(); g.moveTo(a, b - r); g.lineTo(a + r, b); g.lineTo(a, b + r); g.lineTo(a - r, b); g.closePath();
      g.strokeStyle = C.ink; g.lineWidth = 4 * px; g.stroke();
      g.strokeStyle = C.paper; g.lineWidth = 2 * px; g.stroke();
      g.fillStyle = C.enemy; g.fill();
    }
    // ---- 自分の組：組の者を囲む輪（墨の縁に金茶） ----
    for (const grp of rt.squadGroups || []) {
      if (!grp.count) continue;
      const c = grp.center();
      let rr = 2;
      for (const u of grp.units) if (u.alive) rr = Math.max(rr, Math.hypot(u.pos.x - c.x, u.pos.z - c.z));
      const [a, b] = tr(c.x, c.z), R = Math.max(r0 * 1.8, (rr + 1.5) * sc);
      g.strokeStyle = C.paper; g.lineWidth = Math.max(4 * k, 3.2 * px); g.beginPath(); g.arc(a, b, R, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = C.own; g.lineWidth = Math.max(2 * k, 1.8 * px); g.beginPath(); g.arc(a, b, R, 0, Math.PI * 2); g.stroke();
    }
    // 組を向かわせた行き先（前進の号令・地図での指図）：戦場の地面と同じ白い小旗と点線。使番が走っている間は薄く
    for (const grp of rt.squadGroups || []) {
      const pend = grp.pending && grp.pending.st.order === 'move' ? grp.pending.st : null;
      const dest = pend ? pend.dest : grp.order === 'move' ? grp.dest : null;
      if (!dest || !grp.count) continue;
      const c = grp.center();
      const [a1, b1] = tr(c.x, c.z), [a2, b2] = tr(dest.x, dest.z);
      g.save();
      g.globalAlpha = pend ? 0.6 : 1;
      g.strokeStyle = 'rgba(27,23,18,.75)'; g.lineWidth = 1.6 * k; g.setLineDash([4 * k, 5 * k]);
      g.beginPath(); g.moveTo(a1, b1); g.lineTo(a2, b2); g.stroke();
      g.setLineDash([]);
      this.flagIcon(g, a2, b2, r0 * 4.2);
      g.restore();
    }
    // 味方の武将：台詞・隊の札と同じ番号。地図の外なら縁の四角に番号を置く。
    // 小さい丸は一隊だけ、ほかは三隊まで。字は画面上で十二画素以上。
    if (rotate && !inou) {
      let drawn = 0;
      g.font = `${Math.ceil(12 * px)}px sans-serif`;
      const rim = Sz / 2 - 10 * px;
      for (const row of rt.allyMapRows || []) {
        if (!row.active || drawn >= (tiny || rt.def.compactMapAllies ? 1 : 3) || !sightRef(rt, row, row)) continue;
        let [a, b] = tr(row.x, row.z);
        const dx = a - Sz / 2, dy = b - Sz / 2, dist = Math.hypot(dx, dy);
        if (dist > rim) { a = Sz / 2 + dx / dist * rim; b = Sz / 2 + dy / dist * rim; }
        const R = 8 * px, badge = ['anegawa', 'shitaragahara'].includes(rt.def.key) ? `隊${row.number}` : String(row.number);
        const half = Math.max(R, g.measureText(badge).width / 2 + 2 * px);
        g.fillStyle = C.ally; g.fillRect(a - half, b - R, half * 2, R * 2);
        g.strokeStyle = C.ink; g.lineWidth = px; g.strokeRect(a - half, b - R, half * 2, R * 2);
        g.fillStyle = '#fff6e5'; g.textAlign = 'center'; g.fillText(badge, a, b + 4 * px); g.textAlign = 'left';
        // 小さい丸は番号札だけにして、武将名・行動の字との重なりをなくす。
        if (tiny || rt.def.compactMapAllies) { drawn++; continue; }
        const short = row.action === '移動中' ? '進む' : row.action === '戦っている' ? '戦う' : row.action === '攻めている' ? '攻める' : row.action === '逃げている' || row.action === '退いている' ? '退く' : '待つ';
        const label = `${row.number} ${row.name} ${short}`;
        // 字の上端・下端も丸の内側へ。縁と和紙の縁取りを避けた幅に収める。
        const ly = Sz / 2 + (drawn - 1) * 14 * px + 4 * px;
        const radius = Sz / 2 - 2 * px;
        const labelDy = Math.max(Math.abs(ly - Math.ceil(12 * px) - Sz / 2), Math.abs(ly - Sz / 2));
        const maxWidth = Math.max(px, 2 * Math.sqrt(Math.max(0, radius * radius - labelDy * labelDy)) - 4 * px);
        const width = Math.min(g.measureText(label).width, maxWidth), lx = (Sz - width) / 2;
        g.strokeStyle = C.paper; g.lineWidth = 4 * px; g.strokeText(label, lx, ly, maxWidth);
        g.fillStyle = C.ink; g.fillText(label, lx, ly, maxWidth);
        drawn++;
      }
    }
    // 任務の印は札・戦場と同じ一つにそろえる。
    const destination = S.reduceGuidance || rt.missionGuide?.objective !== currentObjective(rt) ? null : rt.missionGuide?.marker;
    for (const m of rt.markers) {
      if (!rt.def.town && !rt.def.dojo && m !== destination && !m.person) continue;
      const q = typeof m.pos === 'function' ? m.pos() : m.pos;
      if (!q || m.red || (m.group && m.group.team !== 0) || m.intelHidden || ((m.red || m.person) && !sightRef(rt, m, q))) continue;
      let [a, b] = tr(q.x, q.z);
      const col = m.red ? C.enemy : '#c2961e';
      const rr = Math.hypot(a - Sz / 2, b - Sz / 2), rim = Sz / 2 - r0 * 3.2 - (tiny ? 3 * px : 0);
      const big = tiny ? 1.5 : 1;
      if (rotate && rr > rim) {
        const ang = Math.atan2(b - Sz / 2, a - Sz / 2);
        a = Sz / 2 + Math.cos(ang) * rim; b = Sz / 2 + Math.sin(ang) * rim;
        g.save(); g.translate(a, b); g.rotate(ang); g.scale(big, big);
        g.beginPath(); g.moveTo(r0 * 2.4, 0); g.lineTo(-r0 * 1.2, -r0 * 1.7); g.lineTo(-r0 * 1.2, r0 * 1.7); g.closePath();
        g.fillStyle = col; g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke(); g.fill();
        g.restore();
        continue;
      }
      g.save(); g.translate(a, b); g.rotate(Math.PI / 4); g.scale(big, big);
      g.strokeStyle = C.ink; g.lineWidth = 6; g.strokeRect(-r0 * 1.4, -r0 * 1.4, r0 * 2.8, r0 * 2.8);
      g.strokeStyle = col; g.lineWidth = 3; g.strokeRect(-r0 * 1.4, -r0 * 1.4, r0 * 2.8, r0 * 2.8);
      g.restore();
      if (!rotate && !inou) {
        g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 50))}px sans-serif`;
        const t = typeof m.label === 'function' ? m.label() : m.label;
        g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText(t, a + r0 * 2, b + 4);
        g.fillStyle = m.red ? C.enemy : C.ink; g.fillText(t, a + r0 * 2, b + 4);
      }
    }
    // 戦術マップでは部隊ごとの向きと、戦場と同じ形の隊旗（幟＝槍・弓、四角＝鉄砲、吹流し＝騎馬、大旗＝本陣）
    if (!rotate) {
      g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 62))}px sans-serif`;
      const selSet = new Set(rt.squad.length ? rt.player.selectedGroups() : []);
      const many = rt.squadGroups.filter((x) => x.count > 0).length > 1;
      const fh = r0 * 3.6;
      for (const grp of rt.army.groups) {
        if (grp.team !== 0 || !grp.count || grp.name === 'player' || grp.units.every((u) => !u.alive || u.type === 'dummy' || u.type === 'porter')) continue;
        const c = grp.center();
        // 名のある敵将の隊も、今見通せる時だけ描く。
        if (grp.team !== 0 && (!weatherSees(rt.world, PU, c) || !seen(c.x, c.z, grp))) continue;
        const [a, b] = tr(c.x, c.z);
        const f = grp.forward();
        const [a2, b2] = tr(c.x + f.x * 10, c.z + f.z * 10);
        const col = grp.team !== 0 ? C.enemy : grp.isPlayerSquad ? C.own : C.ally;
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(a, b); g.lineTo(a2, b2); g.stroke();
        // 号令先に選んだ自分の組は、戦場と同じ金の輪
        if (grp.isPlayerSquad && selSet.has(grp) && (many || rt.player.cmdOpen)) {
          g.strokeStyle = '#120f0b'; g.lineWidth = 5; g.beginPath(); g.arc(a, b, r0 * 3.2, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = '#d8b04a'; g.lineWidth = 2.5; g.beginPath(); g.arc(a, b, r0 * 3.2, 0, Math.PI * 2); g.stroke();
        }
        const kind = grp._kind || groupKind(grp);
        // 乱れた隊は旗が傾く（戦場の旗と同じ）
        const lean = grp.routed ? 0.85 : grp.morale < 30 ? 0.32 : grp.morale < 55 ? 0.13 : 0;
        if (grp.team === 0 || (kind !== 'honjin' || (campKnown(rt) && grp.units.every((u) => !u.isOfficer || enemyKnown(rt, u))))) this.stdIcon(g, a + r0 * 1.6, b, fh, kind, col, lean);
        // 自分の組は旗の下に数の札（戦場の札と同じ色）
        if (grp.isPlayerSquad) {
          const tc = TAG_COL[tagOf(grp)];
          g.fillStyle = '#120f0b'; g.fillRect(a + r0 * 1.6 - 1, b + 2 - 1, r0 * 1.6 + 2, r0 * 1.2 + 2);
          g.fillStyle = tc; g.fillRect(a + r0 * 1.6, b + 2, r0 * 1.6, r0 * 1.2);
        }
        g.fillStyle = col;
        // 字は要る時だけ：自分の組は隊の名、敵は乱れた時だけ（意気盛ん・平常は書かない）
        const report = grp.team === 0 && rt.allyOrders && rt.allyOrders.find((r) => r.g === grp && r.active);
        const lbl = inou ? grp === ownGroup ? '自分の組' : grp === (oke ? rt.flags.nob : rt.flags.nobuGroup) ? '織田信長' : '' : grp.isPlayerSquad ? ((rt.squadGroups.length > 1 ? GROUP_NAME[grp.kind] : '') || '自分の組') + (grp.morale < 50 ? ` ${moraleWord(grp.morale)}` : '') : grp.team !== 0 ? (grp.routed ? '潰走' : grp.morale < 50 ? moraleWord(grp.morale) : '') : report ? `${report.number} ${report.name}・${report.action}` : '';
        if (report) g.font = `${Math.ceil(12 * px)}px sans-serif`;
        if (lbl) drawName(lbl, a + r0 * 4.6, b - 4);
      }
    }
    // 稲生・森部の行き先：兵は▼、名のある敵将は菱形。白い矢印は自分だけ。
    if (missionEnemy && (rt.def.mapCommanderAlways || inouSignVisible(rt, missionEnemy))) {
      let [a, b] = tr(missionEnemy.pos.x, missionEnemy.pos.z);
      const dx = a - Sz / 2, dy = b - Sz / 2, distance = Math.hypot(dx, dy);
      const rim = Sz / 2 - 10 * px;
      if (rotate && distance > rim) { a = Sz / 2 + dx / distance * rim; b = Sz / 2 + dy / distance * rim; }
      // 自分と目標が近くても印を重ねず、線の先で実際の位置を示す。
      const [selfX, selfY] = tr(p.pos.x, p.pos.z);
      const ex = a - selfX, ey = b - selfY, gap = Math.hypot(ex, ey), space = 18 * px;
      if (gap < space) {
        const x = a, y = b;
        a = selfX + (gap > .01 ? ex / gap : 0) * space;
        b = selfY + (gap > .01 ? ey / gap : -1) * space;
        g.strokeStyle = C.ink; g.lineWidth = 2 * px;
        g.beginPath(); g.moveTo(x, y); g.lineTo(a, b); g.stroke();
      }
      const r = (missionEnemy.name ? 8 : 6) * px;
      g.beginPath();
      if (missionEnemy.name) {
        g.moveTo(a, b - r); g.lineTo(a + r, b); g.lineTo(a, b + r); g.lineTo(a - r, b);
      } else {
        g.moveTo(a - r, b - r); g.lineTo(a + r, b - r); g.lineTo(a, b + r);
      }
      g.closePath();
      g.lineJoin = 'round'; g.strokeStyle = C.ink; g.lineWidth = 5 * px; g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 2.5 * px; g.stroke();
      g.fillStyle = '#a33124'; g.fill();
    }
    // 自分：墨の矢印に和紙の縁
    const [pa, pb] = tr(p.pos.x, p.pos.z);
    g.save(); g.translate(pa, pb);
    g.rotate(rotate && !northUp ? 0 : -(p.heading - Math.PI));
    if (tiny) g.scale(1.35, 1.35);
    g.beginPath(); g.moveTo(0, -r0 * 2.4); g.lineTo(r0 * 1.4, r0 * 1.5); g.lineTo(0, r0 * 0.8); g.lineTo(-r0 * 1.4, r0 * 1.5); g.closePath();
    g.strokeStyle = C.paper; g.lineWidth = 3; g.stroke();
    g.fillStyle = C.ink; g.fill();
    g.restore();
    g.restore();
    if (rotate) {
      // 墨の縁（筆で引いた輪。太さに少しむら）
      g.strokeStyle = 'rgba(27,23,18,.8)'; g.lineWidth = Math.max(3 * k, 1.6 * px);
      g.beginPath(); g.arc(Sz / 2, Sz / 2, Sz / 2 - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(27,23,18,.45)'; g.lineWidth = Math.max(2 * k, px);
      g.beginPath(); g.arc(Sz / 2 + 0.6 * px, Sz / 2 - 0.4 * px, Sz / 2 - 2.5 * px, 2.4, 5.6); g.stroke();
      // 北の方角（小さい時は描かない：丸が小さく、字が潰れる）
      if (!tiny) {
        const R = Sz / 2 - Math.max(16, 10 * px);
        const nx = Sz / 2 - Math.sin(yaw) * R, ny = Sz / 2 + Math.cos(yaw) * R;
        g.font = `bold ${Math.max(Math.ceil(12 * px), Math.round(Sz / 14))}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 4; g.strokeStyle = C.paper; g.strokeText('北', nx, ny);
        g.fillStyle = '#8a2a18'; g.fillText('北', nx, ny);
        g.textAlign = 'start'; g.textBaseline = 'alphabetic';
      }
    } else {
      g.font = `${Math.max(Math.ceil(12 * px), Math.round(Sz / 40))}px sans-serif`;
      const northY = Math.max(26, 16 * px);
      g.textAlign = 'center';
      g.lineWidth = 3; g.strokeStyle = C.paper; g.strokeText('北 ↑', Sz / 2, northY);
      g.fillStyle = C.ink; g.fillText('北 ↑', Sz / 2, northY);
      g.textAlign = 'start';
    }
  }
}
