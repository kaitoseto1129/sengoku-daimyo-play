// 布陣の表（fujin_table.js）を並べる共通の仕組み（11/14 束A）。battle.js が毎コマ呼ぶ。表のある戦だけ働く。
//   見せかけの兵は作らず、備ごとに「本物の備」を置く（同じ名は一つ・兵の装束はその戦の兵から・旗と具足は表のとおり）。
import { FUJIN } from './fujin_layout.js';
import { realFromLight } from './depth_reserve.js';
import { isTouch } from './touch.js';
import { nobori } from './props.js';
import * as THREE from 'three';
import { drawMon } from './textures.js';

export function fujinFor(rt) {
  const id = rt.def && (rt.def.key || rt.def.id);
  return id && FUJIN[id] ? FUJIN[id] : null;
}
export function fujinTick(rt, enemyGroup, allyGroup) {
  const T = fujinFor(rt); if (!T || rt.def.ownFujin) return;
  // 11/15 クラウドわ（K315「行けばいる」）：表が lazy の戦は、初めに遠かった備を取っておき、本人が近づいたら（1秒ごとに見る）その時に出す
  if (rt.flags._fj) { if (rt.flags._fjPend && rt.flags._fjPend.length && rt.player?.u && (rt.t || 0) >= (rt.flags._fjPendT || 0)) { rt.flags._fjPendT = (rt.t || 0) + 1; const P = rt.flags._fjPend; rt.flags._fjPend = []; placeRows(rt, T, P, rt.flags._fj, enemyGroup, allyGroup); } return; }
  if (!rt._tpl || !rt._tpl.E || !rt._tpl.A || !rt.player?.u) return;   // 兵の装束が覚えられてから（戦の始めの数コマ後）
  const me = rt.player.u.pos, list = rt.flags._fj = [];
  // 11/14 クラウドさ（K287②・K292「備は細い一本線で図鑑の厚い列・旗の林に遠い」）：表の行に blocks があれば、その列を大名・将ごとの塊に分ける
  //   （塊ごとに家の旗・ranks の段の厚み・nobori で塊の後ろに家の幟を林のように立てる。本物の兵と立てた幟だけ）。携帯は一列に二塊まで
  const rows = [];
  for (const r of T.rows) {
    if (!r.blocks || !r.blocks.length) { rows.push(r); continue; }
    const B = isTouch ? r.blocks.slice(0, 2) : r.blocks, K = B.length, c = Math.cos(r.facing || 0), s = Math.sin(r.facing || 0);
    B.forEach((b, k) => {
      const off = K > 1 ? ((k + 0.5) / K - 0.5) * r.w * 0.92 : 0;   // 列の横（向きに直角）に並べる
      rows.push({ ...r, x: r.x + c * off, z: r.z - s * off, w: r.blockW || 10, count: r.blockCount || 480, name: b.name || b.lead + 'の備', leaders: b.lead && (!b.onField || !rt.army.units.some((u) => u.alive && u.name === b.lead)) ? [b.lead] : null, standIn: b.onField ? b.lead : null, flag: b.flag || r.flag, block: true });
    });
  }
  placeRows(rt, T, rows, list, enemyGroup, allyGroup);
}
function placeRows(rt, T, rows, list, enemyGroup, allyGroup) {
  const me = rt.player.u.pos;
  for (const r of rows) {
    if (Math.hypot(r.x - me.x, r.z - me.z) > (r.far ? 260 : isTouch ? 140 : 190)) { if (T.lazy) (rt.flags._fjPend || (rt.flags._fjPend = [])).push(r); continue; }   // far：本人の先の山場に立つ備（関ヶ原の宇喜多の二の備）
    try {
      const g = realFromLight(rt, { x: r.x, z: r.z, w: r.w, d: r.d, count: r.count, facing: r.facing, team: r.side, look: { flag: r.flag, armor: r.armor }, min: isTouch ? (r.block ? 6 : 5) : (r.block ? 32 : 8) },
        enemyGroup, allyGroup, isTouch ? 0.02 : 0.12, isTouch ? (r.block ? 6 : 9) : (r.block ? (r.blockMax || 44) : 36), r.name, r.leaders && r.leaders.length ? r.leaders : null);
      // 11/14 クラウドす（K127「振り返ると何も無い」）：表の keep の戦は、本人が先へ出ても frontFill の上限の刈り込みで後ろの備を消さない（u.keepReal）
      if (g && T.keep) for (const u of g.units || []) u.keepReal = true;
      // 11/14 クラウドわ（K287「岡山口の秀忠の札が出ない」）：段の途中で本物が作られる大将（onField・秀忠）は、まだいない間は塊の頭に名だけの代わりを立てる（討たれない）。本物が出たら段の側が代わりの名を外す
      if (g && r.standIn) for (const u of g.units || []) if (u.name === r.standIn) { u._standIn = true; u.invuln = true; }
      if (g) { g._fujinRow = r.row; list.push(g); if (r.block) blockLook(rt, g, r); if (!isTouch) overheadPlate(rt, g, r); }
    } catch (e) { window.__fujinErr = String(e && e.stack || e).slice(0, 300); }
  }
}

// 塊の厚みと旗の林（表の行の ranks・nobori）。幟は塊の後ろに二重（前は五本・後ろは四本。携帯は前の三本だけ）。
//   布は向きに直角（寄せる側から布の面が見える）。天王寺では豊臣方が根元に寄れば倒れる（hata_taore.js の一覧へ入れる）
function blockLook(rt, g, r) {
  // 11/14 MB一 K297（関ヶ原の見開き＝備は幅より奥行きのある厚い塊）：塊の段は表の ranks か、人数からほぼ四角になる段数の大きい方。間隔も詰める（1.5→1.15）
  const n0u = (g.units || []).length || g.initial || 30;
  g.yariRanks = isTouch ? Math.min(3, r.ranks || 3) : Math.max(r.ranks || 4, Math.ceil(Math.sqrt(n0u / 1.6)));
  g.spacing = isTouch ? 1.35 : 1.15;
  // 11/14 クラウドわ（K287①司令塔「真上から見て陣が点の格子。幅より奥行きのある厚い塊に」）：表が deep の戦は、段を人数の√1.4 倍（45人で八段×六列）にして
  //   幅より奥行きを深くし、間隔を肩の触れる 0.92m に詰める（人数は同じ＝重さは変わらない）。携帯は四段・1.1m
  const T = fujinFor(rt);
  if (T && T.deep) { g.yariRanks = isTouch ? Math.max(4, g.yariRanks) : Math.max(g.yariRanks, Math.ceil(Math.sqrt(n0u * 1.4))); g.spacing = isTouch ? 1.1 : 0.92; }
  if (!r.nobori) return;
  const f = r.facing || 0, fx = Math.sin(f), fz = Math.cos(f), lx = Math.cos(f), lz = -Math.sin(f), hs = rt.flags._hata;
  const n0 = isTouch ? 3 : 10, n1 = isTouch ? 0 : 8;   // 11/14 MB一 K297：見開きは塊の上に旗が林（5→8・4→6）
  for (let j = 0; j < n0 + n1; j++) {
    const back = j >= n0, m = back ? n1 : n0, jj = back ? j - n0 : j;
    const side = ((jj + 0.5) / m - 0.5) * (back ? 9 : 11), dep = (back ? 8.2 : 5.6) + Math.sin(j * 2.7 + r.x) * 0.5;
    const x = r.x + lx * side - fx * dep, z = r.z + lz * side - fz * dep;
    try {
      const nb = nobori(rt.world, x, z, r.flag, back ? 6.2 : 5.2);
      nb.userData.foot = { x, z };
      nb.rotation.y = f + Math.PI + Math.sin(j * 1.9 + r.x) * 0.15;
      rt.scene.add(nb);
      if (hs && hs.line && r.side !== 1) hs.line.push(nb);   // 11/14 クラウドか：豊臣方（敵）の幟は自分の兵で倒れないよう、倒れる一覧へ入れない
    } catch (e) { /* 幟が作れない時は省く */ }
  }
}

// 11/14 クラウドせ（K287②「真上から見ると兵は細かい点で、陣の塊・旗が見えない」）：真上（本人より 40m 以上高い視点）の時だけ、
//   備の兵が今いる所に、その備の広さの色の塊（味方は藍・敵は赤）と家の旗の紋を地に重ねる（布陣図の札の見え方）。
//   遊ぶ時の肩越しの視点では透明（描かない）。塊の広さと所は 1 秒ごとに兵の今の散らばりから取り直す（動く備にも付いていく）。携帯は作らない
const PLATE_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const PLATE_MON = new Map();
// 旗の紋の絵（布の汚しは要らない。縁は味方の藍・敵の赤）。家ごとに一枚
function plateMon(kind, foe) {
  const key = kind + (foe ? '|e' : '|a'); if (PLATE_MON.has(key)) return PLATE_MON.get(key);
  let t = null;
  try {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
    drawMon(g, kind, 64, 128, false, false);
    g.strokeStyle = foe ? '#c23a2c' : '#2f58b0'; g.lineWidth = 10; g.strokeRect(5, 5, 54, 118);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  } catch (e) { t = null; }
  PLATE_MON.set(key, t); return t;
}
function overheadPlate(rt, g, r) {
  const foe = r.side === 1, mk = (o) => new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0, ...o });
  const fill = new THREE.Mesh(PLATE_GEO, mk({ color: foe ? 0xc23a2c : 0x2f58b0 }));
  const tex = plateMon(r.flag, foe);
  const mon = tex ? new THREE.Mesh(PLATE_GEO, mk({ map: tex })) : null;
  fill.renderOrder = 30; if (mon) mon.renderOrder = 31;
  fill.frustumCulled = false; if (mon) mon.frustumCulled = false;
  const f = r.facing || 0, ca = Math.cos(f), sa = Math.sin(f);
  let next = -1, alive = 0;
  const fit = () => {
    let sx = 0, sz = 0, n = 0;
    for (const u of g.units) if (u.alive && !u.gone) { sx += u.pos.x; sz += u.pos.z; n++; }
    alive = n; if (!n) return;
    const cx = sx / n, cz = sz / n; let hw = 2, hd = 2;
    for (const u of g.units) if (u.alive && !u.gone) { const dx = u.pos.x - cx, dz = u.pos.z - cz; hw = Math.max(hw, Math.abs(dx * ca - dz * sa)); hd = Math.max(hd, Math.abs(dx * sa + dz * ca)); }
    hw = Math.min(24, hw + 1.5); hd = Math.min(16, hd + 1.5);
    const y = (rt.world?.heightAt?.(cx, cz) ?? 0) + 0.5;
    fill.position.set(cx, y, cz); fill.rotation.y = f; fill.scale.set(hw * 2, 1, hd * 2);
    if (mon) { const m = Math.max(10, Math.min(hw * 2, hd * 2.4)); mon.position.set(cx, y + 0.05, cz); mon.scale.set(m * 0.5, 1, m); }
  };
  fill.onBeforeRender = (ren, sc, cam) => {
    const me = rt.player?.u?.pos, k = me ? Math.max(0, Math.min(1, (cam.position.y - me.y - 40) / 40)) : 0;
    if (k > 0 && (rt.t ?? 0) >= next) { next = (rt.t ?? 0) + 1; fit(); }
    const a = alive ? k : 0; fill.material.opacity = a * 0.04;   // 11/14 クラウドと（K287①司令塔）：塗りの四角を薄く（0.42→0.16）。兵の厚みを隠さない
    if (mon) mon.material.opacity = a * 0.95;
  };
  rt.scene.add(fill); if (mon) rt.scene.add(mon);
}
