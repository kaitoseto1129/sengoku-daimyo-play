// ======================================================================
// 本能寺の変　章0 前夜（docs/specs/honnoji_eve_req_1118.md・kaito_now 2・11/19 クラウドせ）
// 六月一日の夜。御殿の広間の茶席に、下座から座る（上座の信長と同格にしない＝要件6）。
// 信長は上座で客（公家・博多の商人・寺の僧）と話し、笑う。小姓は茶を運ぶ。客が帰ると、控えの間の寝床で休む。
// 暗転→静か→遠くで鉄砲一つ→目が覚める。ここから今の「静かな本能寺」（shizuka.js）へつなぐ。
// 同じ境内・同じ御殿を使い回す（NG-09）。明智の兵はこの間だけ隠し、寄せない（前夜に兵はいない）。
// 入れ方：b_honnoji.js で k15Shizuka の後に wrap(honnoji) を一度（shizuka の p1 をさらに包む）。
// ======================================================================
import { k15Off, k15Scenes, k15Dark } from '../oda15_kit.js';
import { PT } from '../honno_tera.js';
import { evPerson, evRemove } from '../b_ev6.js';
import { groundAt } from '../floors.js';
import { askThen } from '../b_opening.js';
import { sfx, playMusic, setEveHush, eveSound } from '../audio.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nohStage, nohStageClear, playNoh, NOH_SEATS } from './nou.js';

// 広間（x −57〜−49・z 83.2〜95）。入口は南の廊下。上座は北の奥（推定の座の並び）
const NB_SEAT = { x: -53, z: 93.2 };           // 上座の信長（南を向く）
const ME_SEAT = { x: -53, z: 87.4 };           // 本人は下座（入口の側・上座と六歩離れる。11/20 K413：南の壁まで四歩とり、座った本人の後ろへカメラが引けるように）
const ME_IN = { x: -53, z: 81.7 };             // 御殿の廊下（広間の口の前）
const BED = { x: PT.hikae.x, z: PT.hikae.z };  // 控えの間に敷いた寝床
const KAMA = { x: -53, z: 90.6 };              // 茶釜と道具（上座と客の間）
const ENGAWA = { x: -50.6, z: 82.2 };          // 客が帰った後、信長が立って出る広間の前の縁（南の中庭を見る）
const GUESTS = [
  // 島井宗室：博多の商人。前夜の茶会の客と伝わる（楢柴肩衝の話）。
  ['島井宗室', { x: -55.4, z: 90.2 }, Math.PI / 2, { kosodeCol: 0x4a3f33, obi: 0x2a2018 }],
  // 勧修寺晴豊：六月一日に本能寺へ公家衆が挨拶に来たと日記にある（暦の話）。
  ['勧修寺晴豊', { x: -50.6, z: 90.6 }, -Math.PI / 2, { kosodeCol: 0x3a3f55, obi: 0x5a4a30 }],
  // 寺の僧
  ['日衍', { x: -50.6, z: 88.2 }, -Math.PI / 2, { kosodeCol: 0x2c2a28, obi: 0x2c2a28 }],
];
const SIT = () => ({ standing: false, t: 0, soldiers: [], seiza: true });   // 茶席は正座（humans_motion.js の seiza。kaito 11/19「座り方もちゃんと」）
const AGURA = () => ({ standing: false, t: 0, soldiers: [], agura: true });   // 11/20 K443：上様は胡坐（kaito「信長も客も正座か胡坐」）

export function wrap(def) {
  const p1 = def.p1;
  def.p1 = function (r) {
    const F = r.flags;
    if (F.ending || r.over || !r.player.u.alive) return;
    if (k15Off(r) || F.zenyaDone || F.shizukaDone || F.hp) { warOn(r); propsNear(r); return p1.call(this, r); }
    if (F.k15stage === 'zenya') return;
    start(r, () => { F.zenyaDone = true; F.k15on = false; F.k15stage = null; F.k15at = null; eveLookEnd(r); warOn(r); p1.call(this, r); });
  };
  // 要件60：前夜は飛ばせる（ほかの時は今までどおり飛ばさない）
  const cs = def.canSkip, sk = def.skip;
  // 要件17：能は途中で飛ばせる（能だけを終え、茶席の続きへ）
  def.canSkip = (r) => (r.flags.k15stage === 'zenya' && r.flags.nohSkip ? '能を終える' : r.flags.k15stage === 'zenya' && !r.flags.zenyaSkip && r.t > 3 ? '夜明け前へ' : cs ? cs(r) : '');
  def.skip = (r) => { if (r.flags.k15stage === 'zenya' && r.flags.nohSkip) r.flags.nohSkip(); else if (r.flags.k15stage === 'zenya' && !r.flags.zenyaSkip) { r.flags.zenyaSkip = true; r.flags.nohSkip = null; r.flags.zenyaEnd?.(true); } else if (sk) sk(r); };
}

function put(rt, u, x, z, face) {
  if (!u?.alive) return;
  u.pos.set(x, groundAt(rt.world, x, z, u.pos.y), z); u.mesh?.position.copy(u.pos);
  u.moveTo = null; u.target = null;
  if (face != null) { u.heading = face; u.facing = face; }
  rt.cutT = rt.t;   // 11/20 クラウドせ：前夜の座の置き直しは暗転の中・章の頭だけ（act bot 28秒 信長 (-53,93)↔(-58,72) ★★24回を飛びに数えない）
}

// 本人と供を一緒に移す（本人のそばの組は置いて行かない）
//   11/25 K667：遠い（6m 超）時は勝手に飛ばさず、書いたボタンを押した時だけ移す（開戦二秒以内と近い時は今まで通り）
function moveMe(rt, x, z, face, label) {
  askThen(rt, x, z, label || '座敷の席へ着く', () => {
    const P = rt.player, u = P.u, dx = x - u.pos.x, dz = z - u.pos.z;
    for (const q of rt.army.units) if (q.alive && !q.isPlayer && (q.group?.isPlayerSquad || (rt.tomoUnits || []).includes(q))) put(rt, q, q.pos.x + dx, q.pos.z + dz);
    put(rt, u, x, z, face);
    if (face != null) P.yaw = face;
  });
}

// 11/19 kaito「刀を持った状態で、敵に囲まれた状態で、能を見るとかが始まっちゃう。戦が始まる前と始まった後の区別がちゃんとついていない」：
//   前夜の章の間は flags.beforeWar を立てる（battle.js が布陣の表・陣立て・新手・場面の兵を立てず、戦の音と呟きと武器の札を止める。b_honnoji.js の update も寄せを動かさない）。
//   それでも先に居る明智の兵（光秀の本陣など）・囲みの松明・桔梗の旗は隠し、寺の者の手の刀・槍・弓も見せない（寝間着の夜に抜き身を持たない）。
//   朝の鉄砲で目が覚めた時に戻し、そこから初めて明智の兵を立てる（warOn）。
function hideFoes(rt, on) {
  const F = rt.flags;
  if (on) {
    F.zenyaHid = F.zenyaHid || [];
    for (const g of rt.army.groups || []) {
      if (g.team === 0 || g._zenyaHid) continue;
      g._zenyaHid = true;
      F.zenyaHid.push([g, g.peaceful, g.hidden]);
      g.peaceful = true; g.hidden = true;
    }
    for (const [g] of F.zenyaHid) for (const u of g.units) if (u.mesh && u.mesh.visible) { if (u._zenyaVis === undefined) u._zenyaVis = true; u.mesh.visible = false; }
    // 寺の者は手に何も持たない（刀は腰のまま）
    F.zenyaWpn = F.zenyaWpn || new Set();
    //   u.noWpn は units.js の毎コマの得物の見せ方が見る（手の得物を隠すだけで、持ち物は変えない）
    for (const u of rt.army.units) if (u.team === 0 && u.alive && !u.noWpn) { u.noWpn = true; u._zenyaKind = u.wpnKind; if (u.wpnKind !== 'none') u.wpnKind = 'none'; if (u.wpn) u.wpn.visible = false; F.zenyaWpn.add(u); }   // K444：得物の種類も none にして、槍を握る手の形を残さない
    const P = rt.player.u; if (P && !P.noWpn) { P.noWpn = true; P._zenyaKind = P.wpnKind; if (P.wpnKind !== 'none') P.wpnKind = 'none'; if (P.wpn) P.wpn.visible = false; F.zenyaWpn.add(P); }
    for (const o of [F.ring?.grp, ...(F.akNobori || [])]) if (o && o.visible) { o.visible = false; (F.zenyaObj || (F.zenyaObj = new Set())).add(o); }
  } else {
    for (const [g, pc, hd] of F.zenyaHid || []) {
      g.peaceful = pc; g.hidden = hd; delete g._zenyaHid;
      for (const u of g.units) if (u.mesh && u._zenyaVis !== undefined) { u.mesh.visible = true; delete u._zenyaVis; }
    }
    for (const u of F.zenyaWpn || []) { if (u._zenyaKind !== undefined) { u.wpnKind = u._zenyaKind; delete u._zenyaKind; } delete u.noWpn; if (u.wpn) u.wpn.visible = true; }
    for (const o of F.zenyaObj || []) o.visible = true;
    F.zenyaHid = null; F.zenyaWpn = null; F.zenyaObj = null;
  }
}
// 11/21 k365-cloud-18（司令塔・K481）：明けてから明智の兵と旗を初めて描くと、描き方の組み立て（三秒余り）で画が固まる。
//   能へ移る黒の間に、隠した兵と旗を一度だけ見せて描き方を組んでおき（renderer.compile）、また隠す。兵は動かさない（peaceful のまま・hidden は一秒余りで戻す）
function warmFoes(rt) {
  const F = rt.flags;
  if (F.zenyaWarmed || !F.zenyaHid) return;
  F.zenyaWarmed = true; F.zenyaWarmUntil = rt.t + 1.4;
  for (const [g] of F.zenyaHid) { g.hidden = false; for (const u of g.units) if (u.mesh && u._zenyaVis !== undefined) u.mesh.visible = true; }   // 遠い兵の群れ（vatCrowd）も hidden で作られないので、一緒に外す（peaceful のまま動かない）
  for (const o of F.zenyaObj || []) o.visible = true;
  rt.after(0.6, () => {
    const R = rt.game?.renderer;
    try { if (R?.compile && rt.camera) R.compile(rt.scene, rt.camera); } catch (e) { /* 組めなくても隠し直す */ }
    rt.after(0.3, () => { F.zenyaWarmUntil = 0; for (const [g] of F.zenyaHid || []) g.hidden = true; if (F.beforeWar) hideFoes(rt, true); }, true);
  }, true);
}
// 11/21 K365 クラウド34（司令塔・kaito_now ② の空と光）：前夜（六月一日の夜の茶会と能）の間も、戦の朝の『夜明け前の光』（HONNO_DAWN・空の回り光 2.1）のままで、
//   星の夜空なのに庭が昼ほど明るかった。前夜の間だけ共通の夜（月と灯の夜）にし、章が済んだら元の夜明け前の光へ戻す。兵・段・カメラは触らない。?honeve=old で前
function eveLookStart(rt) {
  const W = rt.world, F = rt.flags;
  if (!W || F.eveLook || /[?&]honeve=old/.test(globalThis.location?.search || '')) return;
  F.eveLook = { look: W.currentLook(), key: W.timeKey };
  W.setTime('night', true);
}
function eveLookEnd(rt) {
  const W = rt.world, F = rt.flags, E = F.eveLook;
  if (!W || !E) return;
  F.eveLook = null;
  W.timeKey = E.key; W.fade = null; W.applyLook(E.look); if (W.updateEnv) W.updateEnv();
}
// 戦の始まり：前の章の印を下ろし、開戦の法螺と陣太鼓（battle.js が quietOpen で止めていた）を鳴らす
function warOn(rt) {
  const F = rt.flags;
  if (F.warOnDone) return;
  F.warOnDone = true; F.beforeWar = false; setEveHush(false);
  teaTopple(rt);   // 前夜の太鼓止めを解いてから開戦の法螺と陣太鼓
  if (!rt.G?.lord) playMusic('prebattle');
}

// 11/22 K564（クラウド 本能寺の持ち主）：前夜の小道具（茶道具・行灯三つ・寝床）は御殿の中に残すが、門の段（302秒）でも十四回ずつ描いていた。
//   本人が広間から二十八歩より離れている間は描かない（中庭の際より遠く、壁と縁の奥で見えない）。半秒に一度だけ照らす。置き場と倒れ方は今のまま
function propsNear(rt) {
  const F = rt.flags;
  if ((F.zenyaNearAt || 0) > rt.t) return;
  F.zenyaNearAt = rt.t + 0.5;
  const p = rt.player.u.pos, near = (p.x - KAMA.x) ** 2 + (p.z - KAMA.z) ** 2 < 28 * 28;
  for (const g of [F.zenyaTea, F.zenyaFuton, F.zenyaLamps, ...(F.zenyaAndon?.list || []).map((a) => a.g)]) if (g && g.visible !== near) g.visible = near;
}
// 茶釜・風炉・茶碗・茶入（基本形。翌朝も同じ所に残る＝要件55・56）
// K695（kaito 11/26「どう思うこれ」・窓口「道具が壺一つで茶会に見えない」）：書院の茶（台子の点前）の作りに替える。
//   手本と出所は docs/honnoji-k695-chakai-reference.md：六月は風炉の季（炉は十一月〜四月）なので、黒塗りの長板（台子の地板を畳に置く書院の飾り）に唐銅の風炉と釜、
//   天目茶碗（天目台）と九十九髪茄子の茶入（盆に載せ、仕覆を脇に）・水指・杓立と柄杓・建水・蓋置。台子の高さ（0.7m）は座った本人から上様の顔を隠したので長板にした
//   上様の後ろに金地の屏風、西の襖際に押板（床）と三幅の掛物・三具足、上様の座に上畳。
//   形は基本形だけ・材質は九つを使い回す（形の数は docs の紙に前後を書いた）
function teaSet(rt) {
  const T = THREE;
  if (rt.flags.zenyaTea) return;
  const y = groundAt(rt.world, KAMA.x, KAMA.z, rt.player.u.pos.y);
  const grp = new T.Group(); grp.name = '前夜の茶道具';
  const iron = new T.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.55, metalness: 0.45 });
  const bronze = new T.MeshStandardMaterial({ color: 0x5b4a2e, roughness: 0.45, metalness: 0.6 });
  const urushi = new T.MeshStandardMaterial({ color: 0x0e0b09, roughness: 0.25 });
  const glaze = new T.MeshStandardMaterial({ color: 0x1c1714, roughness: 0.3 });
  const ivory = new T.MeshStandardMaterial({ color: 0xcfc3a8, roughness: 0.6 });
  const chaireMat = new T.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.28 });   // 茄子の茶入：飴色の釉
  const bamboo = new T.MeshStandardMaterial({ color: 0xb59a5c, roughness: 0.7 });
  const cloth = new T.MeshStandardMaterial({ color: 0x7a5a2a, roughness: 0.9 });       // 仕覆（名物裂の金襴）
  const mesh = (geo, m, x, yy, z) => { const o = new T.Mesh(geo, m); o.position.set(x, yy, z); grp.add(o); return o; };
  // 黒塗りの長板（幅 1.4m・奥 0.45m。上座の信長と下座の間に横向き）
  mesh(new T.BoxGeometry(1.4, 0.03, 0.45), urushi, 0, 0.015, 0);
  // 唐銅の風炉と釜（地板の左）
  const furo = mesh(new T.CylinderGeometry(0.17, 0.2, 0.2, 16), bronze, -0.4, 0.13, 0);
  for (const a of [0, 2.1, 4.2]) mesh(new T.SphereGeometry(0.03, 6, 4), bronze, -0.4 + Math.cos(a) * 0.16, 0.035, Math.sin(a) * 0.16);   // 鬼面の脚
  const kama = mesh(new T.SphereGeometry(0.15, 16, 10), iron, -0.4, 0.31, 0); kama.scale.y = 0.75;
  const lid = mesh(new T.CylinderGeometry(0.07, 0.075, 0.015, 14), iron, -0.4, 0.42, 0);
  for (const sd of [-1, 1]) mesh(new T.TorusGeometry(0.025, 0.007, 5, 10), iron, -0.4 + sd * 0.15, 0.33, 0).rotation.y = Math.PI / 2;   // 釜の鐶付
  // 地板の右：水指（白い磁器の手付き）・杓立と柄杓・建水・蓋置
  const mizusashi = mesh(new T.CylinderGeometry(0.1, 0.09, 0.2, 14), ivory, 0.35, 0.13, -0.05);
  mesh(new T.CylinderGeometry(0.045, 0.045, 0.16, 10), bronze, 0.6, 0.11, 0.1);           // 杓立
  const hishaku = mesh(new T.CylinderGeometry(0.006, 0.006, 0.42, 5), bamboo, 0.6, 0.3, 0.1); hishaku.rotation.z = 0.12;
  mesh(new T.CylinderGeometry(0.075, 0.06, 0.09, 12), bronze, 0.1, 0.075, 0.12);          // 建水
  mesh(new T.CylinderGeometry(0.03, 0.03, 0.04, 8), bronze, 0.1, 0.05, -0.12);            // 蓋置
  // 長板の前の畳：天目茶碗と天目台・盆の上の九十九髪茄子と仕覆・茶杓
  mesh(new T.CylinderGeometry(0.075, 0.05, 0.05, 14), urushi, 0.05, 0.025, -0.42);          // 天目台
  const chawan = mesh(new T.CylinderGeometry(0.07, 0.035, 0.065, 14), glaze, 0.05, 0.085, -0.42);
  mesh(new T.CylinderGeometry(0.13, 0.13, 0.015, 16), urushi, -0.35, 0.008, -0.45);            // 盆
  const chaire = mesh(new T.SphereGeometry(0.045, 12, 8), chaireMat, -0.35, 0.06, -0.45); chaire.scale.y = 1.25;
  mesh(new T.CylinderGeometry(0.022, 0.022, 0.012, 10), ivory, -0.35, 0.115, -0.45);         // 象牙の蓋
  mesh(new T.SphereGeometry(0.05, 8, 6), cloth, -0.6, 0.03, -0.38).scale.y = 0.6;           // 脱いだ仕覆
  const chashaku = mesh(new T.BoxGeometry(0.18, 0.006, 0.012), bamboo, 0.32, 0.006, -0.4); chashaku.rotation.y = 0.3;
  // 客の前に出した茶碗（下座の側の畳の上）
  const chawan2 = mesh(new T.CylinderGeometry(0.065, 0.04, 0.07, 14), glaze, 0.2, 0.035, -0.85);
  grp.userData.furo = furo;
  hall(rt, grp);
  mergeStill(grp, [chawan, chawan2, lid, chaire]);
  // K695：広間の茶道具・屏風・床は、共通の見通し（player.js の camNear：画面の中ほど九・五m 内の面を抜く）で抜かない（屏風が上様の後ろで消えていた）
  grp.traverse((o) => { if (o.material) o.material.userData.camNearSolid = true; });
  grp.position.set(KAMA.x, y, KAMA.z);
  rt.scene.add(grp);
  rt.flags.zenyaTea = grp;
  grp.userData.tip = { chawan, chawan2, lid, chaire };
  // 要件55（茶道具をただの背景にしない）：近づくと「見る」。長い解説はせず、そばの者の一言だけ（押すたびに替わる）。
  //   史実の分け：信長が本能寺へ名物の茶道具を持ち込んだ・六月一日付の道具の目録が伝わる・九十九髪茄子が本能寺で焼けた は伝え（C）なので『と聞く』の形
  const LOOK = [
    ['森蘭丸', '上様は、安土から名物の道具を三十余りも持って来られたと聞きます', 3.4],
    ['森蘭丸', 'この茄子の形の茶入は、九十九髪と申す名物にございます', 3.2],
    ['織田信長', '道具は眺めるだけでは死ぬ。使うてこそよ', 3],
  ];
  rt.addInteract('zenya-dogu', { x: KAMA.x, z: KAMA.z }, '見る　茶道具', () => {
    const F = rt.flags; if (F.warOnDone) return;
    const k = F.doguI = ((F.doguI ?? -1) + 1) % LOOK.length;
    rt.say(...LOOK[k]);
  }, { r: 3.6 });   // 茶席の下座（座った所）から釜まで約3.2m。座ったまま見られる届きに
}
// 11/28 K564（クラウドわ）：茶道具と広間のしつらえは動かない物が四十ほど一つずつ描かれていた（本能寺の乱戦で描く回数 303 のうち三十）。
//   翌朝に倒れる茶碗・茶入・釜の蓋（keep）だけ残し、ほかは材質ごとに一つの形へ焼き込む（置き場・寸法・材質は前のまま＝見た目は同じ）
function mergeStill(grp, keep) {
  const by = new Map(), drop = [];
  grp.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert(), m = new THREE.Matrix4();
  grp.traverse((o) => {
    if (!o.isMesh || keep.includes(o) || o.parent !== grp) return;
    const g = o.geometry.index ? o.geometry.clone() : null; if (!g) return;
    m.multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(m);
    if (!by.has(o.material)) by.set(o.material, []);
    by.get(o.material).push(g); drop.push(o);
  });
  for (const [mat, geos] of by) {
    if (geos.length < 2) { geos.forEach((g) => g.dispose()); continue; }
    const merged = mergeGeometries(geos.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }));
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mine = drop.filter((o) => o.material === mat);
    mine.forEach((o) => { grp.remove(o); o.geometry.dispose(); });
    const one = new THREE.Mesh(merged, mat); one.name = mine[0].name || ''; grp.add(one);
  }
}
// K695：広間のしつらえ（金地の屏風・押板の床と三幅の掛物・三具足・上様の上畳）。grp の子にして、茶道具と一緒に見え隠れする
let HALL_TEX = null;
function hallTex() {
  if (HALL_TEX) return HALL_TEX;
  const T = THREE, mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
  let seed = 695; const R = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  // 金地の屏風：金箔の箔足（四角の継ぎ目）と金雲、下に松の幹と緑青の葉（狩野派の金碧の作り）
  const gold = mk(512, 256, (g, W, H) => {
    g.fillStyle = '#c9a24a'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 32) for (let yy = 0; yy < H; yy += 32) { g.fillStyle = `rgba(${R() < .5 ? '255,226,140' : '150,110,40'},${.08 + R() * .12})`; g.fillRect(x, yy, 32, 32); g.fillStyle = 'rgba(120,86,30,.25)'; g.fillRect(x, yy, 1, 32); g.fillRect(x, yy, 32, 1); }
    g.strokeStyle = '#3a2a1a'; g.lineCap = 'round';
    for (const [x0, lw] of [[110, 16], [360, 12]]) { g.lineWidth = lw; g.beginPath(); g.moveTo(x0, H); g.bezierCurveTo(x0 + 30, H * .6, x0 - 40, H * .45, x0 + 60, H * .2); g.stroke(); }
    g.fillStyle = '#2f5a3c'; for (let i = 0; i < 22; i++) { const x = 60 + R() * 380, yy = 30 + R() * 110; g.beginPath(); g.ellipse(x, yy, 26 + R() * 20, 8 + R() * 5, (R() - .5) * .4, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(240,214,140,.55)'; for (const [x, yy, w] of [[20, 200, 200], [300, 225, 220], [200, 20, 180]]) { g.beginPath(); g.ellipse(x + w / 2, yy, w / 2, 18, 0, 0, 7); g.fill(); }
  });
  // 掛物：表具（裂の縁）と墨の山水・中に人物（三幅対の中は観音、左右は猿と鶴の見立て。遠目には墨画とだけ分かればよい）
  const scroll = mk(64, 256, (g, W, H) => {
    g.fillStyle = '#5a4630'; g.fillRect(0, 0, W, H); g.fillStyle = '#7d6a3e'; g.fillRect(4, 20, W - 8, H - 40);
    g.fillStyle = '#d8ccb0'; g.fillRect(9, 44, W - 18, H - 88);
    g.fillStyle = 'rgba(30,26,20,.75)'; g.beginPath(); g.moveTo(9, 170); g.lineTo(24, 120); g.lineTo(34, 150); g.lineTo(46, 100); g.lineTo(55, 160); g.lineTo(55, 212); g.lineTo(9, 212); g.fill();
    g.fillStyle = 'rgba(30,26,20,.55)'; g.beginPath(); g.ellipse(32, 90, 7, 14, 0, 0, 7); g.fill();
  });
  // 上畳の縁：繧繝縁（赤・緑・紫の段）
  const ungen = mk(16, 64, (g) => { ['#8a1f1a', '#c2492c', '#e8c27a', '#2e6a4a', '#5a3a6a', '#e8c27a', '#c2492c', '#8a1f1a'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * 8, 16, 8); }); });
  return (HALL_TEX = { gold, scroll, ungen });
}
function hall(rt, grp) {
  const T = THREE, X = hallTex();
  // 金箔は灯明を照り返す（夜の暗い広間でも金地と分かるよう、同じ絵を弱く光らせる）
  const goldM = new T.MeshStandardMaterial({ map: X.gold, emissiveMap: X.gold, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.5 });
  const scrollM = new T.MeshStandardMaterial({ map: X.scroll, roughness: 0.9 });
  const wood = new T.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.5 });
  const bronze = new T.MeshStandardMaterial({ color: 0x5b4a2e, roughness: 0.45, metalness: 0.6 });
  const ungenM = new T.MeshStandardMaterial({ map: X.ungen, roughness: 0.8 });
  const tatami = new T.MeshStandardMaterial({ color: 0xb7a46a, roughness: 0.95 });
  // 座標は茶道具（KAMA）からの差。上様の座は KAMA の北 2.6m、西の襖は x −57
  const add = (o, x, yy, z) => { o.position.set(x, yy, z); grp.add(o); return o; };
  // 上畳（厚い一畳・繧繝縁）
  add(new T.Mesh(new T.BoxGeometry(1.0, 0.08, 1.9), ungenM), NB_SEAT.x - KAMA.x, 0.04, NB_SEAT.z - KAMA.z).rotation.y = Math.PI / 2;
  add(new T.Mesh(new T.BoxGeometry(0.92, 0.082, 1.82), tatami), NB_SEAT.x - KAMA.x, 0.042, NB_SEAT.z - KAMA.z).rotation.y = Math.PI / 2;
  // 金地の六曲の屏風（上様の後ろ。高さ 1.5m・扇ごとに折れる）
  const leaves = 6, lw = 0.6, sz = NB_SEAT.z - KAMA.z + 1.5;
  for (let i = 0; i < leaves; i++) {
    const geo = new T.BoxGeometry(lw, 1.5, 0.025); const uv = geo.attributes.uv;   // 板の厚みを持たせる（薄い一枚の面では描かれなかった）
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / leaves);
    const leaf = new T.Mesh(geo, goldM);
    leaf.rotation.y = Math.PI + (i % 2 ? 0.35 : -0.35);
    add(leaf, (i - (leaves - 1) / 2) * lw * 0.94, 0.78, sz + (i % 2 ? 0.1 : 0));
  }
  // 押板の床（西の襖の前・上様の右手）：黒塗りの板に三幅の掛物、板の上に三具足（花瓶・香炉・燭台）
  const tx = -57 + 0.35 - KAMA.x, tz = NB_SEAT.z - KAMA.z - 1.6;
  const board = add(new T.Mesh(new T.BoxGeometry(0.6, 0.18, 2.2), wood), tx, 0.09, tz);
  for (const dz of [-0.62, 0, 0.62]) { const sc = add(new T.Mesh(new T.PlaneGeometry(0.42, 1.55), scrollM), tx - 0.28, 1.1, tz + dz); sc.rotation.y = Math.PI / 2; }
  add(new T.Mesh(new T.CylinderGeometry(0.05, 0.07, 0.24, 10), bronze), tx, 0.3, tz - 0.5);   // 花瓶
  add(new T.Mesh(new T.CylinderGeometry(0.06, 0.05, 0.08, 10), bronze), tx, 0.22, tz);         // 香炉
  add(new T.Mesh(new T.CylinderGeometry(0.012, 0.03, 0.42, 6), bronze), tx, 0.39, tz + 0.5);   // 燭台
  const flower = add(new T.Mesh(new T.SphereGeometry(0.08, 8, 6), new T.MeshStandardMaterial({ color: 0xe8e0d0, emissive: 0x302820, roughness: 0.8 })), tx, 0.5, tz - 0.5); flower.scale.y = 0.7;
  board.name = '押板';
}
// 要件14・19（夜が更ける：灯火を消す）：茶席の広間に行灯を三つ。夜更けに一つずつ消し、上様の「灯を一つ残しておけ」で一つだけ残る。
//   紙の灯（光る色の箱）と、広間に一つだけの暖かい点の灯（光は一つにまとめて軽く）
function andons(rt) {
  const T = THREE, F = rt.flags;
  if (F.zenyaAndon) return;
  const wood = new T.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8 });
  const spots = [[KAMA.x, KAMA.z + 3.6], [KAMA.x - 3.4, KAMA.z + 1.4], [KAMA.x + 3.4, KAMA.z + 1.4]];   // 一つ目（残す灯）は上座の後ろ。手前（下座の前）には置かない
  const list = spots.map(([x, z]) => {
    const y = groundAt(rt.world, x, z, rt.player.u.pos.y), g = new T.Group(); g.name = '行灯';
    const paper = new T.MeshStandardMaterial({ color: 0xefe2c4, emissive: 0xffb860, emissiveIntensity: 1.3, roughness: 0.9 });
    const box = new T.Mesh(new T.BoxGeometry(0.26, 0.42, 0.26), paper); box.position.y = 0.55;
    // 11/21 K564（iMac 立身）：台と四本の脚は同じ木の材質なので一つの形にまとめる（行灯一つで描く回数 六→二。形と寸法は前のまま）
    const woodGeos = [new T.BoxGeometry(0.3, 0.06, 0.3).translate(0, 0.3, 0)];
    for (const [lx, lz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) woodGeos.push(new T.BoxGeometry(0.03, 0.3, 0.03).translate(lx, 0.15, lz));
    const foot = new T.Mesh(mergeGeometries(woodGeos), wood); woodGeos.forEach((wg) => wg.dispose());
    g.add(box, foot); g.position.set(x, y, z); rt.scene.add(g);
    return { g, paper };
  });
  const glow = new T.PointLight(0xffb060, 3.2, 11, 2); glow.position.set(KAMA.x, groundAt(rt.world, KAMA.x, KAMA.z, rt.player.u.pos.y) + 1.4, KAMA.z); glow.userData.noFreeze = true; rt.scene.add(glow);
  F.zenyaAndon = { list, glow };
}
// K698（kaito 11/26「この一印象も本当にくそ」：夜の御殿に明かりが無い）：御殿の廊下と控えの間に燭台（灯明）を置き、
//   広間の一つの点の灯（andons の glow）を本人の近くの灯へ移して照らす（灯の数は一つのまま＝影の組み直しも重さも増やさない）
const LAMPS = [[-70.5, 81.6], [-65.5, 81.6], [-60.5, 81.6], [-55.5, 81.6], [-50.5, 81.6], [BED.x + 1.3, BED.z - 1.2], [BED.x + 1.3, BED.z + 1.2]];
function lamps(rt) {
  const T = THREE, F = rt.flags;
  if (F.zenyaLamps) return;
  const wood = new T.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.6 });
  const flame = new T.MeshStandardMaterial({ color: 0xffd08b, emissive: 0xffa040, emissiveIntensity: 2.2, roughness: 1 });
  const geo = [], fgeo = [];
  const y0 = rt.player.u.pos.y;
  for (const [x, z] of LAMPS) {
    const y = groundAt(rt.world, x, z, y0);
    geo.push(new T.CylinderGeometry(0.11, 0.13, 0.03, 10).translate(x, y + 0.015, z), new T.CylinderGeometry(0.014, 0.02, 0.85, 6).translate(x, y + 0.45, z),
      new T.CylinderGeometry(0.07, 0.05, 0.03, 10).translate(x, y + 0.88, z));
    fgeo.push(new T.SphereGeometry(0.025, 6, 5).scale(1, 1.8, 1).translate(x, y + 0.93, z));
  }
  const g = new T.Group(); g.name = '御殿の燭台';
  g.add(new T.Mesh(mergeGeometries(geo), wood), new T.Mesh(mergeGeometries(fgeo), flame));
  geo.concat(fgeo).forEach((q) => q.dispose());
  rt.scene.add(g); F.zenyaLamps = g;
}
// 点の灯を、本人の近くの燭台へ移す（広間の中では茶道具の上のまま）
function lampFollow(rt) {
  const A = rt.flags.zenyaAndon, p = rt.player.u.pos; if (!A?.glow) return;
  let bx = KAMA.x, bz = KAMA.z, best = (p.x - KAMA.x) ** 2 + (p.z - KAMA.z) ** 2 - 9;
  for (const [x, z] of LAMPS) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; bx = x; bz = z; } }
  const y = groundAt(rt.world, bx, bz, p.y) + (bx === KAMA.x && bz === KAMA.z ? 1.4 : 1.15);
  A.glow.position.set(bx, y, bz);
  if (A.glow.intensity < 1.6) A.glow.intensity = 1.6;
}
function andonsOut(rt) {
  const A = rt.flags.zenyaAndon; if (!A) return;
  // 一つずつ（一秒半おき）消し、最後の一つ（上座の側）だけ残す。点の灯も弱める
  A.list.slice(1).forEach((a, i) => rt.after(0.4 + i * 1.5, () => { a.paper.emissiveIntensity = 0; a.paper.color.setHex(0x8a806c); A.glow.intensity = 3.2 - (i + 1) * 1.1; }, true));
}

// 要件56：翌朝、同じ部屋の茶道具が倒れる（茶碗が転がり、釜の蓋がずれる）。火は寺の燃え広がりに任せる
function teaTopple(rt) {
  const g = rt.flags.zenyaTea, t = g?.userData.tip;
  rt.uninteract?.('zenya-dogu');
  if (!t) return;
  t.chawan.rotation.z = Math.PI / 2; t.chawan.position.y = 0.065; t.chawan.position.x += 0.08;
  t.chawan2.rotation.x = Math.PI / 2; t.chawan2.position.y = 0.065;
  t.chaire.rotation.z = 1.4; t.chaire.position.y = 0.045;
  t.lid.position.set(0.14, 0.03, 0.2); t.lid.rotation.x = 0.3;
}

// 要件20：寝床に仰向けになった目（枕の上）から天井を見上げる。一秒かけて肩越しのカメラから移り、暗転（ended）で元のカメラへ戻す
function ceilingLook(rt, over) {
  const P = rt.player, up0 = P.updateCamera, t0 = rt.t;
  const y = groundAt(rt.world, BED.x, BED.z, P.u.pos.y);
  const eye = new THREE.Vector3(BED.x - 1.95, y + 1.0, BED.z), aim = new THREE.Vector3(BED.x + 3.2, y + 2.5, BED.z); // 足の方の欄間と天井の境を見上げる（真上だけだと黒い板一面で部屋と分からない）
  rt.flags.k15at = { at: () => BED, r: 0.01 }; // 寝床の輪を天井の画に残さない（行き先は寝床のまま）
  const body = P.u.mesh; // 目は頭の中に入るので、見上げる間は自分の体を描かない
  const from = new THREE.Vector3(), look = new THREE.Vector3(), fwd = new THREE.Vector3();
  P.updateCamera = function (dt, camera) {
    if (over() || rt.flags.k15stage !== 'zenya') { P.updateCamera = up0; if (body) body.visible = true; return up0.call(this, dt, camera); }
    up0.call(this, dt, camera);
    const k = Math.min(1, Math.max(0, (rt.t - t0 - 0.6) / 1.2)), e = k * k * (3 - 2 * k);
    if (e <= 0) return;
    if (body) body.visible = e < 0.5;
    camera.getWorldDirection(fwd); from.copy(camera.position); look.copy(from).add(fwd);
    camera.position.lerpVectors(from, eye, e);
    look.lerp(aim, e); camera.lookAt(look);
  };
}

// 控えの間の寝床（敷布団・掛け布団・枕。基本形）。頭は西、足は東（本人は東を向いて仰向けに倒れる）
function futon(rt) {
  const T = THREE;
  if (rt.flags.zenyaFuton) return;
  const y = groundAt(rt.world, BED.x, BED.z, rt.player.u.pos.y);
  const grp = new T.Group(); grp.name = '前夜の寝床';
  const shiki = new T.Mesh(new T.BoxGeometry(2.0, 0.08, 0.95), new T.MeshStandardMaterial({ color: 0xd9d0bc, roughness: 0.95 }));
  shiki.position.set(-0.75, 0.04, 0);
  const kake = new T.Mesh(new T.BoxGeometry(1.25, 0.1, 1.0), new T.MeshStandardMaterial({ color: 0x3e4a5c, roughness: 0.9 }));
  kake.position.set(-0.2, 0.12, 0); kake.rotation.z = 0.02;
  const makura = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.42, 10), new T.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.8 }));
  makura.rotation.x = Math.PI / 2; makura.position.set(-1.6, 0.17, 0);
  grp.add(shiki, kake, makura);
  grp.position.set(BED.x, y, BED.z);
  rt.scene.add(grp);
  rt.flags.zenyaFuton = grp;
}

function start(rt, done) {
  const F = rt.flags, P = rt.player;
  F.k15stage = 'zenya'; F.k15on = true; F.beforeWar = true;
  eveLookStart(rt);
  const stop = () => F.k15stage !== 'zenya' || F.ending || !P.u.alive;
  hideFoes(rt, true);
  // 後から出来た物（遅れて着いた兵・持ち替えた刀）も、前夜の間は四半秒ごとに隠し続ける
  const quiet = () => { if (!F.beforeWar || rt.over) return; if (!(rt.t < (F.zenyaWarmUntil || 0))) hideFoes(rt, true); lampFollow(rt); rt.after(0.25, quiet, true); };
  rt.after(0.25, quiet, true);
  teaSet(rt);
  andons(rt);
  lamps(rt);
  // 信長は上座に座る（棒立ちで待たない＝要件13）。蘭丸は茶釜の脇に控える
  const nbG = F.nbG, nb = F.nb, kosho = F.kosho;
  const nbAnchor = nbG && { ...nbG.anchor }, nbFace = nbG?.facing, koAnchor = kosho && { ...kosho.anchor }, koFace = kosho?.facing;
  // 11/20 K443：上様の組は aggro が 0 でないと座の印が毎コマ外れ（units.js の陣中）、茶席で立っていた。前夜の間は 0 にして戦の朝に戻す
  if (nbG && nb?.alive) { nbG.aggro0 = nbG.aggro; nbG.aggro = 0; nbG.anchor = { x: NB_SEAT.x, z: NB_SEAT.z }; nbG.facing = Math.PI; put(rt, nb, NB_SEAT.x, NB_SEAT.z, Math.PI); nb.jinchu = AGURA(); }
  if (kosho) {
    kosho.anchor = { x: KAMA.x + 1.2, z: KAMA.z - 0.6 }; kosho.facing = -Math.PI / 2;
    const ran = F.ran; if (ran?.alive) { put(rt, ran, KAMA.x + 1.2, KAMA.z - 0.6, -Math.PI / 2); ran.jinchu = SIT(); }
    // ほかの小姓は廊下の口と次の間で立ち働く（座らせない）
    // 11/20 K413：小姓は立ち働かず、広間の西の壁ぎわに控えて座る（本人の後ろで立ち歩き、カメラが一・二m まで寄せられていた）
    kosho.units.forEach((u, i) => { if (u !== F.ran && u.alive) { put(rt, u, -56.3, 85.4 + i * 1.05, Math.PI / 2); u.jinchu = SIT(); } });
    kosho.noAI = true; kosho.aggro0 = kosho.aggro; kosho.aggro = 0;   // 動き回らず座ったまま（aggro が 0 でないと座の印が外れる）
  }
  const guests = GUESTS.map(([name, at, face, c]) => {
    const g = evPerson(rt, 0, name, at, face, { calm: true, mortal: true, g: { noRetinue: true, noAI: true, hideFlags: true }, u: { kosode: 1, honnoCloth: true, weapon: 'none', kosodeCol: c.kosodeCol, obi: c.obi, flag: null, horse: false } });
    for (const u of g.units) { u.jinchu = SIT(); u.invuln = true; put(rt, u, at.x, at.z, face); }
    return g;
  });
  moveMe(rt, ME_IN.x, ME_IN.z, 0);
  rt.banner('天正十年六月一日　夜', '京の本能寺。上様の茶席に客が集う');
  rt.obj('main', '茶席の下座に座れ', 'main', true);

  let ended = false, seated = false;
  const end = F.zenyaEnd = (skipped) => {
    if (ended) return; ended = true; F.zenyaEnd = null;
    rt.unmark('zenya'); F.k15at = null;
    F.nohSkip?.(); F.nohOff?.(); F.nohOff = null;   // 能の途中でも役者と篝火を片付ける
    // 11/19 kaito「急に画面全体の色が変わる」：画面を一コマで消さず、黒へゆっくり落とし、黒の間に元へ戻す（客は帰り、信長と小姓は居室へ、本人は寝床）
    //   要件21：黒の間は静か→遠くで鉄砲一つ→間→明けて目が覚める（もう一つ）。黒の真ん中に時刻（kaito「何分（何時間）後という表記」）
    k15Dark(rt, () => {
      eveSound(null);   // 黒の間は静か（遠くの鉄砲だけ）
      nohStageClear(rt);   // K421：戦の朝には能舞台を残さない
      for (const g of guests) evRemove(rt, g);
      if (nbG && nbG.aggro0 != null) { nbG.aggro = nbG.aggro0; nbG.aggro0 = null; }
      if (nb?.alive) { delete nb.jinchu; if (nbAnchor) { nbG.anchor = nbAnchor; nbG.facing = nbFace; put(rt, nb, nbAnchor.x, nbAnchor.z, nbFace); } }
      if (kosho) { kosho.noAI = false; if (kosho.aggro0 != null) kosho.aggro = kosho.aggro0; for (const k of kosho.units) delete k.jinchu; if (F.ran) delete F.ran.jinchu; if (koAnchor) { kosho.anchor = koAnchor; kosho.facing = koFace; } kosho.units.forEach((u) => { if (u.alive) put(rt, u, koAnchor.x + (Math.random() - 0.5) * 2, koAnchor.z + (Math.random() - 0.5) * 2); }); }
      delete P.u.jinchu;
      moveMe(rt, BED.x, BED.z, Math.PI / 2, '寝所へ下がる');
      rt.objDone('main');
      if (!skipped) rt.after(1.2, () => sfx('gun', 0.18), true);
      // 11/21 k365-cloud-18（携帯の作りで目覚めの一コマが八秒・K481）：明けてから明智の兵を初めて見せ、御殿の近臣を作ると、
      //   描き方の組み立て（getProgramParameter 三秒余り）がその場で起き、明けた画が固まった。黒の間（明ける二秒余り前）に兵を戻し、次の段（静かな本能寺）を始めて、組み立てを黒の中で済ませる
      rt.after(0.4, () => {
        if (rt.over || F.beforeWar === false) return;
        F.beforeWar = false; hideFoes(rt, false); done();
        // 静かな本能寺の始めに作る近臣（人の形の足袋・人のまとめ描き）の描き方も、黒の中で組んでおく（明け始めに一つずつ組まれていた）
        rt.after(0.5, () => { const R = rt.game?.renderer; try { if (R?.compile && rt.camera) R.compile(rt.scene, rt.camera); } catch (e) { /* 組めなくても進む */ } }, true);
      }, true);
    }, {
      // K418：黒の字は「数刻のち・未明」。明け方と出してすぐ「夜明け前」「東の空が白み始めた」と続き、時が戻って見えた
      time: '数刻のち　六月二日 未明', out: skipped ? 0.7 : 1.4, hold: skipped ? 1.2 : 2.6, in: 1.2,
      after: () => {
        // 目が覚めてから初めて戦の物を戻す（ここで前夜の印を下ろし、明智の兵を立て始める）
        if (F.beforeWar !== false) { F.beforeWar = false; hideFoes(rt, false); }
        // K418：明けた途端に立っていると、寝ていた所から飛んだように見えた。二発目の鉄砲を寝床で聞き、一拍おいて身を起こす
        sfx('gun', skipped ? 0.2 : 0.3);
        rt.after(skipped ? 0.4 : 1.3, () => { P.u.lieWant = 0; }, true);
      },
    });
  };
  // 歩いて座る（座る印は字でなく座の場所のピン）。来なければ二十五秒で座らせる
  F.k15at = { at: () => ME_SEAT, r: 1.2 };
  rt.marker('zenya', () => ME_SEAT, '茶席', { h: 1.2 });
  let waitT = 0;
  const seatTick = () => {
    if (stop() || ended || seated) return;
    const me = P.u.pos;
    waitT += 0.5;
    // 11/19 kaito「座り方わからない」：ピンの座の 2.2m 内に来るか、六秒たてば座らせる（座る操作は無い。歩いて近づくだけ）
    if (Math.hypot(me.x - ME_SEAT.x, me.z - ME_SEAT.z) < 2.2 || waitT > 6) { seated = true; sit(); return; }
    rt.after(0.5, seatTick, true);
  };
  rt.after(0.5, seatTick, true);

  const sit = () => {
    rt.unmark('zenya'); F.k15at = { at: () => ME_SEAT, r: 0.6 };
    if (Math.hypot(P.u.pos.x - ME_SEAT.x, P.u.pos.z - ME_SEAT.z) > 1.3) moveMe(rt, ME_SEAT.x, ME_SEAT.z, 0);
    P.u.jinchu = SIT();   // 動かずにいる間は座る（歩き出せば立つ）
    rt.objDone('main');
    eveSound('tea');   // cloud-28：茶席の間は釜の湯の松風と茶碗の触れる音
    const talk = [
      [1.2, () => rt.say('織田信長', '宗室、よう来た。博多の楢柴は、まだ手放さぬか', 3.6)],
      [3.8, () => rt.say('島井宗室', '……楢柴ばかりは、お許しを', 3)],
      [3.2, () => rt.say('織田信長', 'はっはっは。ならば、わしの道具をとくと見て帰れ', 3.4)],
      [3.6, () => rt.say('森蘭丸', '上様、一服お点てしました', 2.6)],
      [3, () => rt.say('勧修寺晴豊', '暦のことは、また内裏にて', 3)],
      [3.2, () => rt.say('織田信長', '明日は中国へ下る。猿めの顔を見に行くわ', 3.4)],
      [3.6, () => rt.say('織田信長', '宗室、帰る前に一番観てゆけ。中庭に舞台を設けさせた', 3.4)],
    ];
    const night = [
      [1.6, () => { rt.say('日衍', '夜も更けてまいりました。灯を落としましょう', 3); andonsOut(rt); eveSound('night'); }],   // cloud-28：夜更けは虫の声と遠い犬
      [3.2, () => {
        rt.banner('夜が更け、客は帰っていった', '');
        for (const g of guests) { g.noAI = false; g.order = 'hold'; g.anchor = { x: -52, z: 78 }; for (const u of g.units) delete u.jinchu; }
        // 11/20 K413（kaito「茶会で信長が立っている」）：「上様のおそばに控えよ」で控えた途端に上様が立って縁へ歩き、座が崩れて見えた。
        //   上様は客を見送る間も上座に胡坐のまま。立って縁へ出るのは、本人が寝床へ向かう時（下の段）にする
        rt.say('森蘭丸', '寝所の支度を。戸を閉めよ', 2.6);
        futon(rt);
      }],
      [3.4, () => {
        if (nb?.alive) rt.say('織田信長', '……静かな夜じゃ。蘭丸、灯を一つ残しておけ', 3.2);
      }],
      [3.4, () => {
        for (const g of guests) evRemove(rt, g);
        delete P.u.jinchu;
        // 要件13：本人が寝床へ立つ時に、上様も立ち上がって広間の前の縁へ出て中庭を見る（座ったまま待つ NPC にしない）
        if (nbG && nb?.alive) { delete nb.jinchu; nbG.anchor = { x: ENGAWA.x, z: ENGAWA.z }; nbG.facing = Math.PI; }
        // 要件20：自分で寝床へ行く。印は寝床の上。来なければ二十秒で休ませる
        rt.obj('main', '寝床で休め', 'main', true);
        rt.marker('zenya', () => BED, '寝床', { h: 1.2 });
        F.k15at = { at: () => BED, r: 1.2 };
        let bt = 0;
        const bedTick = () => {
          if (stop() || ended) return;
          bt += 0.5;
          const me = P.u.pos;
          if (Math.hypot(me.x - BED.x, me.z - BED.z) < 1.4 || bt > 20) {
            rt.unmark('zenya'); F.k15at = { at: () => BED, r: 0.6 };
            // 要件20：すぐ暗くしない。寝床に仰向けに横になり、夜回りの拍子木と虫の声を数秒聞いてから暗転
            put(rt, P.u, BED.x, BED.z, Math.PI / 2); P.yaw = Math.PI / 2;
            P.u.lieWant = 1;
            rt.after(2.2, () => { if (!ended) sfx('hyoshigi', 0.12); }, true);
            rt.after(3.4, () => { if (!ended) sfx('hyoshigi', 0.09); }, true);
            // 11/21 k365-cloud-18 要件20「横になる→天井→外の虫・夜風→数秒→暗転」：横になった目で天井を見上げ、夜風を一つ聞かせてから暗転
            ceilingLook(rt, () => ended);
            rt.after(3.9, () => { if (!ended) sfx('wind', 0.22); }, true);
            rt.after(6, () => end(false), true);
            return;
          }
          rt.after(0.5, bedTick, true);
        };
        rt.after(0.5, bedTick, true);
      }],
    ];
    k15Scenes(rt, talk, () => noh(() => k15Scenes(rt, night, null, stop)), stop);
  };

  // 要件15〜18：中庭の仮の舞台で能を一番（再構成）。暗い間に皆を観る座へ移し、終われば広間の座へ戻す
  const seats = (where) => {
    const inNoh = where === 'noh';
    const nbAt = inNoh ? NOH_SEATS.nb : NB_SEAT, nbFace = Math.PI;
    if (nbG && nb?.alive) { nbG.anchor = { x: nbAt.x, z: nbAt.z }; nbG.facing = nbFace; put(rt, nb, nbAt.x, nbAt.z, nbFace); nb.jinchu = AGURA(); }
    const ran = F.ran, ranAt = inNoh ? NOH_SEATS.ran : { x: KAMA.x + 1.2, z: KAMA.z - 0.6 }, ranFace = inNoh ? Math.PI : -Math.PI / 2;
    if (kosho) { kosho.anchor = { ...ranAt }; kosho.facing = ranFace; }
    if (ran?.alive) { put(rt, ran, ranAt.x, ranAt.z, ranFace); ran.jinchu = SIT(); }
    guests.forEach((g, i) => {
      const at = inNoh ? NOH_SEATS.guests[i] : GUESTS[i][1], face = inNoh ? Math.PI : GUESTS[i][2];
      g.anchor = { x: at.x, z: at.z };
      for (const u of g.units) { put(rt, u, at.x, at.z, face); u.jinchu = SIT(); }
    });
    const me = inNoh ? NOH_SEATS.me : ME_SEAT, meFace = inNoh ? Math.PI : 0;
    moveMe(rt, me.x, me.z, meFace); P.u.jinchu = SIT();
    F.k15at = { at: () => me, r: 0.6 };
  };
  const noh = (next) => {
    let stage = null;
    // 11/19 kaito：時が飛ぶ所は黒へなめらかに落とし、黒の間に時刻を出す（茶席→能は「一刻のち」・能→広間は「夜が更けて」）
    k15Dark(rt, () => { if (stop() || ended) return; warmFoes(rt); stage = nohStage(rt); F.nohOff = stage.off; seats('noh'); rt.obj('main', '能を観る', 'main', true); }, {
      time: '一刻のち', title: '中庭の舞台', sub: '能を一番。篝火の下に囃子が並ぶ',
      after: () => {
        if (stop() || ended || !stage) return;
        eveSound(null);   // 能の間は囃子だけ（釜の音は止める）
        playNoh(rt, stage, () => stop() || ended, () => {
          if (stop() || ended) return;
          k15Dark(rt, () => { stage.off(); F.nohOff = null; seats('hall'); rt.obj('main', '上様のおそばに控えよ', 'main', true); }, { time: '夜が更けて', after: () => { if (!stop() && !ended) next(); } });
        });
      },
    });
  };
}
