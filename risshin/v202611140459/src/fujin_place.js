// 布陣の表（fujin_table.js）を並べる共通の仕組み（11/14 束A）。battle.js が毎コマ呼ぶ。表のある戦だけ働く。
//   見せかけの兵は作らず、備ごとに「本物の備」を置く（同じ名は一つ・兵の装束はその戦の兵から・旗と具足は表のとおり）。
import { FUJIN } from './fujin_layout.js';
import { realFromLight } from './depth_reserve.js';
import { isTouch } from './touch.js';
import { nobori } from './props.js';

export function fujinFor(rt) {
  const id = rt.def && (rt.def.key || rt.def.id);
  return id && FUJIN[id] ? FUJIN[id] : null;
}
export function fujinTick(rt, enemyGroup, allyGroup) {
  const T = fujinFor(rt); if (!T || rt.def.ownFujin || rt.flags._fj) return;
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
      rows.push({ ...r, x: r.x + c * off, z: r.z - s * off, w: 10, count: r.blockCount || 150, name: b.name || b.lead + 'の備', leaders: b.lead && !b.onField ? [b.lead] : null, flag: b.flag || r.flag, block: true });
    });
  }
  for (const r of rows) {
    if (Math.hypot(r.x - me.x, r.z - me.z) > (isTouch ? 140 : 190)) continue;
    try {
      const g = realFromLight(rt, { x: r.x, z: r.z, w: r.w, d: r.d, count: r.count, facing: r.facing, team: r.side, look: { flag: r.flag, armor: r.armor }, min: isTouch ? (r.block ? 6 : 5) : (r.block ? 18 : 8) },
        enemyGroup, allyGroup, isTouch ? 0.02 : 0.12, isTouch ? (r.block ? 6 : 9) : (r.block ? 18 : 36), r.name, r.leaders && r.leaders.length ? r.leaders : null);
      if (g) { g._fujinRow = r.row; list.push(g); if (r.block) blockLook(rt, g, r); }
    } catch (e) { window.__fujinErr = String(e && e.stack || e).slice(0, 300); }
  }
}

// 塊の厚みと旗の林（表の行の ranks・nobori）。幟は塊の後ろに二重（前は五本・後ろは四本。携帯は前の三本だけ）。
//   布は向きに直角（寄せる側から布の面が見える）。天王寺では豊臣方が根元に寄れば倒れる（hata_taore.js の一覧へ入れる）
function blockLook(rt, g, r) {
  if (r.ranks) g.yariRanks = isTouch ? Math.min(3, r.ranks) : r.ranks;
  if (!r.nobori) return;
  const f = r.facing || 0, fx = Math.sin(f), fz = Math.cos(f), lx = Math.cos(f), lz = -Math.sin(f), hs = rt.flags._hata;
  const n0 = isTouch ? 3 : 5, n1 = isTouch ? 0 : 4;
  for (let j = 0; j < n0 + n1; j++) {
    const back = j >= n0, m = back ? n1 : n0, jj = back ? j - n0 : j;
    const side = ((jj + 0.5) / m - 0.5) * (back ? 6 : 8), dep = (back ? 7.6 : 5.4) + Math.sin(j * 2.7 + r.x) * 0.5;
    const x = r.x + lx * side - fx * dep, z = r.z + lz * side - fz * dep;
    try {
      const nb = nobori(rt.world, x, z, r.flag, back ? 6.2 : 5.2);
      nb.userData.foot = { x, z };
      nb.rotation.y = f + Math.PI + Math.sin(j * 1.9 + r.x) * 0.15;
      rt.scene.add(nb);
      if (hs && hs.line) hs.line.push(nb);
    } catch (e) { /* 幟が作れない時は省く */ }
  }
}
