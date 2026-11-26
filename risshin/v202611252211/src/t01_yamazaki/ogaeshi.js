// ======================================================================
// 山崎の戦い　序「備中の本陣と中国大返し」（docs/yamazaki_spec_1109.md。操作できる三〜四分）
//   本能寺の終わり（伝令が西へ）からつなぐ。山崎の布陣からは始めない。
//   幕0 備中高松の羽柴本陣（夜・戦なし）：伝令の馬が駆け込み、急報が官兵衛から秀吉へ。皆すぐは喋らない。秀吉「戻るぞ。」→「第二章 豊臣編」
//   幕1 備中（夜・小雨）：陣を畳む本陣の脇で、遅れた足軽の組をまとめて街道の口へ。遠くに毛利の旗（講和。背の緊張）
//   幕2 姫路（朝）：城下で兵糧を受け取り、新手を連れる。秀吉が騎馬で隊列の横を通る
//   幕3 播磨〜摂津（雨の夜・泥・松明）：合流の地へ急ぐ。明智の物見が道へ出る（小さな妨害だけ）
//   その後、山崎の手前（本筋の①）へ：諸将の旗が増え、走っていた軍が戦う軍勢になる。
//   日数は出さない。場面の変わり目は暗転と短い見出しだけ。山崎の兵（本物）はこの段が済んでから並べる（ctx.deploy）。
// 場所は山崎の地図の南の端（z 120〜170）を使い回し、時刻・雨・置き物で場面を分ける（遊びのための場面転換）。
// ======================================================================
import * as THREE from 'three';
import { askThen } from '../b_opening.js';
import { allyGroup, enemyGroup } from '../bhelp.js';
import { nobori, tawara, kagaribi, jinmaku, kobune, hut, dobei, sumiyagura } from '../props.js';
import { ladderStep } from '../state.js';
import { report } from './far.js';
import { wayLitter } from '../gap_scene.js';

// 幕ごとの始まりの所と行き先（heading π＝北向き）
export const SCENE = [null,
  { at: { x: -30, z: 136, heading: Math.PI }, pins: [{ x: -80, z: 156 }, { x: -6, z: 164 }] },
  { at: { x: 66, z: 164, heading: Math.PI }, pins: [{ x: 84, z: 128 }, { x: 40, z: 104 }] },
  { at: { x: -74, z: 150, heading: Math.PI / 2 }, pins: [{ x: 22, z: 136 }] },
];
// K149（kaito 11/9「操作できる中国大返し3〜4分」・11/14 の act bot で約二分）：姫路で兵糧の荷駄を先に通す（野盗が出る）・摂津の先の丘から京の方を見る、を足す
const NIDA = { from: { x: 70, z: 118 }, to: { x: -22, z: 100 } };
// 11/24 L1 頼む文3（大返しを3〜4分・幕ごとの疲れの変化）：幕3 の雨の街道の半ばで、道端に座り込んだ者を見届けて置いて行く（隊が細る）。小休止のあと夜が明けかける
const FALL = { x: -48, z: 160 }, WATER = { x: -14, z: 166 };
const HILL = { foot: { x: -112, z: 128, heading: Math.PI }, top: { x: -148, z: 92 } };
export const HILL_TEXT = '摂津の先の丘に登り、京の方を見る';   // 11/19 cloud-06：丘の段で札が「雨の街道を進み」のまま残った
export const TEXT = ['', '備中で遅れた足軽の組をまとめ、街道の口へ急ぐ', '姫路の城下で兵糧を受け取り、荷駄を先に通す', '雨の街道を進み、摂津の合流地点へ急ぐ'];
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
// K364 ①：本陣の幕・水攻めの湖（高松城）・反転する陣の兵と、宗治の舟を見届ける岸
const HON = { x: -34, z: 120 }, LAKE = { x: -112, z: 136 }, SHORE = { x: -70, z: 140 };
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };
// L1【難】頼む文1（11/24 クラウドわ）：山崎の前の軍議を一場面に。富田（6/12）の本陣の幕で、諸将が絵図を囲む。
//   足軽（身分が下）は幕の口の外から見る・足軽大将候補より上は幕の内の端に控える。備中の本陣の幕と篝火（HON）を使い回す。
//   絵図の駒が台詞に合わせて動き、先手 高山・中川／山の手 天王山へ秀長・官兵衛／川の手 池田、を字でなく絵で見せる。
//   出所：一統記・太閤記の伝え（富田で信孝を総大将に立て、先手を高山・中川、天王山へ羽柴秀長・黒田官兵衛、淀川沿いに池田恒興）。
const COUNCIL = { table: { x: HON.x, z: HON.z - 3 }, out: { x: HON.x, z: HON.z + 6.5, heading: Math.PI }, in: { x: HON.x + 1.2, z: HON.z + 2.6, heading: Math.PI } };
const SEATS = [['羽柴秀吉', 0, -2.3, 'HA'], ['織田信孝', -2.2, -1.5, 'oda'], ['丹羽長秀', -2.7, 0.4, 'niwa'], ['高山右近', -2.1, 2.1, 'shichiyo'],
  ['羽柴秀長', 2.2, -1.5, 'HA'], ['黒田官兵衛', 2.7, 0.4, 'KU'], ['中川清秀', 2.1, 2.1, 'kurusu']];
export const COUNCIL_TEXT = ['富田の本陣の軍議を、幕の外から聞く', '幕の内の端に控え、軍議を聞く'];

// 置き物（setup で一度だけ）：備中の本陣の篝火・毛利の旗・姫路の兵糧の俵
export function props(rt) {
  const W = rt.world, list = rt.flags.proProps = [];
  const add = (object) => { list.push(object); rt.scene.add(object); };
  try { for (const [x, z] of [[-44, 126], [-24, 126], [-50, 106], [-18, 106]]) add(kagaribi(W, x, z)); } catch (e) { /* 篝火なしでも進む */ }
  // 遠くの毛利の旗（講和したが、まだそこにいる。背の緊張）
  for (const [x, z] of [[-150, 176], [-142, 188], [-156, 164]]) add(nobori(W, x, z, 'mori'));
  try { for (const [x, z, r] of [[88, 124, 0.3], [92, 130, 1.2], [80, 122, 2.1]]) add(tawara(W, x, z, r, 6)); } catch (e) { /* 俵なしでも進む */ }
  // K364 要件書58（大軍を兵だけで見せない）：雨の夜の街道の両脇に、休む荷車・米俵・樽の荷駄の列（絵だけの兵は作らない＝noFake）。幕3だけ見せる
  try {
    const n0 = rt.scene.children.length;
    wayLitter(rt, [[SCENE[3].at.x, SCENE[3].at.z], [-30, 144], [SCENE[3].pins[0].x, SCENE[3].pins[0].z]], { seed: 1582, step: 11, off: 5.6, kinds: ['cart', 'sack', 'barrel', 'sack', 'cart'] });
    const g = rt.scene.children.slice(n0).find((o) => o.name === 'wayLitter');
    if (g) { g.visible = false; rt.flags.proNida = g; list.push(g); }
  } catch (e) { /* 荷駄の絵なしでも進む */ }
  // K364 ①（docs/specs/drama_req_1117.md 5〜8）：本陣の幕（足軽は外から見る）・水に浮かぶ高松城・清水宗治の舟
  try { const m = jinmaku(W, HON.x, HON.z - 2, 18, 12, 6, { mon: 'toyotomi', solid: false }); rt.flags.proMaku = m; add(m); } catch (e) { /* 幕なしでも進む */ }
  try {
    const y = Math.min(...[[-30, -24], [30, -24], [-30, 24], [30, 24], [0, 0]].map(([dx, dz]) => W.heightAt(LAKE.x + dx, LAKE.z + dz))) + 0.5;
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshStandardMaterial({ color: 0x55666a, roughness: 0.18, metalness: 0.1 }));
    water.rotation.x = -Math.PI / 2; water.scale.set(34, 26, 1); water.position.set(LAKE.x, y, LAKE.z); add(water);
    add(hut(W, LAKE.x - 14, LAKE.z - 6, 9, 6, 0.2, { ita: true }));
    for (const [x, z] of [[LAKE.x - 20, LAKE.z - 10], [LAKE.x - 8, LAKE.z - 12]]) add(nobori(W, x, z, 'mori', 5));
    // 11/21 クラウド 山崎の持ち主（⑥初めての目の写真 60秒）：「水に浮かぶ高松城」が岸の小屋一つで、城に見えなかった。
    //   高松城は低い沼城（平城）。足守川を堤でせき止めた水が塀の腰まで上がり、櫓と塀だけが水から出ていた（岡山市の高松城址の説明）。
    //   本丸を囲む板葺の土塀と二重の櫓を、足もとを水の下に沈めて建てる。脇に足守川をせき止めた堤の一筋。置くのは序の間だけ（proProps）
    try {
      const sunk = Object.create(W); sunk.heightAt = () => y - 1.1;
      const C = { x: LAKE.x - 10, z: LAKE.z - 3 }, hw = 8, hd = 6;
      for (const seg of [[C.x - hw, C.z - hd, C.x + hw, C.z - hd], [C.x + hw, C.z - hd, C.x + hw, C.z + hd], [C.x + hw, C.z + hd, C.x - hw, C.z + hd], [C.x - hw, C.z + hd, C.x - hw, C.z - hd]]) add(dobei(sunk, seg, { ita: true, h: 2.5 }));
      add(sumiyagura(sunk, C.x + hw - 1, C.z - hd + 1, { inside: false, w: 5, d: 4, base: 1.4, rot: 0.1 }));
      const bank = new THREE.Mesh(new THREE.BoxGeometry(70, 2.2, 5), new THREE.MeshStandardMaterial({ color: 0x5c4e38, roughness: 1 }));
      bank.position.set(LAKE.x - 4, y + 0.3, LAKE.z + 27); bank.rotation.y = 0.12; add(bank);
    } catch (e) { /* 城の塀なしでも進む */ }
    const boat = new THREE.Group();
    boat.add(kobune(0, 0, 0, Math.PI / 2, 7));
    const robe = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.9 });
    const man = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 1.05, 10), robe); body.position.y = 0.52; man.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.8 })); head.position.y = 1.15; man.add(head);
    man.position.set(0.6, 0.15, 0); boat.add(man);
    boat.position.set(LAKE.x + 26, y + 0.05, LAKE.z + 2); boat.visible = false;
    rt.flags.proBoat = boat; rt.flags.proMan = man; add(boat);
  } catch (e) { /* 水なしでも進む */ }
  try { add(councilTable(rt)); } catch (e) { /* 絵図なしでも軍議の声は進む */ }
}

// 軍議の台と絵図（北が奥。左に天王山、右に淀川、中ほどを円明寺川、奥に勝竜寺の城と明智の駒）。字は書かない
function councilTable(rt) {
  const W = rt.world, T = COUNCIL.table, g = new THREE.Group();
  g.name = 'councilTable';
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.85 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.07, 1.75), wood); top.position.y = 0.7; g.add(top);
  const legG = new THREE.BoxGeometry(0.08, 0.7, 0.08);
  for (const [x, z] of [[-1.1, -0.75], [1.1, -0.75], [-1.1, 0.75], [1.1, 0.75]]) { const l = new THREE.Mesh(legG, wood); l.position.set(x, 0.35, z); g.add(l); }
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 360;
  const c = cv.getContext('2d');
  c.fillStyle = '#d9c9a0'; c.fillRect(0, 0, 512, 360);
  c.fillStyle = 'rgba(120,90,50,0.10)'; for (let i = 0; i < 400; i++) c.fillRect((i * 97) % 512, (i * 53) % 360, 2, 1);
  // 天王山（左）：茶と緑の山。等高の筆
  c.fillStyle = '#7d7a4a'; c.beginPath(); c.ellipse(70, 170, 95, 150, 0.1, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(60,50,30,0.55)'; c.lineWidth = 2;
  for (const r of [0.75, 0.5, 0.25]) { c.beginPath(); c.ellipse(70, 170, 95 * r, 150 * r, 0.1, 0, Math.PI * 2); c.stroke(); }
  // 淀川（右）：太い藍の帯
  c.strokeStyle = '#4f6f86'; c.lineWidth = 46; c.beginPath(); c.moveTo(470, -10); c.quadraticCurveTo(430, 170, 400, 380); c.stroke();
  // 円明寺川（中ほどを横に）
  c.strokeStyle = '#5d7d92'; c.lineWidth = 7; c.beginPath(); c.moveTo(150, 168); c.bezierCurveTo(240, 150, 300, 190, 410, 172); c.stroke();
  // 山崎の町（山と川の間の狭い所）・西国街道
  c.strokeStyle = '#8a6a44'; c.lineWidth = 3; c.setLineDash([8, 6]); c.beginPath(); c.moveTo(200, 360); c.lineTo(215, 240); c.lineTo(260, 60); c.lineTo(300, -10); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#5a4630'; for (const [x, y] of [[196, 252], [210, 262], [222, 248], [204, 274]]) c.fillRect(x, y, 9, 7);
  // 勝竜寺の城（奥）：堀の四角
  c.strokeStyle = '#3a3a3a'; c.lineWidth = 5; c.strokeRect(300, 46, 44, 34); c.fillStyle = '#6a5a48'; c.fillRect(310, 55, 24, 16);
  const tex = new THREE.CanvasTexture(cv);
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  const map = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.62), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  map.rotation.x = -Math.PI / 2; map.position.y = 0.738; g.add(map);
  // 駒：明智（墨）は川の北に置いたまま、羽柴（金）は手前の端から台詞で動く
  const at = (u, v) => ({ x: (u / 512 - 0.5) * 2.3, z: (v / 360 - 0.5) * 1.62 });
  const pg = new THREE.CylinderGeometry(0.05, 0.06, 0.16, 10);
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b3450, roughness: 0.6 }), gold = new THREE.MeshStandardMaterial({ color: 0xc9a23a, roughness: 0.45, metalness: 0.3 });
  for (const [u, v] of [[250, 128], [300, 130], [345, 125], [322, 98], [230, 110]]) { const m = new THREE.Mesh(pg, dark); const q = at(u, v); m.position.set(q.x, 0.82, q.z); g.add(m); }
  const pieces = rt.flags.councilPieces = {};
  for (const [k, u0, u1, v1, big] of [['takayama', 250, 236, 196, 1.35], ['nakagawa', 200, 170, 205, 1], ['hidenaga', 120, 78, 160, 1.15], ['kanbe', 150, 100, 186, 1], ['ikeda', 330, 372, 214, 1]]) {
    const m = new THREE.Mesh(pg, gold); m.scale.setScalar(big);
    const from = at(u0, 344), to = at(u1, v1);
    m.position.set(from.x, 0.82, from.z); g.add(m);
    pieces[k] = { m, from, to, t0: undefined };
  }
  // 11/24 Sanae（幕の口からの写真）：台が小さく、足軽の目の高さから絵図も駒も読めなかった。台と絵図を横に 1.6倍、駒を高くする（諸将の座も外へ）
  g.scale.set(1.6, 1, 1.6);
  g.position.set(T.x, W.heightAt(T.x, T.z), T.z);
  g.visible = false;
  rt.flags.proCouncil = g;
  return g;
}

// 主人公・自分の組・連れた隊をまとめて場面の始まりへ移す（暗転の間）
function warp(rt, at, groups, label) {
  // K667：遠い移しは勝手にせず、書いたボタンを押した時だけ（近ければ今まで通り）
  if (!askThen(rt, at.x, at.z, label || '次の場所へ移る', () => warpNow(rt, at, groups))) return;
}
function warpNow(rt, at, groups) {
  const W = rt.world, P = rt.player.u;
  const place = (u, x, z) => { u.pos.set(x, W.heightAt(x, z), z); u.mesh?.position.copy(u.pos); u.moveTo = null; u.target = null; if (u.vel) u.vel.x = u.vel.z = 0; };
  rt.cutT = rt.t;   // 暗転の間の置き直し（audit が「兵が飛んだ」に数えない）
  place(P, at.x, at.z);
  if (at.heading !== undefined) { P.heading = at.heading; rt.player.yaw = at.heading; }
  let k = 0;
  for (const g of [...(rt.squadGroups || []), ...groups]) {
    if (!g) continue;
    let i = 0;
    for (const u of g.units) if (u.alive && !u.gone && u !== P) { place(u, at.x - 4 + (i % 4) * 1.6, at.z + 4 + k * 3 + Math.floor(i / 4) * 1.6); i++; }
    if (g.anchor) { g.anchor.x = at.x; g.anchor.z = at.z + 4 + k * 3; }
    g.dest = null; g.onArrive = null; g.path = null;
    k += Math.ceil(i / 4) + 1;
  }
  try { rt.army.rebuildGrid?.(); } catch (e) { /* 次のコマ */ }
}
function follow(rt, g) {
  if (!g) return;
  const P = rt.player.u.pos;
  g.order = 'move'; g.dest = { x: P.x + 3, z: P.z + 4 }; g.onArrive = null; g.speed = 4.6;
}

// 同じ幕をやり直しても、前の幕の声や兵の追加を持ち越さない。
function after(rt, sec, fn) {
  const F = rt.flags, pro = F.pro, order = F.proOrder;
  rt.after(sec, () => {
    if (rt.flags !== F || F.pro !== pro || F.proOrder !== order || F.stage || F.proWarp || F.ending || rt.over || rt.retryOpen || !rt.player.u.alive) return;
    fn();
  });
}

const honGroup = (rt, ctx) => allyGroup(rt, { name: '羽柴の本陣', anchor: { ...HON }, facing: 0, width: 8, formation: 'line', fixed: true, noRout: true, fullStrength: true, aggro: 0, seekRange: 0, order: 'hold' },
  ctx.fl([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true } }, { type: 'busho', n: 1, o: { name: '羽柴秀長', invuln: true } },
    { type: 'busho', n: 1, o: { name: '黒田官兵衛', invuln: true, flag: ctx.KU } }, { type: 'busho', n: 1, o: { name: '蜂須賀正勝', invuln: true, flag: 'hachisuka' } },
    { type: 'busho', n: 1, o: { name: '宮部継潤', invuln: true } }, { type: 'samurai', n: 4, o: { keep: true } }], ctx.HA));

const turnGroup = (rt, ctx) => allyGroup(rt, { name: '羽柴の陣', anchor: { x: -64, z: 128 }, facing: -Math.PI / 2, width: 12, formation: 'line', fixed: true, noRout: true, fullStrength: true, aggro: 0, seekRange: 0, order: 'hold' },
  ctx.fl([{ type: 'ashigaru', n: 10, o: { keep: true } }, { type: 'gun', n: 3, o: { keep: true } }, { type: 'samurai', n: 1, o: { horse: true, keep: true } }, { type: 'porter', n: 3, o: { keep: true } }], ctx.HA));
const riderGroup = (rt, ctx) => allyGroup(rt, { name: '京よりの伝令', anchor: { x: -14, z: 168 }, facing: 0, width: 2, formation: 'column', noRout: true, fullStrength: true, aggro: 0, seekRange: 0, speed: 5 },
  ctx.fl([{ type: 'samurai', n: 1, o: { name: '伝令', horse: true, invuln: true } }], ctx.HA));

// 11/18 クラウド 山崎の持ち主：本陣の将五人の初めての作り（顔・具足・旗）が 1.5秒の幕の始まりに重なり、戦が見え始めた2秒で一コマ止まっていた
//   （crash_hunt 3.9秒・描かずの測りで本陣の spawn 一つが500ms。二度目は60ms）。読み込みの間（setup）に一度作って消し、作りを先に済ませる。
export function prewarm(rt, ctx) {
  try {
    // 11/19：陣の兵と伝令の馬も先に作る（1.5秒のコマで二つの組の作り 74ms が残っていた・renraku 2498 ②）
    for (const mk of [honGroup, turnGroup, riderGroup]) {
      const g = mk(rt, ctx);
      for (const u of g.units) if (!u.gone) rt.army.despawn(u);
      const i = rt.army.groups.indexOf(g); if (i >= 0) rt.army.groups.splice(i, 1);
    }
  } catch (e) { /* 先の作りが出来なくても幕の始まりで作る */ }
}
const seatGroup = (rt, ctx, [name, dx, dz, fk]) => {
  const T = COUNCIL.table, x = T.x + dx * 1.45, z = T.z + dz * 1.45, flag = ctx[fk] || fk;
  return allyGroup(rt, { name: '軍議の' + name, anchor: { x, z }, facing: Math.atan2(-dx, -dz), width: 1, formation: 'line', fixed: true, noRout: true, fullStrength: true, aggro: 0, seekRange: 0, order: 'hold' },
    ctx.fl([{ type: 'busho', n: 1, o: { name, invuln: true, horse: false } }], flag));   // 台を囲むので馬から降りる（11/24 Sanae 写真）
};
// 軍議の暗転の始め（見えない間に諸将を作る）
function councilCut(rt, ctx) {
  const F = rt.flags;
  F.oStep = 4; F.proCouncilCut = 1.2; rt.scene.visible = false;
  for (const g of [F.proHon, F.hillScouts, ...(F.council || [])]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
  F.proHon = F.hillScouts = null;
  F.council = [];
  try { for (const s of SEATS) { const g = seatGroup(rt, ctx, s); for (const u of g.units) { u.invuln = true; u.noTarget = true; } F.council.push(g); } } catch (e) { /* 諸将なしでも進む */ }
}
// 軍議（暗転が明けた時）
function council(rt, ctx) {
  const F = rt.flags, inner = F.proInner, P = F.councilPieces || {};
  F.proOrder = (F.proOrder || 0) + 1;
  rt.scene.visible = true;
  rt.world.dayClock = null; rt.world.setTime('dusk', true);
  if (rt.world.setRainTarget) { rt.world.setRainTarget(0); rt.world.rainLevel = 0; }
  if (F.proMaku) F.proMaku.visible = true;
  if (F.proCouncil) F.proCouncil.visible = true;
  for (const k in P) { const p = P[k]; p.t0 = undefined; p.m.position.set(p.from.x, 0.82, p.from.z); }
  warp(rt, inner ? COUNCIL.in : COUNCIL.out, [F.ikeda, F.tired, F.newG]);
  // 11/24 Sanae（前後写真 844×390）：warp は組を本人の後ろ（カメラとの間）に並べ、組はまた本人の後ろへ寄るので、幕の口が足軽の背で塞がり、台も諸将も見えなかった。
  //   軍議の間だけ、組を本人の左右（交互）に一列で立たせ、幕の口から内が見通せるようにする（足軽は幕の外から見る）。軍議の終わりに元へ戻す
  {
    const at = inner ? COUNCIL.in : COUNCIL.out, W = rt.world, me = rt.player.u; let k = 0;
    F.councilWing = [];
    for (const g of [...(rt.squadGroups || []), F.ikeda, F.tired, F.newG]) {
      if (!g || !g.anchor) continue;
      const side = k % 2 ? 1 : -1, off = 5 + Math.floor(k / 2) * 3.2;
      F.councilWing.push([g, { ...g.anchor }, g.order, g.fixed, g.facing]);
      g.anchor.x = at.x + side * off; g.anchor.z = at.z + 0.5; g.order = 'hold'; g.fixed = true; g.facing = Math.PI;
      let i = 0;
      for (const u of g.units) if (u.alive && !u.gone && u !== me) {
        const x = g.anchor.x + side * Math.floor(i / 3) * 1.4, z = g.anchor.z + (i % 3) * 1.5;
        u.pos.set(x, W.heightAt(x, z), z); u.mesh?.position.copy(u.pos); u.moveTo = null; u.heading = Math.PI; i++;
      }
      k++;
    }
  }
  rt.obj('main', COUNCIL_TEXT[inner ? 1 : 0], 'main');
  rt.banner('摂津　富田の本陣', '六月十二日。明日の戦の軍議');
  const move = (...ks) => { for (const k of ks) if (P[k]) P[k].t0 = rt.t; };
  after(rt, 1.5, () => rt.say('使番', '軍議じゃ！　諸将は幕の内へ！', 2.6));
  if (!inner) after(rt, 4.5, () => rt.say('組頭', '幕の内で絵図を広げておられる。声を立てるな', 2.8));
  after(rt, 7.5, () => rt.say('黒田官兵衛', '日向は勝竜寺の城を背に、円明寺川の向こうに構えておりまする', 3.6));
  after(rt, 12, () => { move('takayama', 'nakagawa'); rt.say('羽柴秀吉', '先手は高山右近、続いて中川瀬兵衛。川を挟んで日向の真正面じゃ', 3.8); });
  after(rt, 16.5, () => { move('hidenaga', 'kanbe'); rt.say('羽柴秀吉', '山の手、天王山へは秀長と官兵衛。山を先に取れ', 3.4); });
  after(rt, 21, () => { move('ikeda'); rt.say('羽柴秀吉', '川の手は池田勝三郎殿。総大将は、信孝様に願い奉る', 3.6); });
  after(rt, 25.5, () => rt.say('織田信孝', '父上の弔い合戦じゃ。明日、日向を討つ', 3));
  after(rt, 29, () => rt.say('高山右近', '先手、承ってござる', 2.4));
  after(rt, 32, () => rt.say('足軽', inner ? '……明日じゃ' : '先手は高山様か。わしらは、その後ろじゃな', 2.8));
  after(rt, 35.5, () => { F.holdPlayer = false; unwing(F); next(rt, ctx, 4); });
}
function unwing(F) {
  for (const [g, a, order, fixed, facing] of F.councilWing || []) { g.anchor.x = a.x; g.anchor.z = a.z; g.order = order; g.fixed = fixed; g.facing = facing; }
  F.councilWing = null;
}

// 幕0＋幕1：備中の本陣（setup の後に呼ぶ）
// K364 ①（drama_req_1117 5〜8・20）：急報→毛利の使い（恵瓊）→翌朝 宗治の最期（遠景）→陣払いで軍が反転、まで歩いて見る。
//   身分で見え方を変える：足軽大将候補より下は幕の外。急報の中身は聞こえず、静まり返った幕と触れだけ（主人公が知らない事は見せない）。
export function start(rt, ctx, cine = true) {
  const F = rt.flags;
  F.proOrder = (F.proOrder || 0) + 1;
  F.pro = 1; F.oStep = 0; F.proT0 = rt.t; F.holdPlayer = cine; F.proLake = false;
  const inner = F.proInner = ladderStep(rt.G || {}) >= 2;
  rt.world.dayClock = null; rt.world.setTime('night', true);
  if (rt.world.setRainTarget) { rt.world.setRainTarget(0.15); rt.world.rainLevel = 0.15; }
  if (F.proMaku) F.proMaku.visible = true;
  F.proCut = 0;
  for (const g of [F.turnG, F.kei]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
  F.turnG = F.kei = null;
  if (F.proBoat) { F.proBoat.visible = false; F.proMan.rotation.set(0, 0, 0); }
  warp(rt, inner ? { x: HON.x + 3, z: HON.z + 2, heading: Math.PI } : SCENE[1].at, [F.ikeda]);
  // 本陣の人々（秀吉・秀長・官兵衛・蜂須賀・宮部と使番）。動かず、討てない
  F.proHon = honGroup(rt, ctx);
  for (const u of F.proHon.units) { u.invuln = true; u.noTarget = true; }
  // 毛利の方を向いて並ぶ陣の兵（湖の東の岸。陣払いで一斉に向きを変える）
  F.turnG = turnGroup(rt, ctx);
  for (const u of F.turnG.units) { u.invuln = true; u.noTarget = true; }
  // 疲れ切った伝令の馬（南の街道から本陣の幕の口へ）
  F.rider = riderGroup(rt, ctx);
  F.rider.order = 'move'; F.rider.dest = { x: HON.x + 1, z: HON.z + 5 }; F.rider.onArrive = (g) => { g.order = 'hold'; };
  if (!cine) return;
  rt.banner('備中高松　羽柴の本陣', '天正十年六月三日の夜');
  after(rt, 2, () => rt.say('使番', '道を開けよ！　京よりの急ぎの使いじゃ！', 2.8));
  if (inner) {
    after(rt, 6, () => rt.say('伝令', '……京にて、上様ご生害。明智日向守の謀反にござる', 3.6));
    after(rt, 10.5, () => rt.say('羽柴秀吉', '…………', 2.6));
    after(rt, 14, () => rt.say('黒田官兵衛', '毛利との和を今夜のうちに結べば、背は空きまする。日向は京。時がござらぬ', 4));
    after(rt, 18.5, () => rt.say('羽柴秀吉', '戻るぞ。', 2.4));
  } else {
    after(rt, 7, () => rt.say('組頭', '……幕の内が、急に静まり返った', 3));
    after(rt, 11.5, () => rt.say('足軽', '何じゃ。誰も出て来ん', 2.6));
    after(rt, 15, () => rt.say('使番', '触れじゃ！　今宵のことは口外無用。陣は一つも動かすな！', 3.4));
  }
  after(rt, 21, () => rt.banner('第二章　豊臣編', '中国大返し'));
  // 毛利の使い（安国寺恵瓊）が西の岸から幕へ。和を結ばねば帰れない
  // 11/20 クラウド（④湧き出し：二十三秒に使いの三人が本人の五十余 m の岸で急に現れていた）：場面の始まり（置き直しの間）から西の岸で控えさせ、二十三秒に歩き出す
  F.kei = allyGroup(rt, { name: '毛利の使い', anchor: { x: -84, z: 140 }, facing: Math.PI / 2, width: 2, formation: 'column', noRout: true, fullStrength: true, aggro: 0, seekRange: 0, speed: 1.6, order: 'hold' },
    ctx.fl([{ type: 'porter', n: 1, o: { name: '安国寺恵瓊', invuln: true, flag: null, hat: 'none', kosode: 1, bozu: 1, kosodeCol: 0x24221f, armor: 0x1e1c1a, lace: 0x2a2826, cloth: 0x24221f, haori: null, mon: null } },
      { type: 'samurai', n: 2, o: { keep: true } }], 'mori'));
  for (const u of F.kei.units) { u.invuln = true; u.noTarget = true; }
  after(rt, 23, () => {
    F.holdPlayer = false;
    if (!F.kei) return;
    F.kei.order = 'move'; F.kei.dest = { x: HON.x - 2, z: HON.z + 6 }; F.kei.onArrive = (g) => { g.order = 'hold'; };
  });
  if (inner) {
    after(rt, 32, () => rt.say('安国寺恵瓊', '清水長左衛門殿の腹一つで、城の者の命は助けていただけまするな', 3.6));
    after(rt, 36.5, () => rt.say('羽柴秀吉', '約定じゃ。明日、水の上で見届ける。それで毛利とは和じゃ', 3.4));
  } else {
    after(rt, 30, () => rt.say('組の者', '墨染の坊主……毛利の使いの安国寺じゃ', 3));
    after(rt, 34.5, () => rt.say('組頭', '和睦の話か。片が付けば、国へ帰れるのう', 3));
  }
  // 翌朝：暗転して朝に（tick の proCut）。岸から水の上の舟を見届ける
  after(rt, 41, () => { F.proCut = 1.3; rt.scene.visible = false; });
}

// 翌朝の場面（暗転が明けた時）：宗治の最期→陣払い→軍の反転→遅れた組をまとめる（幕1）
function morning(rt, ctx) {
  const F = rt.flags, inner = F.proInner;
  rt.scene.visible = true;
  rt.world.dayClock = null; rt.world.setTime('morning', true);
  if (rt.world.setRainTarget) { rt.world.setRainTarget(0); rt.world.rainLevel = 0; }
  warp(rt, { x: SHORE.x + 14, z: SHORE.z + 2, heading: -Math.PI / 2 }, [F.ikeda]);
  if (F.proBoat) F.proBoat.visible = true;
  F.proLake = true;
  rt.banner('高松の城の水の上', '六月四日の朝');
  rt.obj('main', '岸から、水の上の舟を見届ける', 'main');
  after(rt, 2.5, () => rt.say('使番', '高松の城より舟が出たぞ！', 2.6));
  after(rt, 6, () => rt.say('足軽', '舟の上に……白い衣の侍が一人', 2.8));
  after(rt, 10, () => inner ? rt.say('黒田官兵衛', '城主、清水長左衛門殿。城の者の命と引き換えに、腹を召される', 3.6)
    : rt.say('組頭', '城主の清水様じゃ。城の者の命と引き換えに、腹を召されるそうな', 3.6));
  after(rt, 16, () => { if (F.proMan) F.proMan.rotation.x = 1.35; rt.say('足軽', '…………', 2.4); });
  after(rt, 20, () => rt.say('羽柴秀長', '見届けた。――陣払いじゃ。東へ向け！', 3));
  after(rt, 23, () => {
    F.proLake = false; F.oStep = 1;
    rt.army.play('horagai', { ...HON }, 1.0);
    rt.obj('main', TEXT[1], 'main');
    rt.say('蜂須賀正勝', '陣を畳め！　兵糧を積め！　馬の支度じゃ！', 3);
    if (F.proMaku) F.proMaku.visible = false;   // 陣を畳む
    // 毛利の方を向いていた陣の兵が、一斉に背を向けて東の街道へ（旗・荷駄・馬・鉄砲・槍ごと）
    if (F.turnG) { F.turnG.fixed = false; F.turnG.facing = Math.PI / 2; F.turnG.order = 'move'; F.turnG.dest = { x: 24, z: 156 }; F.turnG.speed = 2.6; F.turnG.onArrive = null; }
    if (F.kei) { F.kei.order = 'move'; F.kei.dest = { x: -96, z: 146 }; F.kei.onArrive = null; }
    // 本陣も動き出す（秀吉は騎馬で先へ。ずっと横にはいない）
    if (F.proHon) { F.proHon.fixed = false; F.proHon.order = 'move'; F.proHon.dest = { x: 10, z: 166 }; F.proHon.speed = 3.2; }
    // 遅れた足軽の組（槍を杖に座り込む）
    F.tired = allyGroup(rt, { name: '遅れた足軽の組', anchor: { ...SCENE[1].pins[0] }, facing: 0.6, width: 6, formation: 'line', aggro: 4, seekRange: 8, morale: 70, noRout: true, order: 'hold' },
      ctx.fl([{ type: 'ashigaru', n: 6, o: { flagScale: 1 } }, { type: 'gun', n: 2 }], ctx.HA));
  });
  after(rt, 28, () => rt.say('足軽', '勝ったのに……祝いの酒も無しか', 2.8));
  after(rt, 33, () => rt.say('足軽', '毛利は……後ろから攻めては来ぬのか？', 3));
  after(rt, 37, () => rt.say('羽柴秀長', '和は結んだ。振り返るな。前だけを見よ', 3));
}

function scene(rt, ctx, n) {
  const F = rt.flags;
  F.proOrder = (F.proOrder || 0) + 1;
  F.pro = n; F.oStep = 1; F.proT0 = rt.t; F.proHillCut = 0;
  // 11/18 クラウド：備中の本陣へ来た京の伝令が、姫路・摂津の場面まで同じ所に一騎で立ち残っていた（act bot 186秒の止まり）。場面が変われば去らせる
  if (n === 2) { for (const g of [F.nida, F.bandit, F.turnG, F.kei, F.rider]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u); F.nida = F.bandit = F.turnG = F.kei = F.rider = null; F.banditGone = false; F.proLake = false; F.proCut = 0; }
  // 11/18 クラウド：摂津の場面へ移っても荷駄が「移る」のまま残っていた（act bot 176・196秒の止まり）。場面が替われば立たせる
  if (n === 3 && F.nida) { F.nida.order = 'hold'; F.nida.onArrive = null; }
  rt.obj('main', TEXT[n], 'main');
  if (n === 2) {
    rt.world.dayClock = null; rt.world.setTime('morning', true);
    if (rt.world.setRainTarget) { rt.world.setRainTarget(0); rt.world.rainLevel = 0; }
    warp(rt, SCENE[2].at, [F.ikeda, F.tired]);
    if (F.proNida) F.proNida.visible = false;
    rt.banner('姫路', '備中から駆け通して、城下で一息つく間もない');
    F.newG = allyGroup(rt, { name: '姫路の新手', anchor: { ...SCENE[2].pins[0] }, facing: Math.PI, width: 8, formation: 'line', aggro: 4, seekRange: 8, morale: 90, noRout: true, order: 'hold' },
      ctx.fl([{ type: 'ashigaru', n: 6, o: { flagScale: 1 } }, { type: 'gun', n: 2 }, { type: 'samurai', n: 2 }], ctx.HA));
    after(rt, 3, () => rt.say('足軽', '足が……もう棒のようじゃ', 2.8));
    // 幕の外にいた者は、ここで初めて京の事を知る（触れが出たのは姫路）
    if (!F.proInner) after(rt, 6, () => rt.say('組の者', '聞いたか。上様が京で討たれたそうな……明智の謀反じゃと', 3.4));
    after(rt, 10, () => rt.say('姫路の侍', '傷の重い者は城に残れ！　旗は組ごとに立て直せ！', 3));
  } else if (n === 3) {
    rt.world.dayClock = null; rt.world.setTime('night', true);
    if (rt.world.setRainTarget) { rt.world.setRainTarget(0.7); rt.world.rainLevel = 0.7; }
    if (rt.world.wetness !== undefined) rt.world.wetness = 1;
    warp(rt, SCENE[3].at, [F.ikeda, F.tired, F.newG]);
    rt.banner('播磨から摂津へ', '雨の夜も、松明を掲げて歩き続ける');
    if (F.proNida) F.proNida.visible = true;
    // 疲れの変化（幕1 は座り込み・幕2 は足が棒・幕3 は足を引きずる者が出て、道端で動けなくなる者を置いて行く）
    F.p3Fall = 0; F.p3RestT = 0; F.p3Water = 0;
    let lame = 0;
    for (const g of [F.tired, F.newG]) for (const u of g?.units || []) if (lame < 3 && u.alive && !u.gone && !u.mounted && u.type === 'ashigaru') { u.woundOut = true; lame++; }
    if (F.fallen) for (const u of F.fallen.units) if (u.alive && !u.gone) rt.army.despawn(u);
    F.fallen = allyGroup(rt, { name: '動けぬ足軽', anchor: { ...FALL }, facing: -Math.PI / 2, width: 3, formation: 'line', fixed: true, noRout: true, fullStrength: true, aggro: 0, seekRange: 0, order: 'hold' },
      ctx.fl([{ type: 'ashigaru', n: 2, o: { keep: true } }], ctx.HA));
    F.fallen.units.forEach((u, i) => { u.invuln = true; u.noTarget = true; u.woundOut = true; u._crouch = true; u._fallHome = { x: FALL.x - 1.2 + i * 1.3, z: FALL.z + 1.5 + i * 0.4 }; });
    after(rt, 4, () => rt.say('足軽', 'まだ行くのか……', 2.4));
    after(rt, 7, () => rt.say('使番', '京まで止まらんぞ！　遅れるな！', 2.8));
    after(rt, 11, () => rt.say('足軽', '草鞋が切れた……替えはないか', 2.6));
    after(rt, 16, () => report(rt, '摂津の中川様・高山様、こちらに付くとの返事にござる！'));
    // 行軍は走り通しではない（drama_req 10）：歩きながら食い、水を回し、足を引きずる
    after(rt, 22, () => rt.say('組頭', '握り飯は歩きながら食え。止まる暇は無いぞ', 2.8));
    after(rt, 34, () => rt.say('足軽', '水を回してくれ……喉が焼ける', 2.6));
    // 軍議は丘の後の富田の場面（council）へ移した（11/24 クラウドわ・L1 頼む文1）
  }
}

// 幕3 の半ば：道端の二人を見届け、小休止の後に夜が明けかける（隊が細り、雨が弱まる）
function fallStep(rt, ctx, P) {
  const F = rt.flags;
  // 座り込んだまま（並びの置き直しで立ち上がらせない。army_anim は動くと _crouch を外す）
  //   座った者は押し合いで流されない（通る隊の方がよける）。道端の置いた所に留める
  if (F.fallen && F.p3Fall < 3) for (const u of F.fallen.units) if (u.alive && !u.gone) {
    u.moveTo = null; u.target = null; u._crouch = true;
    const h = u._fallHome; if (h && (u.pos.x - h.x) ** 2 + (u.pos.z - h.z) ** 2 > 0.04) { u.pos.set(h.x, rt.world.heightAt(h.x, h.z), h.z); u.mesh?.position.copy(u.pos); }
  }
  if (F.p3Fall === 0 && near(P, FALL, 7)) {
    F.p3Fall = 1; F.p3RestT = rt.t;
    rt.say('足軽', '……もう、歩けませぬ。置いて行ってくだされ', 3);
    after(rt, 3.5, () => rt.say('組頭', '名を言え。後で必ず迎えをやる', 2.6));
    after(rt, 7, () => rt.say('使番', '止まるな！　歩ける者だけで行く！', 2.6));
    after(rt, 10, () => {
      F.p3Fall = 2;
      if (rt.world.setRainTarget) rt.world.setRainTarget(0.3);
      rt.world.setTime('morning');   // 四十五秒かけて夜が明けかける
      rt.say('足軽', '……空が白んできた', 2.4);
    });
  }
  // 置いて行った二人は、遠くなってから去らせる（隊が細ったまま進む）
  if (F.p3Fall === 2 && F.fallen && !near(P, FALL, 45)) {
    for (const u of F.fallen.units) if (u.alive && !u.gone) rt.army.despawn(u);
    F.fallen = null; F.p3Fall = 3;
  }
  // 物見を追い払った後、夜明けの沢で水を回す（喉が焼ける・足を引きずる者が遅れる）。雨がほぼ上がる
  if (F.proScoutsGone && F.p3Water === 0 && near(P, WATER, 7)) {
    F.p3Water = 1;
    if (rt.world.setRainTarget) rt.world.setRainTarget(0.1);
    rt.say('組頭', '沢じゃ。竹筒に汲め。飲んだらすぐ立て', 2.8);
    after(rt, 3.5, () => rt.say('足軽', '……生き返る', 2));
    after(rt, 6.5, () => rt.say('足軽', '足を引きずる者が、また遅れておる', 2.8));
    after(rt, 10, () => { F.p3Water = 2; rt.say('使番', '摂津はもうすぐじゃ！　列を詰めよ！', 2.6); });
  }
}

export function tick(rt, dt, ctx) {
  const F = rt.flags, P = rt.player.u.pos;
  if (!rt.player.u.alive || rt.retryOpen) return;
  // 暗転中に討たれても、予約処理で次の地へ移さない。生存中の時間だけ進める。
  if (F.proWarp) {
    // 11/19 k365-cloud-37（K374）：山崎へ移る暗転の間に、山崎の本物の兵を一組ずつ作っておく（明けた時に 199人を一コマで作って 750ms 止まっていた）
    if (F.proNext === 4) ctx.deployStep?.();
    F.proWarpT -= dt;
    if (F.proWarpT <= 0) {
      const n = F.proNext;
      F.proWarp = false;
      rt.scene.visible = true;
      if (n <= 3) scene(rt, ctx, n);
      else ctx.toYamazaki();
    }
    return;
  }
  if (F.proCut > 0 && (F.proCut -= dt) <= 0) { F.proCut = 0; morning(rt, ctx); }
  // 軍議の絵図の駒（台詞に合わせて手前の端から持ち場へ滑る）
  if (F.oStep === 4 && F.councilPieces) for (const k in F.councilPieces) {
    const p = F.councilPieces[k]; if (p.t0 === undefined) continue;
    const a = Math.min(1, (rt.t - p.t0) / 1.4), e = a * a * (3 - 2 * a);
    p.m.position.set(p.from.x + (p.to.x - p.from.x) * e, 0.82 + Math.sin(a * Math.PI) * 0.06, p.from.z + (p.to.z - p.from.z) * e);
  }
  if (F.oStep === 0) return;
  // 連れた隊は主人公の後ろを歩く（行き先は主人公が動いた時だけ置き直す）
  // 11/19 cloud-06：丘の段（幕3 の麓から頂）は組が頂の先の行き先へ先に登る。後ろへ呼び戻さない（呼び戻すと登る本人の前が空になった）
  if (!(F.pro === 3 && F.oStep >= 2) && (F.proFT = (F.proFT || 0) - dt) <= 0) {
    F.proFT = 1;
    for (const g of [F.ikeda, F.tired && F.tiredJoin ? F.tired : null, F.newG && F.newJoin ? F.newG : null]) {
      if (!g) continue;
      const c = g.center?.();
      if (c && Math.hypot(c.x - P.x, c.z - P.z) > 9 && (!g.dest || Math.hypot(g.dest.x - P.x, g.dest.z - P.z) > 6)) follow(rt, g);
    }
  }
  if (F.pro === 1) {
    if (F.oStep === 1 && F.tired && near(P, SCENE[1].pins[0], 9)) {
      F.oStep = 2; F.tiredJoin = true;
      rt.say('足軽', '……へい。立ちまする', 2.4);
      after(rt, 3, () => rt.say('羽柴秀長', '遅れる者はおらぬか。街道の口で隊を揃えよ', 3));
    } else if (F.oStep === 2 && near(P, SCENE[1].pins[1], 10)) next(rt, ctx, 2);
  } else if (F.pro === 2) {
    if (F.oStep === 1 && near(P, SCENE[2].pins[0], 9)) {
      F.oStep = 2; F.newJoin = true;
      rt.say('足軽', '握り飯じゃ……ありがたい', 2.4);
      // 秀吉が騎馬で隊列の横を通る（ずっと横にはいない）
      if (F.proHon) {
        rt.cutT = rt.t;   // 本陣の置き直し（audit が「兵が飛んだ」に数えない）
        for (const u of F.proHon.units) if (u.alive) { const x = 96, z = 150 + Math.random() * 6; u.pos.set(x, rt.world.heightAt(x, z), z); u.mesh?.position.copy(u.pos); }
        F.proHon.order = 'move'; F.proHon.dest = { x: 10, z: 96 }; F.proHon.speed = 4.6; F.proHon.onArrive = (g) => { g.order = 'hold'; };   // 11/18 クラウド：着いた後も「移る」のまま立ち、act bot の止まり（171・191秒）に出ていた
      }
      // 城の米と銀を皆に配ったという話は軍記（川角太閤記ほか）の伝え。殿の言葉にせず、兵の噂として聞かせる（drama_req 12：確証の弱い逸話は伝承扱い）
      after(rt, 2, () => rt.say('足軽', '殿が城の米も銀も皆に配られた、と噂じゃ。ほんまかのう', 3.4));
      after(rt, 6, () => rt.say('姫路の侍', '新手の者ども、羽柴様の列に付け！', 2.8));
    } else if (F.oStep === 2 && near(P, SCENE[2].pins[1], 10)) {
      // 兵糧の荷駄を先に通す（荷を積んだ馬と人足の列が城下から西の街道へ。主人公の組が脇を守る）
      F.oStep = 3; F.nidaT0 = rt.t;
      F.nida = allyGroup(rt, { name: '兵糧の荷駄', anchor: { ...NIDA.from }, facing: -Math.PI / 2, width: 3, formation: 'column', aggro: 0, seekRange: 0, morale: 80, noRout: true, fullStrength: true },
        ctx.fl([{ type: 'samurai', n: 2, o: { horse: true, keep: true } }, { type: 'ashigaru', n: 6, o: { keep: true } }], ctx.HA));
      for (const u of F.nida.units) { u.invuln = true; u.noTarget = true; }
      F.nida.order = 'move'; F.nida.dest = { ...NIDA.to }; F.nida.speed = 3.4;   // 11/18 cloud-06（中学生の bot：荷駄の脇を歩くだけで45秒なにも起きない）：2.6→3.4 F.nida.onArrive = (g) => { g.order = 'hold'; };
      rt.say('姫路の侍', '兵糧の荷駄が先じゃ！　道を空けて脇を守れ！', 2.8);
      after(rt, 5, () => rt.say('羽柴秀長', '米が尽きれば足も止まる。荷駄は一つも失うな', 3));
    } else if (F.oStep === 3) {
      const c = F.nida?.center?.() || NIDA.to;
      // 道の半ばで、乱れに乗じた野盗が荷を狙って出る（小さな妨害だけ）
      // 11/18 cloud-06（中学生の bot：荷駄の脇で30秒、印も敵も無く迷った）：野盗は十二秒で出る（20→12）
      if (!F.bandit && (c.x < 30 || rt.t - F.nidaT0 > 12)) {
        F.bandit = enemyGroup(rt, { name: '荷を狙う野盗', anchor: { x: c.x - 8, z: c.z - 22 }, facing: 0, width: 5, formation: 'line', order: 'attack', aggro: 30, seekRange: 40, morale: 50, dmgMult: 0.3 },
          [{ type: 'ashigaru', n: 4 }, { type: 'samurai', n: 1 }]);
        F.bandit.dest = { x: c.x, z: c.z };
        rt.say('足軽', '野盗じゃ！　荷に手を出させるな！', 2.6);
      }
      if (F.bandit && !F.banditGone && ctx.aliveN(F.bandit) <= 1) {
        F.banditGone = true;
        ctx.rout(F.bandit);
        rt.say('姫路の侍', '散ったぞ。荷駄は無事じゃ', 2.4);
      }
      // 11/18 クラウド：荷駄は行き先の四 m 手前で人と馬に押されて「移る」のまま止まった（act bot 181秒）。六 m の内へ来たら着いた事にして立たせる
      if (F.nida && F.nida.order === 'move' && near(c, NIDA.to, 6)) F.nida.order = 'hold';
      const arrived = near(c, NIDA.to, 10) || rt.t - F.nidaT0 > 55;   // 75→55
      if (arrived && F.banditGone && near(P, c, 22)) next(rt, ctx, 3);
    }
  } else if (F.pro === 3) {
    // 明智の物見（小さな妨害だけ）：道の半ばで北の藪から
    fallStep(rt, ctx, P);
    if (!F.proScouts && F.p3Fall >= 2 && (P.x > -30 || rt.t - F.p3RestT > 22)) {
      F.proScouts = enemyGroup(rt, { name: '明智の物見', faction: 'akechi', anchor: { x: -6, z: 112 }, facing: 0, width: 6, formation: 'line', order: 'attack', aggro: 30, seekRange: 40, morale: 60, dmgMult: 0.35 },
        ctx.ak([{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }, { type: 'gun', n: 1 }]));
      F.proScouts.dest = { x: P.x, z: P.z };
      rt.say('使番', '桔梗の旗！　明智の物見じゃ、追い散らせ！', 2.8);
    }
    const left = F.proScouts ? ctx.aliveN(F.proScouts) : 9;
    if (F.proScouts && left <= 1 && !F.proScoutsGone) {
      F.proScoutsGone = true;
      ctx.rout(F.proScouts);
      rt.say('足軽', '追い払うたぞ！', 2);
    }
    // 刻限だけで健在の物見を消して山崎へ進めない。合流地点まで追わせ、実際に退けてから移る。
    // 11/18 cloud-06（中学生の bot：合流地点に着いて30秒、印も敵も無く迷った）：物見を本人へ寄せるのは95→50秒から
    // 11/19 08:20 UTC 持ち主 クラウド：二の組は合流地点の南四十 m に出て歩いて来る間、本人は印の上で十二秒立ち、着いた池田勢が先に討ち切った（本人の討ち取り0）。二の組も本人へ寄せる
    const sg = !F.proScoutsGone ? F.proScouts : !F.proScouts2Gone ? F.proScouts2 : null;
    if (sg && near(P, SCENE[3].pins[0], 10)) {   // 着いたらすぐ寄せる（50秒待ちでも中学生の bot が30秒迷った）
      const g = sg;
      if (!(g.order === 'move' && g._tateRe) && (!g.dest || !near(g.dest, P, 6))) {
        g.order = 'move'; g.dest = { x: P.x, z: P.z };
        g.onArrive = (q) => { q.order = 'attack'; };
      }
    }
    // K149（kaito 11/9「操作できる中国大返し3〜4分」）：act bot で大返しが約二分だった。合流地点の手前で、明智の物見の二の組が道を塞ぐ（退けてから山崎へ）
    if (F.proScoutsGone && F.p3Water >= 2 && !F.proScouts2) {
      const q = SCENE[3].pins[0];
      F.proScouts2 = enemyGroup(rt, { name: '明智の物見', faction: 'akechi', anchor: { x: q.x - 4, z: q.z - 4 }, facing: 0, width: 6, formation: 'line', order: 'attack', aggro: 30, seekRange: 40, morale: 85, dmgMult: 0.35 },
        ctx.ak([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8, o: { flagScale: 1 } }, { type: 'gun', n: 2 }]));
      after(rt, 1.5, () => rt.say('使番', '合流の地の手前にも物見が出た！　道を空けさせよ！', 2.8));
    }
    const left2 = F.proScouts2 ? ctx.aliveN(F.proScouts2) : 9;
    if (F.proScouts2 && left2 <= 2 && !F.proScouts2Gone) {
      F.proScouts2Gone = true;
      ctx.rout(F.proScouts2);
      rt.say('羽柴秀長', '道は空いた。急げ、摂津はすぐそこじゃ', 2.6);
    }
    if (F.oStep === 1 && near(P, SCENE[3].pins[0], 10) && F.proScoutsGone && F.proScouts2Gone) {
      // 摂津の先の丘へ（暗転の間に麓へ。雨が上がり、夜が明けかける）
      F.oStep = 2; F.proHillCut = 1.2; rt.scene.visible = false;
    }
    if (F.oStep === 2 && F.proHillCut > 0 && (F.proHillCut -= dt) <= 0) {
      F.proHillCut = 0; rt.scene.visible = true;
      rt.world.dayClock = null; rt.world.setTime('morning', true);
      if (rt.world.setRainTarget) { rt.world.setRainTarget(0.1); rt.world.rainLevel = 0.1; }
      warp(rt, HILL.foot, [F.ikeda, F.tired, F.newG]);
      // 11/19 cloud-06（受け持ちの質・200秒の写真）：麓へ移った後、池田勢と疲れた足軽は行き先を無くして麓に立ち、本人だけが林の丘を一人で登って見えた。
      //   本人の脇と少し前を丘の上へ一緒に登らせる（「後ろにも横にも羽柴の兵じゃ」の台詞の通りに）。札も丘の段の言葉にする
      // 本人は駆けて登るので、後ろに置いた組は写らない。麓と頂の間（頂に近い六〜七割の所）の道の両脇へ置き直し、本人が登りながら前に見る
      const fx = HILL.foot.x, fz = HILL.foot.z, ux = HILL.top.x - fx, uz = HILL.top.z - fz, ul = Math.hypot(ux, uz) || 1, nx = -uz / ul, nz = ux / ul;
      for (const [g, dx, dz, sp, at, side] of [[F.ikeda, 1, 1, 3.2, 0.7, 1], [F.tired, -1, 1, 2.8, 0.6, -1]]) {
        if (!g || !g.units?.some((u) => u.alive)) continue;
        let i = 0;
        for (const u of g.units) {
          if (!u.alive || u.gone || u === rt.player.u) continue;
          const t = at + Math.floor(i / 3) * 0.035, w = side * (4 + (i % 3) * 1.6);
          const x = fx + ux * t + nx * w, z = fz + uz * t + nz * w;
          u.pos.set(x, rt.world.heightAt(x, z), z); u.mesh?.position.copy(u.pos); u.moveTo = null; u.target = null; i++;
        }
        // 組の陣の芯（anchor）も一緒に移す（warp が麓に置いた芯へ兵が引き戻され、本人の後ろに残った）
        if (g.anchor) { g.anchor.x = fx + ux * at; g.anchor.z = fz + uz * at; }
        // 行き先は頂の少し先の両脇（頂に立った本人の前に、京の方を見る兵が並ぶ）。本人は駆けるので歩みも速める
        g.order = 'move'; g.speed = sp; g.dest = { x: HILL.top.x + (ux / ul) * 9 * dx + nx * side * 6, z: HILL.top.z + (uz / ul) * 9 * dz + nz * side * 6 }; g.onArrive = (q) => { q.order = 'hold'; };
      }
      rt.obj('main', HILL_TEXT, 'main');
      // 11/19 cloud-06（K281・司令塔：200秒に本人から30〜60m の敵の本物が16）：頂の先、京の側の斜面に明智方の物見を一組（5人・刃軽め・崩れやすい）。
      //   丘に登る本人の前に桔梗の旗が見え、頂で斬り合える（戦ってよい本物）。兵の総数はほぼ変えない
      if (!F.hillScouts) {
        const qx = HILL.top.x + (ux / ul) * 30, qz = HILL.top.z + (uz / ul) * 30;
        F.hillScouts = enemyGroup(rt, { name: '明智の物見', faction: 'akechi', anchor: { x: qx, z: qz }, facing: Math.atan2(-ux, -uz), width: 4, formation: 'line', order: 'hold', aggro: 26, seekRange: 34, morale: 45, dmgMult: 0.3 },
          ctx.ak([{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }, { type: 'gun', n: 1 }]));
      }
      rt.banner('摂津　尼崎の先', '夜明け。丘の上から京の方を見る');
      after(rt, 3, () => rt.say('使番', '富田で、丹羽様と信孝様の手が殿に合流されましたぞ！', 3));
      // K355（一統記6巻 VOL.49・自分の言葉）：富田で秀吉は雨の泥に膝をつき、信孝を迎えて泣いた（太閤記の伝え＝C）。
      //   主人公は見ていないので、組の者の聞いた話として一行だけ
      after(rt, 7, () => rt.say('組の者', '富田で殿は、雨の泥に膝をついて信孝様を迎え、泣かれたそうじゃ', 3.4));
    }
    if (F.oStep === 2 && !F.proHillCut && near(P, HILL.top, 9)) {
      F.oStep = 3;
      rt.say('足軽', '……あれが、京の方か', 2.6);
      after(rt, 3, () => rt.say('羽柴秀長', '見よ、後ろにも横にも羽柴の兵じゃ。皆、戻ってきたのだ', 3.4));
      after(rt, 7.5, () => rt.say('羽柴秀吉', '日向は山崎に出る。ここからは戦じゃ。旗を立てよ！', 3.2));
      after(rt, 11.5, () => councilCut(rt, ctx));
    }
    if (F.oStep === 4 && F.proCouncilCut > 0 && (F.proCouncilCut -= dt) <= 0) {
      F.proCouncilCut = 0; council(rt, ctx);
    }
  }
}

// 暗転して次の場面へ（4 は山崎の手前＝本筋の①）
function next(rt, ctx, n) {
  const F = rt.flags;
  F.proWarp = true;
  F.proWarpT = 1.6; F.proNext = n;
  rt.scene.visible = false;
}

// 山崎へ移る時：序の隊を片付ける（自分の備だけ残す）
export function clear(rt) {
  const F = rt.flags;
  // 備中・姫路だけの旗と荷物を山崎に残さない。終了時の片付けに含めるため場面には保つ。
  for (const object of F.proProps || []) object.visible = false;
  for (const g of [F.proHon, F.rider, F.tired, F.newG, F.proScouts, F.proScouts2, F.hillScouts, F.nida, F.bandit, F.turnG, F.kei, F.fallen]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
  F.proHon = F.rider = F.tired = F.newG = F.proScouts = F.proScouts2 = F.hillScouts = F.nida = F.bandit = F.turnG = F.kei = F.fallen = null;
  for (const g of F.council || []) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
  F.council = null; F.proCouncilCut = 0; unwing(F);
  F.proLake = false; F.proCut = 0;
  F.pro = 0;
}

// 途中から続ける時の幕の始まり（battle_checkpoint の resumeSteps）
export function resumeScene(rt, ctx, n) {
  const F = rt.flags;
  F.proWarp = false; F.proWarpT = 0; F.proNext = 0; F.proCut = 0;
  rt.scene.visible = true;
  if (n === 1) { start(rt, ctx); return; }
  if (!F.proHon) start(rt, ctx, false);
  F.holdPlayer = false;
  scene(rt, ctx, n);
}

export function pin(F) {
  if (!F.pro || F.proWarp) return null;
  if (F.pro === 1 && F.proLake) { PIN.x = SHORE.x; PIN.z = SHORE.z; return PIN; }
  const S = SCENE[F.pro];
  if (F.pro === 2 && F.oStep === 3) { const c = F.nida?.center?.() || NIDA.to; PIN.x = c.x; PIN.z = c.z; return PIN; }
  if (F.pro === 3 && F.oStep >= 4) return null;   // 軍議の間は行き先なし（幕の口で聞く）
  if (F.pro === 3 && F.oStep === 1 && F.p3Fall === 0) { PIN.x = FALL.x; PIN.z = FALL.z; return PIN; }
  if (F.pro === 3 && F.oStep === 1 && F.p3Fall === 1) return null;   // 小休止の間は印を出さない
  if (F.pro === 3 && F.oStep === 1 && F.proScoutsGone && F.p3Water === 0) { PIN.x = WATER.x; PIN.z = WATER.z; return PIN; }
  if (F.pro === 3 && F.oStep === 1 && F.p3Water === 1) return null;
  if (F.pro === 3 && F.oStep >= 2) { if (F.proHillCut > 0) return null; PIN.x = HILL.top.x; PIN.z = HILL.top.z; return PIN; }
  const p = F.pro === 1 ? S.pins[F.oStep >= 2 ? 1 : 0] : F.pro === 2 ? S.pins[F.oStep >= 2 ? 1 : 0] : S.pins[0];
  PIN.x = p.x; PIN.z = p.z;
  return PIN;
}
// bot：近い物見を討ち、いなければ行き先へ
export function botTarget(F) { return F.oStep ? pin(F) : null; }
