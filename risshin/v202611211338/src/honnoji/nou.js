// ======================================================================
// 本能寺の変　章0 前夜の能（docs/specs/honnoji_eve_req_1118.md 要件15〜18・P1・kaito_now 2・11/19 クラウドす）
// 六月一日の夜に本能寺で能があったとは確かめられない＝「歴史文化の再構成」（NG-11）。短い一番を中庭の仮の舞台で。
// 本人は観客として座る。信長も客も座って観る。囃子（笛・小鼓・大鼓・太鼓）と地謡、シテはすり足で舞う。七十秒ほど。飛ばせる。
// 翌朝との対比（要件18）：前夜の笛・鼓・謡・静かな拍手／翌朝の法螺・鉄砲・叫び・火。
// 舞台は翌朝も同じ所に残す（NG-09）。篝火と毛氈だけ片付ける。中庭の道（x −50〜−52）と渡り廊下（x −68）を塞がない。
// 舞台・柱・屋根・鏡板は基本形（鏡板の松はキャンバスで描く）。
// ======================================================================
import { evPerson, evRemove } from '../b_ev6.js';
import { groundAt, addDeck, FL } from '../floors.js';
import { kagaribi } from '../props.js';
import { sfx } from '../audio.js';
import * as THREE from 'three';

// 舞台の芯。正面は北（観る者は北に座り、南を向く）。本舞台は三間四方（5.9m）、床は 0.9m 上げる
const S = { x: -58, z: 62 }, HALF = 2.95, FLOOR = 0.9;
const BACK = { z0: S.z - HALF - 1.6, z1: S.z - HALF };            // 後座（囃子の座）
const JI = { x0: S.x + HALF, x1: S.x + HALF + 1.3 };              // 地謡座（観る者から見て右）
const HASHI = { x0: S.x - HALF - 4.6, x1: S.x - HALF, z: S.z - HALF - 0.8 };   // 橋掛り（観る者から見て左・奥）
// 観る座（南を向く）。上様が真ん中、客が左右、本人は下座の後ろ
export const NOH_SEATS = {
  // 11/20 K413：観る座を舞台へ二・五m 寄せた（本人の後ろが広間の軒に近く、後ろの目が本人の目の中まで畳まれ、座った本人が見えなかった）
  nb: { x: S.x, z: S.z + 7.1 },
  ran: { x: S.x - 1.6, z: S.z + 8.1 },
  me: { x: S.x + 0.6, z: S.z + 9.9 },
  guests: [{ x: S.x - 2.4, z: S.z + 6.7 }, { x: S.x + 2.4, z: S.z + 6.7 }, { x: S.x + 3.6, z: S.z + 7.9 }],
};
// K443（11/20 kaito「座り方がまだおかしい（茶会・能・控え）」）：ワキ・囃子・地謡は片膝の陣の膝つきになっていた→正座（humans_motion.js・army_move.js の seiza）
const SIT = () => ({ standing: false, t: 0, soldiers: [], seiza: true });

function pine() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#b89a62'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,60,30,${0.05 + Math.random() * 0.05})`; g.fillRect(0, Math.random() * 128, 256, 1); }   // 板目
  g.strokeStyle = '#4a3020'; g.lineCap = 'round';
  g.lineWidth = 9; g.beginPath(); g.moveTo(120, 128); g.bezierCurveTo(112, 96, 140, 78, 126, 46); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.moveTo(124, 70); g.quadraticCurveTo(80, 60, 44, 66); g.moveTo(128, 56); g.quadraticCurveTo(170, 40, 214, 50); g.moveTo(126, 46); g.lineTo(132, 22); g.stroke();
  g.fillStyle = '#2f4a2a';
  for (const [x, y, w] of [[44, 60, 34], [80, 54, 30], [180, 40, 40], [214, 46, 30], [132, 18, 34], [150, 34, 26], [100, 64, 22]]) {
    g.beginPath(); g.ellipse(x, y, w, w * 0.32, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// 舞台を建てる（一度だけ）。篝火と毛氈は返す物の off で片付ける。舞台そのものは夜明けの暗転で nohStageClear が片付ける（K421）
export function nohStage(rt) {
  const F = rt.flags, T = THREE, W = rt.world;
  const y0 = groundAt(W, S.x, S.z, 0), yF = y0 + FLOOR;
  if (!F.nohStage) {
    const grp = new T.Group(); grp.name = '前夜の能舞台';
    const hinoki = new T.MeshStandardMaterial({ color: 0xc9a774, roughness: 0.55 });
    const post = new T.MeshStandardMaterial({ color: 0xa88a5a, roughness: 0.6 });
    const bark = new T.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.95 });
    const dark = new T.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.9 });
    const box = (w, h, d, m, x, y, z) => { const b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; grp.add(b); return b; };
    // 本舞台・後座・地謡座・橋掛りの床（床下は暗い板で囲う）
    box(HALF * 2, 0.1, HALF * 2, hinoki, 0, FLOOR - 0.05, 0);
    box(HALF * 2 - 0.1, FLOOR - 0.1, HALF * 2 - 0.1, dark, 0, (FLOOR - 0.1) / 2, 0);
    box(HALF * 2, 0.1, 1.6, hinoki, 0, FLOOR - 0.05, -HALF - 0.8);
    box(HALF * 2, FLOOR - 0.1, 1.5, dark, 0, (FLOOR - 0.1) / 2, -HALF - 0.8);
    box(1.3, 0.1, HALF * 2, hinoki, HALF + 0.65, FLOOR - 0.05, 0);
    box(1.2, FLOOR - 0.1, HALF * 2 - 0.1, dark, HALF + 0.65, (FLOOR - 0.1) / 2, 0);
    box(4.6, 0.1, 2.0, hinoki, -HALF - 2.3, FLOOR - 0.05, -HALF - 0.8);
    box(4.6, FLOOR - 0.1, 1.9, dark, -HALF - 2.3, (FLOOR - 0.1) / 2, -HALF - 0.8);
    // 橋掛りの欄干と、前の白洲の小さな松三本
    for (const z of [-HALF - 1.75, -HALF + 0.15]) box(4.6, 0.06, 0.06, post, -HALF - 2.3, FLOOR + 0.55, z);
    for (let i = 0; i < 3; i++) {
      const px = -HALF - 1.0 - i * 1.5, pz = -HALF + 1.2;
      const tr = new T.Mesh(new T.CylinderGeometry(0.04, 0.06, 0.9, 6), bark); tr.position.set(px, 0.45, pz);
      const lf = new T.Mesh(new T.ConeGeometry(0.42, 0.55, 7), new T.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 0.9 })); lf.position.set(px, 1.0, pz);
      grp.add(tr, lf);
    }
    // 四本柱（シテ柱・目付柱・脇柱・笛柱）と屋根（入母屋に見える寄棟・檜皮の色）
    const H = 3.1;
    for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      const c = new T.Mesh(new T.BoxGeometry(0.22, H, 0.22), post); c.position.set(sx * (HALF - 0.11), FLOOR + H / 2, sz * (HALF - 0.11)); c.castShadow = true; grp.add(c);
    }
    for (const z of [HALF - 0.11, -HALF + 0.11]) box(HALF * 2 + 0.3, 0.22, 0.24, post, 0, FLOOR + H, z);
    for (const x of [HALF - 0.11, -HALF + 0.11]) box(0.24, 0.22, HALF * 2 + 0.3, post, x, FLOOR + H, 0);
    const roof = new T.Mesh(new T.ConeGeometry(HALF * 1.62, 1.7, 4, 1, true), bark);
    roof.rotation.y = Math.PI / 4; roof.position.set(0, FLOOR + H + 0.95, 0); roof.castShadow = true;
    roof.material = bark.clone(); roof.material.side = T.DoubleSide; grp.add(roof);
    // 鏡板（老松）
    const kagami = new T.Mesh(new T.PlaneGeometry(HALF * 2, H), new T.MeshStandardMaterial({ map: pine(), roughness: 0.8 }));
    kagami.position.set(0, FLOOR + H / 2, -HALF - 1.6); grp.add(kagami);
    box(HALF * 2, H, 0.08, dark, 0, FLOOR + H / 2, -HALF - 1.66);
    grp.position.set(S.x, y0, S.z);
    rt.scene.add(grp);
    F.nohStage = grp;
    // 床の当たり（上で人が立つ・座る）
    F.nohDecks = [
      addDeck({ x0: S.x - HALF, x1: S.x + HALF, z0: S.z - HALF, z1: S.z + HALF, y: yF, name: '能舞台' }),
      addDeck({ x0: S.x - HALF, x1: S.x + HALF, z0: BACK.z0, z1: BACK.z1, y: yF, name: '能舞台の後座' }),
      addDeck({ x0: JI.x0, x1: JI.x1, z0: S.z - HALF, z1: S.z + HALF, y: yF, name: '地謡座' }),
      addDeck({ x0: HASHI.x0, x1: HASHI.x1, z0: HASHI.z - 1, z1: HASHI.z + 1, y: yF, name: '橋掛り' }),
    ];
  }
  // 篝火二つ（舞台の前の両脇）と観る座の毛氈
  const extra = new THREE.Group(); extra.name = '能の篝火と毛氈';
  const fires = [];
  for (const kx of [S.x - HALF - 1.4, S.x + HALF + 2.0]) {
    const kz = S.z + HALF + 1.6;
    extra.add(kagaribi(W, kx, kz));
    try { fires.push(W.addFire(kx, kz, { h: 1.3, size: 0.55, smoke: false })); } catch (e) { /* 火を置けない時も続ける */ }
  }
  const red = new THREE.MeshStandardMaterial({ color: 0x8e1f1a, roughness: 0.95 });
  for (const [w, z] of [[7.6, NOH_SEATS.nb.z - 0.2], [8.8, NOH_SEATS.ran.z + 0.2], [3, NOH_SEATS.me.z]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 1.3), red);
    m.position.set(S.x + (z === NOH_SEATS.me.z ? 0.6 : 0.4), groundAt(W, S.x, z, 0) + 0.015, z); m.receiveShadow = true; extra.add(m);
  }
  rt.scene.add(extra);
  return { yF, off: () => { rt.scene.remove(extra); for (const f of fires) W.removeFire?.(f); } };
}

// K421（11/20 kaito「戦になっても本能寺の中に能舞台が残っている。戦では片付ける」）：
//   前夜の能は一夜の催し。夜明けの暗転の中で舞台と床の当たりを消す（床は id が並びの番号なので抜かず、どこにも当たらない形にする）
export function nohStageClear(rt) {
  const F = rt.flags;
  if (F.nohStage) {
    rt.scene.remove(F.nohStage);
    F.nohStage.traverse((o) => { o.geometry?.dispose?.(); if (o.material?.map) o.material.map.dispose(); o.material?.dispose?.(); });
    F.nohStage = null;
  }
  for (const id of F.nohDecks || []) { const d = FL.decks[id]; if (d && d.name && /能舞台|地謡座|橋掛り/.test(d.name)) { d.pad = -1e9; d.y = -1e3; } }
  F.nohDecks = null;
}

function place(rt, u, x, z, y, face) {
  if (!u?.alive) return;
  u.pos.set(x, groundAt(rt.world, x, z, y), z); u.mesh?.position.copy(u.pos);
  // 11/21 本能寺の持ち主 クラウド（act bot ★★「兵が一息で飛んだ」54秒 シテ (-61,58)→(-57,62)）：舞台の柱・橋掛りの欄干の線を跨ぐ一歩を
  //   兵の「跨いだら前の位置へ戻す」が毎コマ戻し、シテが橋掛りの端で十秒止まってから六m 跳んでいた。筋書きで置く者は前の位置を持たせない
  u._cpx = undefined;
  u.moveTo = null; u.target = null;
  if (face != null) { u.heading = face; u.facing = face; }
}

// 能面（白い小面）をシテの顔に付ける（頭の動きに付いて行く）
function mask(u) {
  if (!u?.head) return;
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: 0xf3ede2, roughness: 0.45 }));
  m.rotation.x = Math.PI / 2; m.scale.set(0.068, 0.04, 0.092); m.position.set(0, 1.625, 0.07);
  u.head.add(m);
}

// 能の一番を演じる。done は終わった時（飛ばした時も）に一度。stop が真になれば黙って止める
export function playNoh(rt, stage, stop, done) {
  const F = rt.flags, yF = stage.yF;
  const mk = (name, at, face, c, y) => {
    const g = evPerson(rt, 0, name, at, face, { calm: true, mortal: true, g: { noRetinue: true, noAI: true, hideFlags: true }, u: { kosode: 1, honnoCloth: true, kosodeCol: c[0], obi: c[1], flag: null, horse: false } });
    for (const u of g.units) { u.invuln = true; place(rt, u, at.x, at.z, y, face); }
    return g;
  };
  const cast = [];
  // シテ（金の唐織）。幕から橋掛りを渡って出る
  const shiteG = mk('シテ', { x: HASHI.x0 + 0.4, z: HASHI.z }, Math.PI / 2, [0xb08a3a, 0x7a2a22], yF + 0.1); cast.push(shiteG);
  const shite = shiteG.units[0]; mask(shite);
  // ワキ（脇座に座る）
  const wakiG = mk('ワキ', { x: S.x + HALF - 0.7, z: S.z + HALF - 0.8 }, -Math.PI / 2, [0x3a4456, 0x2a2a2a], yF + 0.1); cast.push(wakiG);
  // 囃子（後座：笛・小鼓・大鼓・太鼓。正面＝北を向いて座る）
  const hay = [];
  for (let i = 0; i < 4; i++) { const g = mk(['笛方', '小鼓方', '大鼓方', '太鼓方'][i], { x: S.x - 2.1 + i * 1.4, z: S.z - HALF - 0.75 }, 0, [0x2b2b30, 0x2b2b30], yF + 0.1); cast.push(g); hay.push(g); }
  // 地謡（地謡座。舞台の方＝西を向いて座る）
  for (let i = 0; i < 4; i++) cast.push(mk('地謡', { x: JI.x0 + 0.65, z: S.z - 1.8 + i * 1.2 }, -Math.PI / 2, [0x2b2b30, 0x2b2b30], yF + 0.1));
  for (const g of cast) for (const u of g.units) if (u !== shite) u.jinchu = SIT();

  let ended = false, t = 0;
  const finish = (skipped) => {
    if (ended) return; ended = true;
    F.nohSkip = null;
    for (const g of cast) evRemove(rt, g);
    done(skipped);
  };
  F.nohSkip = () => finish(true);
  // シテの道（すり足：ゆっくり滑る）。[x, z, 秒, 向き]。向きは正面（北）＝0
  const path = [
    [HASHI.x1 - 0.3, HASHI.z, 9, Math.PI / 2],            // 橋掛りを渡る
    [S.x - HALF + 0.7, S.z - HALF + 0.9, 3, Math.PI / 4],    // 常座
    [S.x - HALF + 0.7, S.z - HALF + 0.9, 3, 0],              // 正面を向いて止まる（謡）
    [S.x + HALF - 0.9, S.z + HALF - 0.9, 6, Math.PI / 4],    // 目付柱へ斜めに出る
    [S.x + HALF - 0.9, S.z + HALF - 0.9, 2.5, -Math.PI / 4], // 回る
    [S.x - HALF + 0.9, S.z + HALF - 0.9, 6, -Math.PI / 2],   // 正面の先を横切る
    [S.x - HALF + 0.9, S.z + HALF - 0.9, 2, Math.PI],        // 返す
    [S.x, S.z, 4, 0],                                         // 真ん中で正面へ
    [S.x, S.z, 4, Math.PI * 2],                               // その場で一回り（舞の頂き）
    [S.x - HALF + 0.7, S.z - HALF + 0.9, 5, -Math.PI * 0.75 + Math.PI * 2], // 常座へ戻る
    [S.x - HALF + 0.7, S.z - HALF + 0.9, 3, Math.PI * 2],    // 留め
    [HASHI.x0 + 0.4, HASHI.z, 10, -Math.PI / 2 + Math.PI * 2], // 橋掛りを去る
  ];
  let seg = 0, segT = 0, from = { x: shite.pos.x, z: shite.pos.z, h: shite.heading };
  const STEP = 0.05;
  const glide = () => {
    if (ended || stop()) return;
    if (seg >= path.length) return;
    const [x, z, dur, h] = path[seg];
    segT += STEP;
    const k = Math.min(1, segT / dur), e = k * k * (3 - 2 * k);
    if (shite.alive) {
      place(rt, shite, from.x + (x - from.x) * e, from.z + (z - from.z) * e, yF + 0.1, from.h + (h - from.h) * e);
    }
    if (k >= 1) { seg++; segT = 0; from = { x, z, h }; }
    rt.after(STEP, glide, true);
  };
  // 囃子と謡の拍（秒）：笛の序→鼓と掛け声→謡→舞（鼓が詰まる）→留め
  const beats = [];
  for (const s of [0.5, 2.8, 6.5]) beats.push([s, 'nohFue', 1]);
  for (let s = 4; s < 60; s += 2.4 - Math.min(1.1, s / 60)) { beats.push([s, 'kakegoe', 0.8]); beats.push([s + 0.35, 'kotsuzumi', 1]); if ((s | 0) % 3 === 0) beats.push([s + 0.9, 'otsuzumi', 1]); }
  for (const s of [13, 17, 21, 44, 48]) beats.push([s, 'utai', 1]);
  for (const s of [30, 33, 36, 39, 52, 56]) beats.push([s, 'nohFue', 0.9]);
  for (let s = 34; s < 42; s += 0.8) beats.push([s, 'otsuzumi', 0.7]);   // 舞の頂きの太鼓の刻み
  beats.push([60.5, 'otsuzumi', 1.1]); beats.push([61, 'nohFue', 1]);
  for (const [s, n, v] of beats) rt.after(s, () => { if (!ended && !stop()) sfx(n, v); }, true);
  rt.after(1.5, glide, true);
  // 終わり：シテが幕へ入り、静かな拍手。上様の一言
  rt.after(66, () => { if (ended || stop()) return; sfx('clapSoft', 1); rt.say('織田信長', '……見事じゃ', 2.6); }, true);
  rt.after(70, () => { if (!ended && !stop()) finish(false); }, true);
  return { get t() { return t; } };
}
