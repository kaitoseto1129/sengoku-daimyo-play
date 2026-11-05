// 右上の地図に出す城・砦・寺の場所（kaito 11/3 AQ）。印は小さな城の形。目標の城は少し大きく。
//   rt.sites：buildCastlePlan など城を組む所が addSite で足す。組まない戦は下の表（戦の鍵 → 場所）で補う。
const TABLE = {
  // 戦の定義の中の目印の座標（b_*.js の定数と同じ値）。形を作る戦は addSite が足すので重ねない（30m 以内は一つに）
  hetsugi: [{ k: 'castle', x: 40, z: -232 }],
  t06_hetsugi: [{ k: 'castle', x: 70, z: -150 }, { k: 'fort', x: -170, z: 84 }],
  sune: [{ k: 'castle', x: -70, z: -140 }],
  t02_shizugatake: [{ k: 'fort', x: -56, z: 306 }, { k: 'fort', x: 75, z: 100 }, { k: 'fort', x: -170, z: 15 }],
  t05_ichinomiya: [{ k: 'fort', x: 30, z: 52 }],
  t10_oshi: [{ k: 'castle', x: -95, z: -108 }],
  t12_odawara: [{ k: 'castle', x: 51, z: -131 }],
  tennoji: [{ k: 'fort', x: 0, z: -62 }],
  k15_tennoji_okayama: [{ k: 'castle', x: 60, z: -272 }],
  k08_osaka_kizu: [{ k: 'fort', x: 0, z: -34 }],
  k09_imafuku: [{ k: 'fort', x: 0, z: -78 }],
  nagashima: [{ k: 'fort', x: 0, z: -74 }],
  inou: [{ k: 'fort', x: -92, z: -68 }],
  inabayama: [{ k: 'temple', x: -58, z: 50 }],
  tottori: [{ k: 'castle', x: 10, z: -150 }],
};
const NEAR = 30;
export function addSite(rt, k, x, z, name) {
  if (!rt || !Number.isFinite(x) || !Number.isFinite(z)) return;
  const L = rt.sites || (rt.sites = []);
  for (const s of L) if (Math.hypot(s.x - x, s.z - z) < NEAR) { if (s.table) { s.x = x; s.z = z; s.table = false; } return; }
  L.push({ k, x, z, name });
}
// 表の分を一度だけ足す（table 印つき。あとで addSite が来たら置き換わる）
export function sitesOf(rt) {
  const L = rt.sites || (rt.sites = []);
  if (!rt._sitesTable) {
    rt._sitesTable = true;
    const key = rt.def?.key || rt.world?.def?.battleKey || rt.def?.id;
    for (const s of TABLE[key] || []) if (!L.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < NEAR)) L.push({ ...s, table: true });
  }
  return L;
}
// 小さな城の形（石垣の台・天守・屋根）。(x, y) が足もと、s が大きさ（半幅）
export function drawCastleMark(g, x, y, s, fill, ink, lw) {
  g.save(); g.translate(x, y); g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(-s, s * 0.9); g.lineTo(-s * 0.8, s * 0.2); g.lineTo(s * 0.8, s * 0.2); g.lineTo(s, s * 0.9); g.closePath();
  g.moveTo(-s * 0.5, s * 0.2); g.lineTo(-s * 0.5, -s * 0.45); g.lineTo(s * 0.5, -s * 0.45); g.lineTo(s * 0.5, s * 0.2);
  g.moveTo(-s * 0.85, -s * 0.45); g.lineTo(0, -s * 1.15); g.lineTo(s * 0.85, -s * 0.45); g.closePath();
  g.strokeStyle = ink; g.lineWidth = lw * 2.2; g.stroke();
  g.fillStyle = fill; g.fill();
  g.restore();
}
