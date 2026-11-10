// docs/k15_fujinzu_ref_1109.md の正午の陣立て。戦う兵・新手・斬り合いには触れず、
// 開戦前の図には、その場にまだ出ていない後詰も載せる。北が上、豊臣が青、徳川が赤。
const FONT = '"Hiragino Mincho ProN","Yu Mincho",serif';
const formations = [
  ['大野治長', 0, -112, 1], ['大野治房', 174, -100, 1],
  ['木村宗明', -180, -66, 1],
  ['真田幸村', -150, -16, 1], ['毛利勝永', 0, -16, 1],
  ['伊達政宗', -330, 48, 0], ['松平忠輝', -330, 113, 0],
  ['本多忠朝', -46, 40, 0], ['浅野長重', -46, 90, 0],
  ['松平忠直', -46, 140, 0], ['徳川家康', -46, 190, 0],
  ['前田利常', 150, 40, 0], ['藤堂高虎', 300, 40, 0],
  ['細川忠興', 216, 90, 0], ['井伊直孝', 150, 140, 0],
  ['徳川秀忠', 300, 190, 0],
];
const places = [
  ['大坂城', 0, -155], ['中之島', -320, -155], ['鴫野', 320, -155],
  ['天神橋', -236, -124], ['天満橋', -100, -124], ['京橋', 160, -139],
  ['今宮', -300, -20], ['真田丸跡', 185, -58],
  ['紀州街道', -330, 190], ['谷町口', -160, -100],
  ['平野川', 377, 10], ['八尾道', 380, 104], ['奈良街道', 380, 165],
  ['阿倍野', -46, 222], ['天満川', 285, -185],
];

export function layout(rt) {
  const team = rt.player?.u?.team || 0, dots = [[], []];
  // 図全体を画面に収めるための端点。実兵の点から図を組み立てない。
  dots[0].push(-420, -200, 440, 235);
  dots[1].push(0, -150);
  let force = null;
  try { const f = rt.def.force?.(rt); if (f) force = team ? [f.b, f.a] : [f.a, f.b]; } catch (e) { /* 人数は戦の定義に従う */ }
  const red = '#ce4938', blue = '#345ba9', colors = team ? [blue, red] : [red, blue];
  return { me: { x: -46, z: 64 }, dots, units: [], names: [], arrows: [], pin: null, force, half: 500,
    colors: { COL: colors, DOT: colors } };
}

export function draw(g, rt, v) {
  const { Wd, Ht, dpr, sc, ox, oy, mx, mz } = v;
  // 手本の北を固定し、斜め上から見た札の厚みを付ける。焼くのは開く時だけ。
  const point = (x, z) => [ox + (x - mx) * sc, oy + (z - mz) * sc];
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ground = g.createLinearGradient(0, 0, 0, Ht);
  ground.addColorStop(0, '#799664'); ground.addColorStop(1, '#465e36');
  g.fillStyle = ground; g.fillRect(0, 0, Wd, Ht);
  const line = (pts, color, width) => {
    g.beginPath(); pts.forEach(([x, z], i) => { const p = point(x, z); if (i) g.lineTo(...p); else g.moveTo(...p); });
    g.strokeStyle = color; g.lineWidth = Math.max(1, width * sc); g.lineJoin = 'round'; g.stroke();
  };
  line([[-430, -172], [-220, -178], [80, -172], [430, -188]], '#91c7d0', 12);
  line([[360, -155], [354, -40], [350, 75], [358, 230]], '#91c7d0', 10);
  line([[-350, -100], [-350, 235]], '#d4c393', 5);
  line([[-160, -114], [-150, -16], [-110, 60], [-46, 222]], '#d4c393', 5);
  line([[0, -134], [0, -16], [-46, 40], [-46, 222]], '#d4c393', 5);
  line([[378, 30], [430, 125], [440, 225]], '#d4c393', 5);
  line([[260, 120], [300, 190], [440, 220]], '#d4c393', 5);
  for (const x of [-236, -100, 160]) line([[x, -188], [x, -158]], '#ad8c57', 5);
  const fontSize = Math.max(10, Math.min(15, 20 * sc));
  const text = (name, x, y, color, size = fontSize) => {
    g.font = `600 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.lineWidth = 3; g.strokeStyle = '#263222'; g.strokeText(name, x, y);
    g.fillStyle = color; g.fillText(name, x, y);
  };
  for (const [name, x, z] of places) { const p = point(x, z); text(name, p[0], p[1], '#fff1ce', fontSize * 0.85); }
  // 各隊の名前を札の真上に固定する。横に並ぶ隊は名前の幅より離してある。
  const w = Math.max(25, 75 * sc), h = Math.max(7, 12 * sc), depth = Math.max(3, 5 * sc);
  for (const [name, x, z, side] of formations) {
    const [px, py] = point(x, z), red = side === 0;
    g.fillStyle = red ? '#7c241e' : '#203a78'; g.fillRect(px - w / 2, py, w, h + depth);
    g.beginPath(); g.moveTo(px - w / 2, py); g.lineTo(px - w / 2 + depth, py - depth);
    g.lineTo(px + w / 2 + depth, py - depth); g.lineTo(px + w / 2, py); g.closePath();
    g.fillStyle = red ? '#f18369' : '#8aaee7'; g.fill();
    g.fillStyle = red ? '#ce4938' : '#345ba9'; g.fillRect(px - w / 2, py, w, h);
    text(name, px, py - depth - 2, red ? '#ffffff' : '#bbecff');
  }
  const [px, py] = point(-46, 64);
  text('あなた', px + 105 * sc, py + 6, '#ffffff', fontSize);
}
