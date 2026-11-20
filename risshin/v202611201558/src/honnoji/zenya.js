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
import { sfx, playMusic, setEveHush } from '../audio.js';
import * as THREE from 'three';
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
    if (k15Off(r) || F.zenyaDone || F.shizukaDone || F.hp) { warOn(r); return p1.call(this, r); }
    if (F.k15stage === 'zenya') return;
    start(r, () => { F.zenyaDone = true; F.k15on = false; F.k15stage = null; F.k15at = null; warOn(r); p1.call(this, r); });
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
function moveMe(rt, x, z, face) {
  const P = rt.player, u = P.u, dx = x - u.pos.x, dz = z - u.pos.z;
  for (const q of rt.army.units) if (q.alive && !q.isPlayer && (q.group?.isPlayerSquad || (rt.tomoUnits || []).includes(q))) put(rt, q, q.pos.x + dx, q.pos.z + dz);
  put(rt, u, x, z, face);
  if (face != null) P.yaw = face;
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
// 戦の始まり：前の章の印を下ろし、開戦の法螺と陣太鼓（battle.js が quietOpen で止めていた）を鳴らす
function warOn(rt) {
  const F = rt.flags;
  if (F.warOnDone) return;
  F.warOnDone = true; F.beforeWar = false; setEveHush(false);
  teaTopple(rt);   // 前夜の太鼓止めを解いてから開戦の法螺と陣太鼓
  if (!rt.G?.lord) playMusic('prebattle');
}

// 茶釜・風炉・茶碗・茶入（基本形。翌朝も同じ所に残る＝要件55・56）
function teaSet(rt) {
  const T = THREE;
  if (rt.flags.zenyaTea) return;
  const y = groundAt(rt.world, KAMA.x, KAMA.z, rt.player.u.pos.y);
  const grp = new T.Group(); grp.name = '前夜の茶道具';
  const iron = new T.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.55, metalness: 0.45 });
  const clay = new T.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.85 });
  const glaze = new T.MeshStandardMaterial({ color: 0x1c1714, roughness: 0.35 });
  const ivory = new T.MeshStandardMaterial({ color: 0xcfc3a8, roughness: 0.6 });
  const furo = new T.Mesh(new T.CylinderGeometry(0.2, 0.17, 0.22, 14), clay); furo.position.set(0, 0.11, 0);
  const kama = new T.Mesh(new T.SphereGeometry(0.17, 14, 10), iron); kama.scale.y = 0.8; kama.position.set(0, 0.32, 0);
  const lid = new T.Mesh(new T.CylinderGeometry(0.07, 0.08, 0.02, 12), iron); lid.position.set(0, 0.45, 0);
  const chawan = new T.Mesh(new T.CylinderGeometry(0.065, 0.045, 0.07, 14), glaze); chawan.position.set(0.42, 0.035, -0.18);
  const chawan2 = chawan.clone(); chawan2.position.set(-0.55, 0.035, -0.45);
  const chaire = new T.Mesh(new T.SphereGeometry(0.045, 12, 8), glaze); chaire.scale.y = 1.3; chaire.position.set(0.3, 0.06, 0.12);
  const mizusashi = new T.Mesh(new T.CylinderGeometry(0.09, 0.08, 0.18, 12), ivory); mizusashi.position.set(-0.32, 0.09, 0.15);
  grp.add(furo, kama, lid, chawan, chawan2, chaire, mizusashi);
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
  const stop = () => F.k15stage !== 'zenya' || F.ending || !P.u.alive;
  hideFoes(rt, true);
  // 後から出来た物（遅れて着いた兵・持ち替えた刀）も、前夜の間は四半秒ごとに隠し続ける
  const quiet = () => { if (!F.beforeWar || rt.over) return; hideFoes(rt, true); rt.after(0.25, quiet, true); };
  rt.after(0.25, quiet, true);
  teaSet(rt);
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
      nohStageClear(rt);   // K421：戦の朝には能舞台を残さない
      for (const g of guests) evRemove(rt, g);
      if (nbG && nbG.aggro0 != null) { nbG.aggro = nbG.aggro0; nbG.aggro0 = null; }
      if (nb?.alive) { delete nb.jinchu; if (nbAnchor) { nbG.anchor = nbAnchor; nbG.facing = nbFace; put(rt, nb, nbAnchor.x, nbAnchor.z, nbFace); } }
      if (kosho) { kosho.noAI = false; if (kosho.aggro0 != null) kosho.aggro = kosho.aggro0; for (const k of kosho.units) delete k.jinchu; if (F.ran) delete F.ran.jinchu; if (koAnchor) { kosho.anchor = koAnchor; kosho.facing = koFace; } kosho.units.forEach((u) => { if (u.alive) put(rt, u, koAnchor.x + (Math.random() - 0.5) * 2, koAnchor.z + (Math.random() - 0.5) * 2); }); }
      delete P.u.jinchu;
      moveMe(rt, BED.x, BED.z, Math.PI / 2);
      rt.objDone('main');
      if (!skipped) rt.after(1.2, () => sfx('gun', 0.18), true);
    }, {
      // K418：黒の字は「数刻のち・未明」。明け方と出してすぐ「夜明け前」「東の空が白み始めた」と続き、時が戻って見えた
      time: '数刻のち　六月二日 未明', out: skipped ? 0.7 : 1.4, hold: skipped ? 1.2 : 2.6, in: 1.2,
      after: () => {
        // 目が覚めてから初めて戦の物を戻す（ここで前夜の印を下ろし、明智の兵を立て始める）
        F.beforeWar = false; hideFoes(rt, false);
        // K418：明けた途端に立っていると、寝ていた所から飛んだように見えた。二発目の鉄砲を寝床で聞き、一拍おいて身を起こす
        sfx('gun', skipped ? 0.2 : 0.3);
        rt.after(skipped ? 0.4 : 1.3, () => { P.u.lieWant = 0; }, true);
        if (!rt.over) done();
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
      [1.6, () => rt.say('日衍', '夜も更けてまいりました。灯を落としましょう', 3)],
      [3.2, () => {
        rt.banner('夜が更け、客は帰っていった', '');
        for (const g of guests) { g.noAI = false; g.order = 'hold'; g.anchor = { x: -52, z: 78 }; for (const u of g.units) delete u.jinchu; }
        // 要件13：信長も立ち上がり、広間の前の縁へ出て中庭を見る（座ったまま待つ NPC にしない）
        if (nbG && nb?.alive) { delete nb.jinchu; nbG.anchor = { x: ENGAWA.x, z: ENGAWA.z }; nbG.facing = Math.PI; }
        rt.say('森蘭丸', '寝所の支度を。戸を閉めよ', 2.6);
        futon(rt);
      }],
      [3.4, () => {
        if (nb?.alive) { nb.heading = nb.facing = Math.PI; rt.say('織田信長', '……静かな夜じゃ。蘭丸、灯を一つ残しておけ', 3.2); }
      }],
      [3.4, () => {
        for (const g of guests) evRemove(rt, g);
        delete P.u.jinchu;
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
            rt.after(5, () => end(false), true);
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
    k15Dark(rt, () => { if (stop() || ended) return; stage = nohStage(rt); F.nohOff = stage.off; seats('noh'); rt.obj('main', '能を観る', 'main', true); }, {
      time: '一刻のち', title: '中庭の舞台', sub: '能を一番。篝火の下に囃子が並ぶ',
      after: () => {
        if (stop() || ended || !stage) return;
        playNoh(rt, stage, () => stop() || ended, () => {
          if (stop() || ended) return;
          k15Dark(rt, () => { stage.off(); F.nohOff = null; seats('hall'); rt.obj('main', '上様のおそばに控えよ', 'main', true); }, { time: '夜が更けて', after: () => { if (!stop() && !ended) next(); } });
        });
      },
    });
  };
}
