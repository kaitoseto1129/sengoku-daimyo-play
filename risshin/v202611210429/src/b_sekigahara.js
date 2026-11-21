// ======================================================================
// 関ヶ原　関ヶ原の戦い（慶長五年九月十五日）
// 美濃の関ヶ原。西の山すそに西軍（石田・宇喜多・小西・大谷）、東の野に東軍。南の松尾山に小早川秀秋。
// 足軽は東軍・藤堂高虎の手。朝霧の中で大谷方（平塚為広・戸田勝成）と押し合い、
// 小早川の寝返りで大谷勢が崩れると西軍は総崩れ。最後に島津が敵中を突っ切って退く（島津の退き口）
// 向き：西が -x、北が -z。松尾山は南西（-x, +z）
// ======================================================================
import * as THREE from 'three';
import { nobori, jinmaku, tawara, palisade, kagaribiBatch, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx, enemyRush } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { depthStart, depthTick, rest, fight, hold, depthBot } from './b_depth.js';
import { mobHelp } from './mob_help.js';
import { encircleWarn } from './encircle_signal.js';   // P3 包囲の合図（K406）
import { timeslipField } from './timeslip_field.js';
import { isEn, addEn } from './i18n.js';
// K516 英語の時だけ関ヶ原の字の表を読む（日本語の時は読まない）
if (isEn()) import('./i18n_sekigahara.js').then((m) => addEn(m.default)).catch(() => {});

// 11/18 クラウドせ（renraku 314）：前は五点で松尾山の裾（z=100〜180・高さ12〜24m）を登り水が地面に埋まり、
//   ほかの所も幅 2.6 が地面の升目（約4.2m）より細く、溝が埋もれて水は 5〜17cm しか張らなかった。
//   点を増やして南は松尾山の西の低い谷へ寄せ、幅 4・深さ 1.0 で共通の溝切り（world.js）が効くようにした。
const FUJI = [[-66, -180], [-60, -130], [-60, -80], [-63, -30], [-68, 20], [-70, 60], [-78, 95], [-90, 125], [-100, 155], [-106, 180]];   // 藤古川
// 11/19 01:35 クラウド：新手は本人の東二十歩に出すが、そこが画面に入っている時（カメラを横や後ろへ回した時）は、
//   東の半分（北東〜南東）でカメラに写らない所を選んで出す（目の前に十一人が急に湧かないように・K153）
const _fr = new THREE.Frustum(), _fm = new THREE.Matrix4(), _fv = new THREE.Vector3();
function freshAt(rt, P) {
  const clamp = (x, z) => ({ x: Math.max(-40, Math.min(60, x)), z: Math.max(20, Math.min(100, z)) });
  const cam = rt.camera, base = clamp(P.x + 20, P.z + (P.z > 60 ? -6 : 6));
  if (!cam || !cam.projectionMatrix) return base;
  cam.updateMatrixWorld(); _fm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_fm);
  const seen = (p) => { const y = rt.world && rt.world.heightAt ? rt.world.heightAt(p.x, p.z) : 0; for (const h of [0.2, 1.7, 3.2]) { _fv.set(p.x, y + h, p.z); if (_fr.containsPoint(_fv)) return true; } return false; };
  if (!seen(base)) return base;
  for (const a of [0.6, -0.6, 1.1, -1.1, 1.5, -1.5]) for (const r of [20, 26]) {
    const p = clamp(P.x + Math.cos(a) * r, P.z + Math.sin(a) * r);
    if (Math.hypot(p.x - P.x, p.z - P.z) > 12 && !seen(p)) return p;
  }
  return base;
}
const TODO = { x: 18, z: 50 };          // 藤堂高虎の手（はじめの持ち場）
const FRONT = { x: -16, z: 52 };        // 霧の中で押し出す先
const MATSUO = { x: -40, z: 136 };      // 松尾山
const SHIMA_PATH = [{ x: -70, z: -24 }, { x: -24, z: 22 }, { x: 18, z: 62 }, { x: 70, z: 96 }, { x: 170, z: 120 }];   // 島津の退き口（伊勢街道へ）
const FOG_T0 = 30, FOG_T1 = 105;        // 霧の晴れはじめと晴れきり（秒）

// 西軍の家ごとの見た目（大谷方の旗は、豊臣の五七桐で代える）
const OTANI = { armor: 0x2c2a2a, lace: 0x6a5a3a, flag: 'otani' };
const SHIMAZU = { armor: 0x1e1c1c, lace: 0x3a3a3a, flag: 'shimazu' };
const KOBA = { armor: 0x2a2622, lace: 0x5a3a2a, flag: 'kobayakawa' };
const TODO_LK = { flag: 'todo' };
const II = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'ii' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || g.count === 0 || g.routed;
// 11/19 03:05 クラウド 持ち主：西の山へ退く大谷方は (-112,z)・(-96,z) に着いた所で消していたが、本人が西へ追っていると六十歩ほどでカメラに写って消えた（K153）。
//   着いた時に本人が九十歩の内なら、さらに西へ二十五歩ずつ退かせ（x=-150 まで）、離れてから消す
const offStage = (rt, gg) => {
  const P = rt.player.u.pos, c = gg.center();
  if (c && gg.dest && gg.dest.x > -150 && Math.hypot(c.x - P.x, c.z - P.z) < 90) {
    gg.order = 'move'; gg.dest = { x: Math.max(-150, gg.dest.x - 25), z: gg.dest.z }; gg.onArrive = (g2) => offStage(rt, g2); return;
  }
  for (const u of gg.units) if (u.alive) rt.army.despawn(u);
};
// 西軍の鉄砲は、当たれば痛いが一発では倒れない強さに（霧の中で一人の足軽が撃ち抜かれて終わらないように）
const soften = (g) => { for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.4; return g; };
const lerp = (a, b, t) => a + (b - a) * t;
// 11/18 クラウド 持ち主：act bot の段ごとの討ち取りが 霧0・押し合い17・寝返り0・崩れ0・島津0（09:25）。寝返りの段と島津の段は、
//   本人の前の大谷方・島津の殿が旗の下に留まり、本人のそばで斬り合う相手が居なかった。本人の西（敵の側）から、本人へ斬りかかる小さな組を出す
//   （寝返りの段＝小早川に横を突かれ逃げ場を失って藤堂の手へなだれ込む大谷の兵／島津の段＝東軍の中を突っ切る島津の先駆け。どちらも史実の動き）
function rushAt(rt, name, off, lk, list) {
  const P = rt.player && rt.player.u;
  if (!P || !P.alive || rt.flags.ending) return null;
  const from = { x: P.pos.x + off.x, z: P.pos.z + off.z };
  const g = enemyGroup(rt, { faction: lk.flag === 'shimazu' ? 'shimazu' : 'otani', name, anchor: from, facing: Math.atan2(-off.x, -off.z), aggro: 16, width: 8, speed: 3.4, dmgMult: 0.6 }, dress(list, lk));
  g.order = 'attack'; g.seekRange = 45; g.anchor = { x: P.pos.x, z: P.pos.z };
  // 11/18 16:50 クラウド 持ち主：的を付けないと組は周りの藤堂の兵とぶつかって本人まで来なかった（寝返り・崩れ・島津の段の討ち取りが毎回0）。
  //   本人を的にする。本人の命が六割を切ったら的を外す（update。根白坂・樫井の huntPlayer と同じ放し方）
  g.focus = P;
  // 11/18 17:40 クラウド 持ち主：組は本人の9〜17m まで来ても、三歩半の内の藤堂の兵に先に応戦して本人の五m 内に入らなかった（描かずの見張り）。
  //   本人が十歩の内なら、手前の兵より本人へ打ち込む（田野・道明寺の focusMeFirst と同じ。数・傷の重さは同じ・命六割で放すのも同じ）
  g.focusMeFirst = true; g.focusMeRange = 10;
  // 11/18 クラウド 持ち主：組が一つの塊で着くと、本人の四歩半の内に三人が一度に入り、act bot は退いて構えるだけ（寝返りの段の討ち取り 0/0/0）。
  //   逃げ場を失ってなだれ込む兵は列が伸びて二人ずつ着く形にする（後ろの者ほど四歩半ずつ遠くから。数・傷の重さは同じ）
  const ol = Math.hypot(off.x, off.z) || 1;
  g.units.forEach((u, i) => { const k = Math.floor(i / 2) * 4.5; u.pos.x += off.x / ol * k; u.pos.z += off.z / ol * k; });
  soften(g);
  g._rushOtani = lk.flag !== 'shimazu';
  (rt.flags.rush || (rt.flags.rush = [])).push(g);
  return g;
}
// 四方輿：四方に柱を立て、簾を巻き上げた屋形の輿。二本の長柄。地に下ろした形（徳川編の関ヶ原と同じ作り）
let KOSHI_MAT = null;
function koshi(world, x, z, rot) {
  const M = KOSHI_MAT || (KOSHI_MAT = { wood: new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8 }), lac: new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 0.45 }), su: new THREE.MeshStandardMaterial({ color: 0x8a7a52, roughness: 0.95 }) });
  const g = new THREE.Group();
  const box = (w, h, d, px, py, pz, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); g.add(o); return o; };
  box(1.2, 0.1, 1.4, 0, 0.08, 0, M.lac);
  for (const sx of [-0.56, 0.56]) for (const sz of [-0.66, 0.66]) box(0.07, 1.6, 0.07, sx, 0.9, sz, M.lac);
  box(1.45, 0.1, 1.7, 0, 1.72, 0, M.lac); box(1.1, 0.1, 1.35, 0, 1.82, 0, M.lac);
  for (const sz of [-0.66, 0.66]) box(1.1, 0.12, 0.12, 0, 1.6, sz, M.su);
  box(1.1, 0.2, 0.05, 0, 0.28, -0.68, M.wood); box(0.05, 0.2, 1.3, -0.58, 0.28, 0, M.wood); box(0.05, 0.2, 1.3, 0.58, 0.28, 0, M.wood);
  for (const sx of [-0.68, 0.68]) box(0.08, 0.08, 4.6, sx, 0.2, 0, M.wood);
  g.position.set(x, world.heightAt(x, z), z); g.rotation.y = rot;
  return g;
}
const MIST = { r: 0.8, g: 0.82, b: 0.81 };   // 朝霧の色

// 軽い大軍の合戦（world.addClash）を置く。音と硝煙は戦の側のもの。A・B に team と faction を渡すと、プレイヤーが寄った所は本物の兵に替わる
// 待ちの間の大軍どうし（clash）を黙らせる・戻す（K491：開戦の前に鉄砲・矢・打ち合いの音を鳴らさない）
function hush(c, q) {
  if (!c || !c.o) return;
  for (const S of [c.o.A, c.o.B]) {
    if (!S) continue;
    if (q) { S._g = S.guns; S._b = S.bows; S.guns = false; S.bows = false; } else if ('_g' in S) { S.guns = S._g; S.bows = S._b; }
  }
  c.o.soundDelay = q ? 1e6 : undefined; c.o.shoutDelay = q ? 1e6 : undefined;
  if (c.fx) { c.fx.snd = q ? 1e6 : 1; c.fx.shout = q ? 1e6 : 3; c.fx.gun = q ? 1e6 : 5; c.fx.bow = q ? 1e6 : 7; }
}

export function clash(rt, o) {
  return rt.world.addClash({ rt, play: (k, p, v) => rt.army.play(k, p, v), smoke: (x, y, z, fx, fz) => rt.army.smoke(x, y, z, fx, fz), ...o });
}

// 一斉射：味方の鉄砲組（guns。isGun の組）を込めたまま待たせ、敵の隊（foe）が r まで寄ったら「放て」で一度に撃たせる。
// 撃った時に敵の気（morale）を hit だけ落とし、崩れやすくする。clash を渡すとその軽い大軍も撃つ。update で毎コマ volleyTick を呼ぶ
export function volleyTick(rt, dt, V) {
  if (!V || V.st === 2) return;
  const guns = V.guns().filter((g) => g && g.count && !g.routed);
  const foe = V.foe();
  if (!guns.length || !foe || !foe.count || foe.routed) { for (const g of guns) g.holdFire = false; if (V.st === 1) V.st = 2; return; }
  if (!V.st) { V.st = 1; V.t = 0; for (const g of guns) g.holdFire = true; if (V.wait) rt.say(V.who, V.wait, 2.5); }
  V.t += dt;
  const a = guns[0].center();
  let d = Infinity;
  for (const u of foe.units) if (u.alive) d = Math.min(d, Math.hypot(u.pos.x - a.x, u.pos.z - a.z));
  if (d > (V.r || 30) && V.t < (V.max || 50)) return;
  V.st = 2;
  for (const g of guns) g.holdFire = false;
  rt.say(V.who, V.line || '引きつけた……放てぇっ！', 2);
  rt.banner('一斉射', V.sub || '敵の前が崩れる');
  rt.army.play('volley', a, 1.5);
  if (V.clash) V.clash.volley(V.side || 'A');
  foe.morale = Math.max(0, foe.morale - (V.hit || 30));
  if (V.then) rt.after(1.5, () => V.then(rt));
}

const sekigahara = {
  resumeSteps: [[1, 'open'], [2, 'turn'], [3, 'collapse']],   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを、段の関数を順に流して作り直す
  // 敵の打ち込みの重さ（bot が楽に勝ちすぎたので締める。player.js の takeDamage）
  foeHit: 1.0,   // 11/10：突っ込む遊び手が大谷勢の押し返しで毎回倒れたので 1.1 → 1.0（西軍の強さは数と押し返しで見せる）
  // 11/10 夜：大谷勢の騎馬（bhelp.js の horseList が敵の組に足す）の一太刀が重く、歴史好きの遊び手も段A で三太刀で倒れた。騎馬の上限の傷も一緒に軽くする
  playerTaken: 0.6,
  heroAssist: true,   // 11/18 21:30 クラウド持ち主：押し合いの段は藤堂の兵と肩を並べて槍を入れる。本人が命の四分の一を削った兵は、味方がとどめでも本人の手柄（battle.js onKill・今福と同じ。突き53で討ち取り10＝一人に五太刀だった）
  spawn: { x: TODO.x + 4, z: TODO.z + 3, heading: -Math.PI / 2 },
  moveLim: 260,   // 11/15 K338：天王寺の出来へ。兵の歩ける枠を 176→260（道は ±178 まで延びていた。地面は 300）
  // K338：伝令の騎馬が東軍の陣（藤堂の手・押し出す先・後ろの道）を巡る（天王寺と同じ courierPath）
  courierPath: [[TODO.x + 10, TODO.z + 14], [TODO.x + 30, TODO.z - 4], [FRONT.x + 14, FRONT.z + 20], [FRONT.x - 6, FRONT.z + 34], [TODO.x + 10, TODO.z + 14]],
  courierN: 3,
  // 11/18 クラウド 持ち主：描かずの通しで、命は満ちたまま息が切れて退く（playbot survive の tired）が続き、退く足で持ち場から40〜100m 離れていた
  //   （戸田の横・大谷勢の前進の〔失〕と、霧の中で藤堂の旗を離れた〔失〕）。守る段と霧の間は、持ち場の外へ遠ざかる退きの一歩を取らない
  //   （近づく一歩・内の一歩は今のまま。命が三割半を切ったら縛らない。人も旗の下で息を整える）
  // 11/21 10:30 クラウド 持ち主：act bot（0829・0832）で任務達成（722・726秒）の後に空馬へ四〜六回手綱を掛けて「馬に乗れなかった★★」。
  //   締めの間は馬を取りに行かない（有岡と同じ）
  botMountAllowed: (b) => !b.flags.ending && !b.over,
  botRetreatStepAllowed(b, step) {
    const u = b.player && b.player.u; if (!u || u.hp < u.maxHp * 0.35) return true;
    const F = b.flags, c = F.dp && F.dp.cur;
    let at = null, lim = 0;
    if (c && c.s.kind === 'hold' && c.at) { at = c.at; lim = (c.botRadius || 14) + 24; }
    else if (F.step >= 1 && F.fog > 0.25 && !F.strayed && F.todoU) { at = F.todoU.pos; lim = 18; }
    if (!at) return true;
    const ds = Math.hypot(step.x - at.x, step.z - at.z);
    return ds <= lim || ds < Math.hypot(u.pos.x - at.x, u.pos.z - at.z);
  },
  world: {
    seed: 160,
    groundHalf: 300, moveLim: 260,   // K338：本当の広さへ（天王寺と同じ枠）
    overheadViewFar: 900,   // K338：真上の布陣で地面の端が欠けない
    drawLow: true,   // K338：携帯の重さ（天王寺と同じ）
    noboriSam: true, noboriBand: 2, blockForm: true,   // K338：備ごとの幟の林と厚い四角の備（天王寺と同じ）
    time: 'day',
    mood: 'morning',   // 朝霧の中で始まった戦（朝の光）
    muddy: 0.45,   // 夜来の雨で足もとがぬかるむ
    paths: [[[178, 4], [90, 8], [30, 16], [-20, 14], [-70, 6], [-178, -4]], [[-20, 14], [-60, -60], [-100, -150]], [[20, 20], [60, 78], [110, 104], [178, 122]]],
    height(x, z) {
      let h = 0.6 * Math.sin(x * 0.03) * Math.cos(z * 0.03) + 0.4 * Math.sin(z * 0.05 + x * 0.03);
      // 松尾山（南西）・天満山・笹尾山（西）・南宮山（南東）・桃配山（東）
      h += 32 * gauss(x, z, MATSUO.x, MATSUO.z + 8, 2200) + 14 * gauss(x, z, -122, 8, 1400) + 18 * gauss(x, z, -122, -122, 1300);
      h += 30 * gauss(x, z, 160, 160, 3000) + 9 * gauss(x, z, 150, -6, 900);
      // まわりの山並み（盆地）
      h += Math.max(0, Math.abs(z) - 150) * 0.35 + Math.max(0, -x - 150) * 0.3;
      return h;
    },
    tint(x, z, h, c) {
      // 雨上がりの田は湿って黒ずむ
      if (Math.abs(x) < 70 && Math.abs(z) < 110) c.setRGB(c.r * 0.9, c.g * 0.92, c.b * 0.86);
      if (h > 8) c.setRGB(c.r * 0.85, c.g * 0.95, c.b * 0.85);
    },
    clear: (x, z) => Math.abs(x) < 80 && Math.abs(z) < 100,
    fieldStage: 'ripe',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (x < -50 || x > 90 || z < -90 || z > 96) return 0;
      if (Math.abs(z - 14) < 6) return 0;
      if ((Math.floor(x / 13) + Math.floor(z / 11)) % 3 === 1) return 0;
      const ex = Math.min(((x % 13) + 13) % 13, 13 - ((x % 13) + 13) % 13), ez = Math.min(((z % 11) + 11) % 11, 11 - ((z % 11) + 11) % 11);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.8;
    },
    streams: [{ pts: FUJI, w: 4, depth: 1.0 }],
    trees: 360,
    tufts: 4000,
    treeDensity: (x, z) => (Math.abs(x) > 90 || Math.abs(z) > 110 ? 1 : 0.2),
    groves: [{ x: MATSUO.x, z: MATSUO.z, r: 22, n: 40 }, { x: -100, z: 60, r: 12, n: 18 }, { x: 60, z: -60, r: 12, n: 16 }],
  },
  // 11/21 cloud-19（kaito_now③ 天王寺の出来に・120秒の画で足もとが刈った芝のように整っていた）：身の回りの当時の場（timeslip_field.js）。
  //   慶長五年九月十五日は今の十月下旬・前夜の雨で畠はぬかるむ。藤堂の持ち場と押し出す先ほど踏み荒らし、倒れた槍・旗が多い。川面には置かない（streams）
  timeslip: { wet: 0.55, dust: 0.2, trample: 0.4, debris: 1.2, arrows: 0.6, grass: 0x8c9658, grassTints: [0xffffff, 0xe0dcb0, 0xc0b888], grassH: 0.75, fights: [[TODO.x, TODO.z, 30], [FRONT.x, FRONT.z, 34]] },

  setup(rt) {
    const W = rt.world;
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗（def.timeslip）
    const F = rt.flags;
    F.step = 0;
    F.fog = 1;
    rt.army.heroAssistAll = true;   // 名無しの兵への本人の傷も数える（army_combat.js・def.heroAssist）
    // ---- 東軍：藤堂高虎の手（自分の持ち場）と、京極高知の手 ----
    // 11/19 クラウドさ（kaito_now 3「関ヶ原を天王寺の出来に・主人公が一人にならない」）：携帯で始まりの本人の60m内の本物が52人（天王寺179）。本人の周りの五つの手は 0.65×0.8 に削らず定義の数で立てる（fullStrength）
    const todo = allyGroup(rt, { faction: 'tokugawa', fullStrength: true, name: '藤堂高虎の手', anchor: { ...TODO }, facing: -Math.PI / 2, width: 14, aggro: 7, noRout: true, formation: 'yari', order: 'hold' },
      dress([{ type: 'samurai', n: 1, o: { name: '藤堂高虎', invuln: true, horse: true, hat: 'kabuto_t', haori: 0x3a2a1a } }, { type: 'ashigaru', n: 22 }, { type: 'gun', n: 4 }], TODO_LK));
    todo.defMult = 1.3; todo.dmgMult = 0.8;
    F.todo = todo; F.todoU = todo.units[0];
    F.kyo = allyGroup(rt, { faction: 'tokugawa', fullStrength: true, name: '京極高知の手', anchor: { x: 18, z: 78 }, facing: -Math.PI / 2, width: 12, aggro: 7, noRout: true, formation: 'yari', order: 'hold' },
      dress([{ type: 'samurai', n: 1, o: { name: '京極高知', hat: 'kabuto_m', haori: 0x2a2a3a } }, { type: 'ashigaru', n: 18 }], { flag: 'kyogoku' }));
    F.kyo.defMult = 1.3; F.kyo.dmgMult = 0.8;
    F.todo2 = allyGroup(rt, { faction: 'tokugawa', fullStrength: true, name: '藤堂の二陣', anchor: { x: 30, z: 38 }, facing: -Math.PI / 2, width: 12, aggro: 7, noRout: true, formation: 'yari', order: 'hold' },
      dress([{ type: 'samurai', n: 2, o: { hat: 'kabuto_m' } }, { type: 'ashigaru', n: 18 }, { type: 'bow', n: 3 }], TODO_LK));
    F.tera = allyGroup(rt, { faction: 'tokugawa', fullStrength: true, name: '寺沢広高の手', anchor: { x: 28, z: 94 }, facing: -Math.PI / 2, width: 12, aggro: 7, noRout: true, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '寺沢広高', hat: 'kabuto_m', haori: 0x3a2a2a } }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 3 }]);
    for (const g of [F.todo2, F.tera]) { g.defMult = 1.3; g.dmgMult = 0.8; }
    // 藤堂の鉄砲組：霧の中、平塚の隊が寄せきった所で一斉に放つ（open の後の volleyTick）
    F.gunG = allyGroup(rt, { faction: 'tokugawa', fullStrength: true, name: '藤堂の鉄砲組', anchor: { x: TODO.x + 2, z: TODO.z - 10 }, facing: -Math.PI / 2, width: 10, aggro: 30, noRout: true, formation: 'line', order: 'hold' },
      dress([{ type: 'samurai', n: 1, o: { hat: 'kabuto_m' } }, { type: 'gun', n: 8 }], TODO_LK));
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: TODO.x + 4, z: TODO.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n }]);

    // ---- 西軍：大谷方の平塚為広・戸田勝成（霧の向こう、藤古川の手前） ----
    F.hira = enemyGroup(rt, { faction: 'otani', name: '平塚為広の隊', anchor: { x: -44, z: 46 }, facing: Math.PI / 2, fleeDir: { x: -1, z: -0.2 }, aggro: 9, width: 16, noRout: true, dmgMult: 0.62 },
      dress([{ type: 'busho', n: 1, o: { name: '平塚為広', horse: true, invuln: true, hat: 'kabuto_w', haori: 0x4a3a2a } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 24 }, { type: 'gun', n: 5 }], OTANI));
    soften(F.hira);
    F.toda = enemyGroup(rt, { faction: 'otani', name: '戸田勝成の隊', anchor: { x: -46, z: 80 }, facing: Math.PI / 2, fleeDir: { x: -1, z: 0.1 }, aggro: 9, width: 14, noRout: true, dmgMult: 0.62 },
      dress([{ type: 'busho', n: 1, o: { name: '戸田勝成', horse: true, invuln: true, hat: 'kabuto_m', haori: 0x3a3a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 20 }, { type: 'bow', n: 4 }], OTANI));

    soften(F.toda);
    // 大谷方の平塚の隊の後ろに、同じ旗の控え
    KIT.backOf(rt, F.hira, { flag: 'otani', armor: OTANI.armor, kind: 'spear', w: 18, depth: 10, count: 130, seed: 153 });
    // 11/19 写真の悪い所③「押し合いの奥の野が薄い」：戸田の隊の後ろにも同じ旗の控え（本物の兵を軽く描く束・崩れれば一緒に崩れる）
    KIT.backOf(rt, F.toda, { flag: 'otani', armor: OTANI.armor, kind: 'mixed', w: 16, depth: 10, count: 110, seed: 157 });
    // ---- 陣と旗 ----
    // 本陣：大谷吉継（藤川台）と家康（桃配山）。陣幕の内に床几の大将と諸将、後ろに馬印と旗本
    // 見に行けば大将と旗本がいる（camp：大将・旗本・控え・使番）
    F.otaniH = camp(rt, { x: -104, z: 62, facing: Math.PI / 2, team: 1, faction: 'otani', mon: 'otani', armor: OTANI.armor, noUma: true,
      general: { name: '大谷吉継' }, guard: 15, reserve: 160, runTo: { x: -60, z: 60 } });
    // 病の大谷吉継は馬でなく四方輿（kaito 11/6）。陣の内に輿を下ろし、吉継はその床に座る
    { const og = F.otaniH && F.otaniH.general; if (og) { F.koshi = koshi(W, og.pos.x, og.pos.z, og.heading || 0); rt.scene.add(F.koshi); }
      // 11/10：敵の待つ組を攻めに出す共通の頭（ai.js）で、吉継が馬に乗って野へ出ていた。輿の陣から動かさない
      if (og && og.group) { og.group.noAI = true; og.group.stay = true; og.group.aggro = 0; F.otaniHome = { x: og.pos.x, z: og.pos.z }; } }
    camp(rt, { x: 150, z: -6, facing: -Math.PI / 2, team: 0, faction: 'tokugawa', mon: 'tokugawa', armor: 0x24221f,
      general: { name: '徳川家康', hat: 'kabuto_m', haori: 0x2a2a3a }, guard: 15, reserve: 200, runTo: { x: 60, z: 20 } });
    for (const [x, z, k] of [[-96, 50, 'toyotomi'], [-112, 50, 'toyotomi'], [-122, -116, 'ishida'], [-116, -126, 'ishida'], [-86, -58, 'shimazu'], [-116, 4, 'ukita']]) rt.scene.add(nobori(W, x, z, k, 6));
    for (const [x, z, k] of [[140, -16, 'onri'], [160, -16, 'tokugawa'], [8, 44, 'todo'], [8, 58, 'todo'], [8, 72, 'kyogoku'], [8, 86, 'kyogoku']]) rt.scene.add(nobori(W, x, z, k, x > 100 ? 7 : 5));
    for (const [x, z] of [[-46, 126], [-34, 130], [-40, 144]]) rt.scene.add(nobori(W, x, z, 'kobayakawa', 6));
    // 松尾山の麓に一列：脇坂・朽木・小川・赤座（はじめは西軍の備として並ぶ。寝返りで脇坂の兵がここから出る）
    for (const [x, z] of [[-14, 124], [-4, 130], [6, 134]]) rt.scene.add(nobori(W, x, z, 'wakisaka', 5));
    // 霧の奥の西軍：藤古川の向こうに旗の列を三重に、その間に陣幕。霧が濃いほど奥の列が薄れて層に見える
    [[-58, 26, 'otani'], [-74, 31, 'otani'], [-90, 26, 'toyotomi']].forEach(([x0, z0, k], r) => {
      for (let z = z0; z <= 96; z += 10 + r * 2) rt.scene.add(nobori(W, x0 + Math.sin(z * 0.7) * 1.5, z, (z / 10 | 0) % 3 === 2 && r ? 'ukita' : k, 5 + r * 0.6));
    });
    for (const [x, z, k] of [[-82, 36, 'otani'], [-84, 88, 'toyotomi']]) rt.scene.add(jinmaku(W, x, z, 10, 6, 4, { mon: k }));
    // 笹尾山の斜面：石田の本陣の前に二重の柵と篝火
    const sb = makeSimpleBatch();
    for (const x0 of [-100, -108]) {
      for (let z = -146; z < -78; z += 6) {
        if ((z + 146) % 24 === 18) continue;   // 出入りの口
        const xa = x0 + Math.sin(z * 0.11) * 1.5, xb = x0 + Math.sin((z + 6) * 0.11) * 1.5;
        palisade(W, [xa, z, xb, z + 6], { h: 2.2, batch: sb });
      }
    }
    finalizeSimpleBatch(rt, sb);
    const fires = [[-97, -140], [-97, -122], [-97, -104], [-97, -86], [-111, -131], [-111, -95]];
    rt.scene.add(kagaribiBatch(W, fires));
    for (const [x, z] of fires) W.addFire(x, z, { torch: true, h: 1.3, lightRadius: 12, lightColor: 0xff8a3a, lightStrength: 1.2, lightDecay: 0 });
    rt.scene.add(tawara(W, 40, 60, 0.4, 5));
    // 遠景の村（関ヶ原の宿のはずれ）
    KIT.farVillage(rt, 40, -142, { rot: 0, n: 6, fields: 8, seed: 31, autumn: true });

    // ---- 大軍（軽い作り） ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => ({ m: KIT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind), x0: x, z0: z });
    const TK = 0x24221f, WS = 0x2c2a2a;
    // 11/19 布陣図：福島正則は家紋の沢瀉（前は無地の丸）、細川忠興は九曜（前は黒田の旗で代用）
    // 東軍：福島・井伊の赤備え・黒田・細川、藤堂の後ろ、家康の本隊（旗本の騎馬）、南宮山の押さえ
    [[-14, -8, 'mizuno', TK, 'gun'], [4, -40, 'ii', 0x8e1f16, 'cavalry'], [-30, -100, 'kuroda', TK, 'spear'], [0, -76, 'kuyo', TK, 'gun'], [66, 44, 'todo', TK, 'spear'], [50, 16, 'tokugawa', TK, 'gun'], [70, -30, 'tokugawa', TK, 'spear'], [132, 16, 'tokugawa', TK, 'spear'], [150, -30, 'tokugawa', TK, 'cavalry']]
      .forEach(([x, z, f, c, kind], i) => DA(x, z, 26, kind === 'gun' ? 6 : 14, kind === 'cavalry' ? 130 : 200, -Math.PI / 2, c, f, 101 + i, kind));
    // 西軍：笹尾山の石田の本陣、島津、小西の鉄砲、天満山の宇喜多、大谷の本隊
    // 11/19 布陣図：兵の数を史実の比に寄せる（前はどの隊も240で、一万七千の宇喜多と千五百の島津が同じ大きさ）。合わせて約1,240（前 1,200）
    F.west = [[-118, -110, 'ishida', 30, 'honjin', 280], [-88, -60, 'shimazu', 16, 'mixed', 120], [-96, -26, 'konishi', 26, 'gun', 200], [-112, 10, 'ukita', 46, 'spear', 440], [-80, 72, 'otani', 24, 'spear', 200]]
      .map(([x, z, f, w, kind, cnt], i) => DA(x, z, w, kind === 'gun' ? 6 : (kind === 'honjin' ? 24 : (kind === 'spear' && cnt > 300 ? 18 : 14)), cnt, Math.PI / 2, f === 'shimazu' ? SHIMAZU.armor : WS, f, 121 + i, kind));
    F.west[0].m.army.lord = '石田三成';   // 笹尾山へ寄れば旗本が迎え撃つ（b_nagashinojo.js の wake）
    // 南宮山の毛利（動かない）
    DA(152, 150, 36, 16, 260, -Math.PI * 0.75, WS, 'mori', 131, 'spear');
    // 11/19 布陣図：南宮山の東の麓（栗原）に長宗我部盛親。東軍の押さえ（浅野幸長・池田輝政）は西でなく南宮山へ向く（前は徳川の旗一塊で西向き）
    DA(186, 168, 22, 12, 120, -Math.PI * 0.75, WS, 'chosokabe', 132, 'spear');
    DA(94, 112, 22, 12, 110, Math.atan2(58, 38), TK, 'asano', 133, 'spear');
    DA(110, 124, 22, 12, 110, Math.atan2(42, 26), TK, 'tokugawa', 134, 'mixed');
    // 松尾山の小早川。寝返ると山を下って大谷の横へ駆ける（山の上の本隊・中腹の先手・麓の先駆け）
    F.koba = [DA(MATSUO.x, MATSUO.z, 30, 16, 300, -Math.PI * 0.93, KOBA.armor, 'kobayakawa', 141, 'mixed'), DA(-60, 118, 24, 12, 200, -Math.PI * 0.85, KOBA.armor, 'kobayakawa', 142, 'spear'), DA(-58, 96, 22, 12, 160, -Math.PI * 0.62, KOBA.armor, 'kobayakawa', 143, 'cavalry')];
    F.koba[1].m.visible = false; F.koba[2].m.visible = false;
    // ---- 大軍どうしの合戦（軽い作り・world.addClash）：北の野で福島・井伊と宇喜多、その奥で黒田と石田が組み合う ----
    // 南の端は、藤堂と平塚の本物の押し合いにつながる（link）
    const east = (flag, armor, count, x = {}) => ({ flag, armor, count, team: 0, faction: 'tokugawa', ...x });
    const west = (flag, armor, count, x = {}) => ({ flag, armor, count, team: 1, faction: flag, ...x });
    F.clash = [
      clash(rt, { x: -26, z: -22, facing: -Math.PI / 2, w: 88, gap0: 36, seed: 171, noRout: true, surge: { k: 'B', every: 50, count: 180, flank: 0.30 }, A: east('mizuno', TK, 760, { guns: true }), B: west('ukita', WS, 1000, { bows: true }),
        link: () => (F.step >= 1 && F.step < 3 && !gone(F.hira) && F.todo2.count ? { x: (F.todo2.center().x + F.hira.center().x) / 2, z: 30 } : null) }),
      clash(rt, { x: -72, z: -98, facing: -Math.PI / 2, w: 60, gap0: 30, seed: 172, noRout: true, surge: { k: 'B', every: 55, count: 150, flank: 0.30 }, A: east('kuroda', TK, 520, { guns: true }), B: west('ishida', WS, 680, { guns: true }) }),   // 正面いっぱい：北の端（-128）から南の藤堂の押し合い（22）まで切れ目なく
    ];

    rt.world.setTime('day');
    rt.setPhase('fog');
    rt.obj('main', '藤堂高虎の手に加わり、大谷吉継の隊に備えよ', 'main');
    rt.obj('stay', '霧が晴れるまで、藤堂の旗を離れるな', 'order');
    rt.say('藤堂高虎', `${nm(rt)}、霧の向こうは大谷勢じゃ。槍をそろえよ`, 4.5);
    rt.say('藤堂高虎', '霧では敵味方も見えぬ。旗から離れるな', 4.5);
    rt.say('藤堂の侍', '南の山が松尾山じゃ。小早川秀秋の一万五千が、まだどちらにもつかずに見下ろしておる', 5);
    // 11/21 クラウド 持ち主（K491「始めからもう戦が始まっている」）：開戦の前から北の野の大軍どうし（clash）が待ちの間も鉄砲・矢・打ち合いの音・鬨を鳴らしていた。
    //   開戦までは黙らせ、史実の順に：井伊直政・松平忠吉の少人数（赤備え）が本人の脇を抜けて霧へ駆け、宇喜多勢へ鉄砲を撃ち、元の陣へ戻る→福島が怒る→開戦
    for (const c of F.clash) hush(c, true);
    rt.after(3, () => this.nuke(rt));
  },

  // 井伊・松平の抜け駆け（本物の兵の少人数。撃ったら陣へ戻って消える。戻ってから開戦）
  nuke(rt) {
    const F = rt.flags;
    if (F.step >= 1 || F.ending) return;
    const g = allyGroup(rt, { faction: 'ii', name: '井伊・松平の抜け駆け', anchor: { x: 44, z: 30 }, facing: Math.PI, width: 6, aggro: 0, noRout: true, speed: 4.6 },
      dress([{ type: 'busho', n: 1, o: { name: '井伊直政', invuln: true, horse: true, hat: 'kabuto', haori: 0 } }, { type: 'samurai', n: 1, o: { name: '松平忠吉', invuln: true, horse: true, hat: 'kabuto_m' } }, { type: 'cavalry', n: 3 }, { type: 'gun', n: 5 }], II));
    F.nuke = g;
    g.seekRange = 0; g.holdFire = true;
    for (const u of g.units) { u.invuln = true; u.noTarget = true; }
    g.order = 'path'; g.path = [[24, 30], [-2, 14], [-20, 2]]; g.pathIdx = 0; g.march = false;
    rt.say('藤堂の侍', '赤備えじゃ……井伊直政殿と松平忠吉殿が、わずかな手勢で霧の中へ駆けてゆく', 4);
    let shot = false;
    const fire = () => {
      if (shot || F.step >= 1 || F.ending) return;
      shot = true;
      const c = g.center ? g.center() : { x: -20, z: 2 };
      sfx('volley', 0.8);
      rt.army.play('volley', { x: c.x - 4, z: c.z }, 1.5);
      rt.banner('抜け駆け', '井伊直政・松平忠吉、宇喜多勢へ撃ちかける');
      rt.say('足軽', '北で鉄砲の音じゃ！　先陣の福島様より先に撃ったぞ！', 3);
      // 撃ったら元の陣（北の井伊の陣）へ戻る。着いたら陣の大軍に紛れて消える
      rt.after(2.5, () => {
        if (F.ending) return;
        g.order = 'move'; g.dest = { x: 6, z: -34 }; g.path = null; g.speed = 4.6;
        g.onArrive = (gg) => { for (const u of gg.units) if (u.alive) rt.army.despawn(u); };
        rt.after(3, () => { if (F.step < 1 && !F.ending) rt.say('伝令', '福島正則殿、先陣を抜かれたと怒り、宇喜多勢へまっしぐらにかかられました！', 3.5); });
        rt.after(8, () => this.open(rt));
      });
    };
    g.onArrive = fire;
    rt.after(26, fire);   // 道で詰まっても撃つ
    rt.after(45, () => this.open(rt));
  },

  // 開戦：北で井伊・松平の抜け駆け。藤堂の手も押し出す
  open(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('fight');
    sfx('volley', 0.8);
    rt.army.play('gun', { x: -10, z: -30 }, 1.5);
    for (const c of F.clash) hush(c, false);
    rt.banner('開戦', '福島正則、宇喜多勢へかかる');
    rt.say('足軽', '福島勢が押し出した！　始まったぞ！', 3);
    rt.after(6, () => {
      sfx('taiko', 1);
      rt.say('藤堂高虎', '我らも出る。前へ！　槍を揃えて、霧の中を押せ！', 3.5);
      // 北の野の大軍どうしも寄せ合って組み合う。井伊の赤備えの騎馬は宇喜多の北の端へ
      for (const c of F.clash) c.go();
      F.clash[0].cavalry('A', { from: -1, flag: 'ii', armor: II.armor, count: 80, delay: 22 });
      rt.obj('main', '霧の中、平塚・戸田の隊を押しとどめよ', 'main');
      const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.0; g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 10; }; };
      go(F.todo, FRONT.x, FRONT.z); go(F.kyo, FRONT.x - 2, FRONT.z + 28); go(F.todo2, FRONT.x + 6, FRONT.z - 16); go(F.tera, FRONT.x + 4, FRONT.z + 44);
      // 11/21 クラウド 持ち主（K457「後ろで待つだけの塊を無くす」）：act bot で京極・寺沢の手が持ち場に着いた後、二十五m 内の敵を前に二十秒立つ（三本で 2・2・12回）。
      //   着いたら二十四m 内の敵へは自分から寄って斬り合う（数は同じ）
      for (const g of [F.kyo, F.tera]) { const oa = g.onArrive; g.onArrive = (gg) => { oa(gg); gg.aggro = 24; }; }
      go(F.gunG, FRONT.x + 4, FRONT.z - 6);
      F.vol = { guns: () => [F.gunG], foe: () => F.hira, r: 26, max: 70, clash: F.clash[0], side: 'A', hit: 35, who: '藤堂高虎',
        wait: '鉄砲組、まだ撃つな。霧の中から槍が見えるまで引きつけよ', line: '見えた！　鉄砲組、放てぇっ！', sub: '平塚の隊の前が崩れる',
        then: (rt) => {
          rt.say('藤堂高虎', '平塚の前が乱れた！　今じゃ、槍を入れよ！', 3);
          // 11/21 04:00 クラウド 持ち主（K492「敵がいても攻めてこない」・K467「一気に大勢で来る」）：平塚・戸田の隊は霧の中で持ち場に立ち、
          //   近づいた者にだけ槍を入れた（描かずの数え 本人の四十m 内の敵 33秒 10〜21人）。鉄砲を浴びた平塚は退かずに押し返してきた（藤堂・京極を
          //   何度も押し戻したと伝わる）。八秒後に二つの隊が藤堂の列へ走り込み、目の前の者と斬り合う（mass_charge.js と同じ形。兵は足さない）
          rt.after(8, () => {
            if (F.step !== 1) return;
            let n = 0;
            for (const [g, dz] of [[F.hira, -6], [F.toda, 22]]) {
              if (gone(g) || g.routed) continue;
              g.order = 'hold'; g.dest = null; g.onArrive = null; g.focus = null;
              g.anchor = { x: FRONT.x - 4, z: FRONT.z + dz }; g.aggro = 8; g.seekRange = 12; g.allOutRun = true; g.morale = Math.max(g.morale || 0, 90);
              n++;
            }
            if (n) { try { enemyRush(0.8); } catch (e) { console.error(e); } rt.say('足軽', '大谷の槍が来るぞ！　踏みとどまれ！', 2.5); }
          });
        } };
      for (const [g, x, z] of [[F.hira, -26, 50], [F.toda, -28, 80]]) {
        g.order = 'move'; g.dest = { x, z }; g.speed = 2.4;
        // 大谷勢は備を崩さず押し合う（近づいた者にだけ槍を入れる）
        g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x, z }; gg.aggro = 11; gg.formation = 'yari'; };
      }
      rt.marker('hira', centerOf(F.hira), () => `平塚為広の隊・${moraleWord(F.hira.morale)}`, { red: true, group: F.hira });
    });
    rt.after(26, () => { if (F.step === 1) rt.say('足軽', '霧の中から大谷の旗が！　近いぞ！', 2.5); });
    // 11/18 16:40 クラウド 持ち主：act bot の討ち取りが毎回 6/3/8 で「退屈」。霧の押し合いの段（fight）も 0〜6＝平塚・戸田の備は槍を揃えて旗の下に留まり、
    //   本人のそばで斬り合う相手がいなかった（一本目は組を出しても周りの藤堂の兵とぶつかり、fight の討ち取り1）。霧の中で備から抜けて本人へ突きかかる平塚・戸田の槍の者を二度だけ出す（平塚為広は藤堂・京極と幾度も槍を合わせたと伝わる）。
    //   列で二人ずつ着く・傷の重さは寝返りの段と同じ。霧が晴れて押し返しの段に入ったら、残りは西の大谷の陣へ退いて消える
    const fogRush = (name, off, n, line) => { if (F.step !== 1 || F.dpA || F.ending) return; const g = rushAt(rt, name, off, OTANI, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n }]); if (g) { g._fog = true; if (line) rt.say('足軽', line, 3); } };
    rt.after(34, () => fogRush('霧から抜けた平塚の槍の者', { x: -18, z: 4 }, 5, '霧の中から平塚の槍が抜けてくる！　構えよ！'));
    rt.after(76, () => fogRush('突きかかる戸田の手の者', { x: -18, z: -6 }, 5, '戸田の手の者が、こっちへ突きかかってくる！'));
    // 勝ち筋：南の松尾山（小早川）が動けば、大谷勢の横腹が空く
    rt.after(44, () => { if (F.step === 1) rt.say('藤堂高虎', '崩れずに持ちこたえよ。南の松尾山が動けば、大谷の横腹が空く', 4); });
  },

  // 大谷の本陣から出る次の隊（木下頼継・大谷吉勝）
  //   二つの隊は一度にまとめて出る（ぽつぽつ出さず、一つの大きな波に）。後ろに大谷の控えが続く
  reinforce(rt) {
    const F = rt.flags;
    F.extra = F.extra || [];
    for (const [name, z] of [['木下頼継', 60], ['大谷吉勝', 72]]) this.reinforceOne(rt, name, z);
    KIT.backOf(rt, F.extra[0], { flag: 'otani', armor: OTANI.armor, kind: 'spear', w: 18, depth: 10, count: 110, seed: 156 });
    sfx('taiko', 0.8);
    rt.say('足軽', '大谷の陣から新手じゃ！　木下と大谷吉勝の旗が一度に来るぞ！', 3);
  },
  reinforceOne(rt, name, z) {
    const F = rt.flags;
    const g = enemyGroup(rt, { faction: 'otani', name: `${name}の隊`, anchor: { x: -74, z }, facing: Math.PI / 2, fleeDir: { x: -1, z: 0 }, aggro: 12, width: 14, noRout: true, dmgMult: 0.62, speed: 2.6 },
      dress([{ type: 'busho', n: 1, o: { name, horse: true, invuln: true, hat: 'kabuto_m', haori: 0x3a2a22 } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], OTANI));
    g.order = 'move'; g.dest = { x: -30, z: z - 8 };
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: -30, z: z - 8 }; gg.aggro = 11; gg.formation = 'yari'; };
    soften(g);
    F.extra.push(g);
  },

  // 小早川の寝返り： 松尾山を下って大谷の横へ
  turn(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('turn');
    // 押し返しの段で西へ退いて立て直した大谷方は、元の押し合いの場へ戻って小早川の動きを待つ（遠くで固まって、遊び手が一人で斬り込む形にしない）
    for (const g of [F.hira, F.toda, ...(F.extra || [])]) {
      if (gone(g) || !g.front) continue;
      // 11/19 01:03 クラウド 持ち主：四つの隊が一度に前へ戻ると、act bot が寝返りの段の始め（530秒）に本人の五歩内に敵十一人・味方0で倒れた。
      //   二陣の木下頼継・大谷吉勝の隊は大谷の陣の柵の前に残る（寝返った小早川へ向き直ったと伝わる。数は同じ・本人が行けば斬り結ぶ）
      if ((F.extra || []).includes(g)) { g.noAI = false; g.order = 'hold'; g.anchor = g.center(); g.aggro = 10; g.formation = 'yari'; g.onArrive = null; continue; }
      const to = g.front;
      g.order = 'move'; g.dest = { ...to }; g.speed = 2.4; g.noAI = false;
      g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { ...to }; gg.aggro = 11; gg.formation = 'yari'; gg.facing = Math.PI / 2; };
    }
    // 段A で外した平塚の隊のピンを、前へ戻った所で立て直す
    if (!gone(F.hira) && !(rt.markers || []).some((m) => m.id === 'hira')) rt.marker('hira', centerOf(F.hira), () => `平塚為広の隊・${moraleWord(F.hira.morale)}`, { red: true, group: F.hira });
    // 寝返りは字幕だけで決めない（kaito 11/9）：鉄砲の音 → 山の旗が下り始める → どちらへ来るか分からない → 大谷の陣へ → 寝返りと分かる、を一分ほどかけて見せる
    // 問鉄砲は断定しない（家康の陣の方から鉄砲の音がして、周りが「催促か」と言うだけ）
    sfx('volley', 0.45);
    rt.army.play('gun', { x: 60, z: 70 }, 1.2);
    rt.say('足軽', '東で鉄砲の音……家康様の陣の方から、松尾山へ撃ちかけたか？', 4);
    rt.after(5, () => rt.say('藤堂の侍', '催促の鉄砲か……？　それとも、ただの空鉄砲か', 4));
    rt.after(15, () => {
      // 山の上の本隊がゆっくり動き出す（まだ駆けない）
      F.koba[0].m.advance(14, 22);
      sfx('horagai', 0.7);
      rt.banner('松尾山の動き', '小早川の旗が、山を下り始める');
      rt.say('足軽', '松尾山の旗が動いた……！　こっちへ下りてくるのか！？', 4);
      rt.say('藤堂高虎', '槍を南へも向けよ！　小早川がどちらへ付くか、まだ分からぬ', 4);
    });
    rt.after(34, () => {
      F.koba[1].m.visible = true; F.koba[1].m.advance(16, 18);
      rt.say('藤堂の侍', '中腹まで下りてきた。……一万五千じゃ。こちらへ来れば、藤堂の手は持たぬ', 4);
    });
    rt.after(41, () => rt.say('足軽', 'どっちへ向かう……？　旗の先が、まだ見えぬ', 3.5));
    rt.after(48, () => {
      F.koba[2].m.visible = true; F.koba[2].m.advance(12, 10);
      rt.say('伝令', '小早川勢、大谷の陣へ向かっております！', 3.5);
    });
    // 11/20 P3（K406）：寝返り（62秒）の九秒前から、松尾山の遠い太鼓が鳴り出して間を詰め、法螺貝（62秒）へつなぐ。山の旗は大軍の見える間だけ
    rt.after(53, () => { if (F.step === 2) encircleWarn(rt, { from: [{ x: MATSUO.x - 16, z: MATSUO.z - 14 }, { x: MATSUO.x + 6, z: MATSUO.z - 18 }], flag: 'kobayakawa', lead: 9, with: () => !!F.koba?.[0]?.m?.visible }); });
    rt.after(62, () => {
      F.flipT = rt.t;
      sfx('horagai', 1);
      rt.army.play('eshout', { x: MATSUO.x, z: MATSUO.z - 20 }, 2.5);
      rt.banner('小早川秀秋、寝返る', '松尾山を下り、大谷勢の横腹へ');
      for (const c of F.clash) c.shake('B', 15);
      // ここで初めて、山の旗が一斉に駆け下る
      F.koba[0].m.advance(26, 12, { charge: true });
      rt.after(2, () => F.koba[1].m.advance(18, 9, { charge: true }));
      rt.after(4, () => F.koba[2].m.advance(16, 7, { charge: true }));
      rt.say('足軽', '大谷の陣へ突っ込んだ……！　小早川が、西軍を裏切ったぞ！', 4);
      rt.say('藤堂高虎', '今じゃ！　大谷勢は横を突かれる。押せ、押し崩せ！', 3.5);
      // 大谷勢は向き直って、小早川の先手を一度押し返す（大谷吉継の備はよく戦ったと伝わる）
      rt.after(14, () => { if (F.kobaG && F.kobaG.count) { F.kobaG.morale = Math.max(20, F.kobaG.morale - 25); rt.say('足軽', '大谷勢が向き直って、小早川の先手を押し返したぞ……！', 3.5); rt.say('藤堂高虎', '大谷刑部、さすがじゃ。……だが横を突かれては持たぬ。押せ！', 3.5); } });
      rt.obj('main', '小早川の寝返りに合わせ、大谷吉継の隊を破れ', 'main');
      rt.after(18, () => { if (F.step === 2 && rushAt(rt, '逃げ場を失った大谷の兵', { x: -20, z: 6 }, OTANI, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 9 }])) rt.say('足軽', '小早川に横を突かれた大谷の兵が、こっちへなだれ込んでくる！', 3.5); });
      rt.after(52, () => { if (F.step === 2) rushAt(rt, '囲みを破ろうとする大谷の兵', { x: -18, z: -8 }, OTANI, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }]); });
      const k = allyGroup(rt, { faction: 'tokugawa', name: '小早川秀秋の兵', anchor: { x: -30, z: 112 }, facing: 0, width: 16, aggro: 12, noRout: true, speed: 3.2 },
        dress([{ type: 'samurai', n: 1, o: { name: '平岡頼勝', horse: true, hat: 'kabuto_m', haori: 0x4a2a1c } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 4 }], KOBA));
      k.order = 'move'; k.dest = { x: -40, z: 86 };
      k.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 60; };
      F.kobaG = k;
      KIT.backOf(rt, k, { flag: 'kobayakawa', armor: KOBA.armor, kind: 'spear', w: 18, depth: 12, count: 130, seed: 151 });
      // 大谷勢の将は、ここから討たれうる（平塚・戸田はこの日討ち死にした）
      // 名乗りは一人ずつ間をあけて（寝返りの大見出しと重ならないように）
      [F.hira, F.toda, ...(F.extra || [])].forEach((g, k) => {
        for (const u of g.units) if (u.type === 'busho') { u.invuln = false; u.announced = true; rt.after(8 + k * 9, () => { if (u.alive) u.announced = false; }); }
        if (g.count) g.morale -= 18;
      });
    });
    // 麓の四家は一斉でなく、十秒ほどおきに一家ずつ離反する（kaito 11/9：連鎖で見せる）
    rt.after(90, () => {
      F.w4n = 1;
      rt.banner('脇坂安治、東軍へ', '松尾山の麓の脇坂の手も、大谷勢へ向き直る');
      // 四家の兵も実際に駆け込んでくる（大谷勢が小勢に崩されたように見えないように、数で押し包む）
      const w4 = allyGroup(rt, { faction: 'tokugawa', name: '脇坂・朽木の兵', anchor: { x: -8, z: 128 }, facing: -Math.PI * 0.8, width: 16, aggro: 12, noRout: true, speed: 3.4 },
        dress([{ type: 'samurai', n: 1, o: { name: '脇坂安治', horse: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 22 }], { flag: 'wakisaka' }));
      w4.order = 'move'; w4.dest = { x: -34, z: 70 };
      w4.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 60; };
      F.w4 = w4;
      // 11/19：麓の四家は合わせて四千余り。二十余人だけで駆け込まないように、後ろに脇坂の旗の控え（本物の兵を軽く描く束）
      KIT.backOf(rt, w4, { flag: 'wakisaka', armor: KOBA.armor, kind: 'spear', w: 18, depth: 10, count: 120, seed: 158 });
      rt.after(3, () => rt.say('足軽', '南に脇坂の旗！　脇坂も西軍を裏切ったか！', 3.5));
      for (const g of [F.hira, F.toda, ...(F.extra || [])]) if (g.count) g.morale -= 6;
      for (const g of [F.todo, F.kyo, F.todo2, F.tera]) { g.order = 'attack'; g.seekRange = 50; g.formation = 'line'; }
    });
    [['伝令', '朽木元綱殿の手も、大谷勢へ向かいまする！'], ['伝令', '小川祐忠殿も寝返り！　大谷の陣の南が空きました！'], ['足軽', '赤座の旗までこちらに付いた……大谷勢が囲まれていく！']].forEach((s, i) => rt.after(102 + i * 11, () => {
      if (F.step !== 2) return;
      F.w4n = 2 + i;
      rt.say(s[0], s[1], 3.5);
      for (const g of [F.hira, F.toda, ...(F.extra || [])]) if (g.count) { g.morale -= 5; if (i === 2) g.noRout = false; }
    }));
  },

  // 西軍、総崩れ。そして島津の退き口
  collapse(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('collapse');
    // 大谷勢が崩れた後の味方の手・寝返った兵は任務に数えない：遠くの者から外して、西軍の本隊へ踏み込んだ時に近くの軽い兵を本物に替える枠へ回す
    KIT.markRecyclable(F.kyo, F.todo2, F.tera, F.kobaG, F.w4);
    rt.unmark('hira');
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '大谷勢を崩した');
    if (!F.strayed) rt.objDone('stay');
    rt.objRemove('stay');
    // 次の目標を先に置く（右の目標が全部済むと、島津の退き口の前に勝ちで締まってしまう。battle.js の goalsDoneTick）
    rt.obj('toyo', '西軍の崩れの中、まだ動かぬ島津の陣に備えよ', 'main');
    sfx('horagai', 0.9);
    // 最後の将が討たれた大見出しと重ならないよう、少し間をおいて知らせる
    rt.after(2.5, () => {
      rt.banner('大谷吉継、自刃', '西軍、総崩れ');
      const og = F.otaniH && F.otaniH.general;
      const ogG = og && og.group;   // 11/18 21:50 クラウド持ち主：自刃の後も本陣の旗本十三人が hold のまま残り、島津の段で本人がそこで囲まれた（act bot の足跡 780秒）。旗本は崩れて西の山へ散る
      if (og && og.alive) rt.army.despawn(og);
      for (const gq of [ogG, F.otaniH && F.otaniH.guard]) if (gq && gq.count && !gq.routed) { gq.noAI = false; gq.stay = false; gq.campGuard = false; gq.fleeDir = { x: -1, z: 0 }; gq.noRout = false; gq.morale = 0; gq.routed = true; gq.order = 'flee'; }   // 本陣と旗本（act bot 869秒 旗本十人が attack のまま本人へ）
      rt.say('伝令', '大谷刑部殿、自害！　大谷勢、崩れました！', 4);
    });
    // 崩れは南から北へ、一つずつ届く（大谷 → 小西 → 宇喜多 → 石田）。秀家・三成は討たせず、落ちていく
    rt.after(8, () => rt.say('伝令', '小西行長の陣、崩れました！　北天満山の旗が西へ散っていきまする！', 4));
    rt.after(14, () => { rt.banner('宇喜多秀家、退く', '天満山の旗が、伊吹山の方へ落ちていく'); rt.say('足軽', '宇喜多の大軍が……崩れていく。あれほど強かったのに', 3.5); });
    rt.after(21, () => rt.say('伝令', '笹尾山の石田三成、島左近が踏みとどまる間に、伊吹山へ落ちていきまする！', 4));
    F.westT = rt.t;
    // 北の野の西軍も、南の端（大谷の崩れた方）から次々に崩れる
    F.clash.forEach((c, i) => rt.after(6 + i * 10, () => c.rout('B', { from: 1, hideAfter: 50 })));   // 11/19：北の野の宇喜多の大軍は宇喜多の知らせ（14秒）の少し前から、石田の前はその後
    // 西軍の備が次々に崩れて西の山へ散る。石田の本陣はしばらく踏みとどまってから退く。島津はまだ動かない
    F.west.forEach((a, i) => {
      if (i === 1) return;
      if (i === 0) { rt.after(14, () => a.m.retreat(40, 26)); rt.after(34, () => a.m.rout({ hideAfter: 40 })); return; }
      // 11/19：前は並びの順（小西7・宇喜多10・大谷13秒）で、大谷の遠い大軍が最後に崩れていた。伝令の言う順（大谷 → 小西8秒 → 宇喜多14秒）にそろえる
      rt.after({ 4: 1, 2: 7, 3: 13 }[i] ?? 1 + i * 3, () => a.m.rout({ hideAfter: 50 }));
    });
    // 11/18 クラウド 持ち主：寝返りの段で本人へ斬りかかった大谷の兵の残りが、崩れの後も大谷の陣の跡(-94,67)で一点に重なって止まった（act bot 784秒）。
    //   大谷勢が崩れたら、残りは西の山へ退いて消える（25秒で着かなければ崩れて散る。段の組と同じ形）
    for (const g of F.rush || []) {
      if (!g.count || g.routed || !g._rushOtani) continue;
      const c = g.center();
      g.focus = null;
      g.order = 'move'; g.dest = { x: -112, z: Math.max(20, Math.min(100, c.z)) }; g.aggro = 2; g.speed = 3; g.formation = null;
      g.onArrive = (gg) => offStage(rt, gg);
      rt.after(25, () => { if (g.count && !g.routed && g.order === 'move') { g.fleeDir = { x: -1, z: 0 }; g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; } });
    }
    // 11/18 21:45 クラウド持ち主（act bot の足跡）：大谷が崩れた後も、平塚・戸田・木下・大谷吉勝の隊の残り（六、七人ずつ）が本人の二十五m 内で
    //   attack のまま島津の段の終わり（856秒）まで残り、本人のまわりの敵が八十〜百人に膨らんで bot が避け続けた。平塚為広・戸田勝成はこの崩れで討ち死にしている。
    //   大谷自刃の知らせの後、残りは崩れて西の山へ散る（共通の崩れの形・数は消さない）
    rt.after(4, () => {
      for (const g of [F.hira, F.toda, ...(F.extra || [])]) {
        if (!g || gone(g) || g.routed) continue;
        g.focus = null; g.fleeDir = { x: -1, z: 0 }; g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee';
      }
    });
    for (const q of F.koba) if (q.m.visible) rt.after(6, () => q.m.halt());
    for (const g of [F.todo, F.kyo, F.todo2, F.tera]) if (g && g.count) { g.order = 'hold'; g.anchor = g.center(); g.aggro = 12; g.formation = 'yari'; g.facing = -Math.PI / 2; }
    // 寝返った小早川・脇坂の兵は、崩れた大谷の陣へ追い込む（史実。散った所で待たせると、山すそに数人が突っ立って見えた）
    [F.kobaG, F.w4].forEach((g, i) => {
      if (!g || !g.count) return;
      const to = { x: -86, z: 66 + i * 10 };
      g.order = 'move'; g.dest = { ...to }; g.speed = 3.2; g.aggro = 12;
      g.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 40; gg.anchor = { ...to }; };
    });
    // 戦を長くしすぎないよう、B（西軍の崩れの中の段）は省き、そのまま島津の退き口へ（skB は残しておく）
    rt.after(27, () => this.shimazu(rt));
  },

  allyFresh(rt) {
    const F = rt.flags;
    // 11/19 04:35 クラウド 持ち主：act bot（足跡 610〜776秒）で島津の段の本人の八歩内に味方0（寄0）・六歩内に敵二〜二十六人＝「孤立」と見て避け続け、
    //   島津の段の討ち取り0（815秒「退屈」）。新手は寝返り・崩れの段で七組を使い切り、島津の段（島津勢八十人が加わり本物の兵が二百二十を超える）では出なかった。
    //   島津の段は別に三組まで・本物の兵の上限を二百六十に（藤堂・京極の手も島津の退き口を追った。前線の兵と斬り合いは減らさない）
    const sh = F.step >= 4;
    // 11/21 03:50 クラウド 持ち主（kaito_now ③「主人公が一人にならない」・K495）：描かずの数え（三十秒ごと）で、藤堂・京極・寺沢の手が
    //   一〜四人まで削られても、二陣・寺沢・京極のどれかが三人残る間は新手が出ず、本人の四十m 内が 味方12〜19・敵50〜58（363〜423秒）、
    //   島津の段も 味方10〜20・敵30〜50（573〜663秒）だった。四十m 内の味方が敵の半分より少ない（か十五人より少ない）時も新手を出す。
    //   回数は 七→十（島津の段は十三）。本物の兵の上限は同じ（220・島津の段 260）
    const P0 = rt.player && rt.player.u.alive ? rt.player.u.pos : null;
    // 11/21 10:00 クラウド 持ち主（K492・kaito_now ③）：描かずの数え（十秒ごと・携帯の見なし）で、310秒から後の本人の四十m 内が 味方16〜34・敵30〜58、
    //   本物の兵は全部で 110〜190（上限220の内）＝味方が敵の半分を少し超えるだけで新手が出ず、本人のまわりが薄かった。
    //   味方が二十五人より少ないか敵の四分の三より少ない時も新手を出す。回数 十→十六（島津の段は十九）。上限220・260は同じ
    if ((F.freshN || 0) >= (sh ? 16 + 3 : 16) || F.freshT > rt.t - 18 || !P0) return;
    let a40 = 0, e40 = 0, live = 0;
    for (const u of rt.army.units) {
      if (!u.alive || u.isStruct) continue; live++;
      if (u.fleeing || Math.hypot(u.pos.x - P0.x, u.pos.z - P0.z) >= 40) continue;
      if (u.team === rt.player.u.team) a40++; else e40++;
    }
    const thin = a40 < 25 || a40 * 4 < e40 * 3;
    if (!thin && [F.todo2, F.tera, F.kyo].some((x) => x && x.count >= 3 && !x.routed)) return;
    if (live > (sh ? 260 : 220)) return;
    F.freshT = rt.t; F.freshN = (F.freshN || 0) + 1;
    const P = rt.player.u.pos, kyo = F.freshN % 2 === 0;
    const at = freshAt(rt, P);   // 00:58 本人の東二十歩（三十四歩では追いつかず十四〜十八歩後ろを歩いた）
    const g = allyGroup(rt, { faction: 'tokugawa', name: kyo ? '京極の新手' : '藤堂の新手', anchor: at, facing: -Math.PI / 2, width: 10, aggro: 9, noRout: true, formation: 'yari', order: 'hold' },
      kyo ? dress([{ type: 'samurai', n: 2, o: { hat: 'kabuto_m' } }, { type: 'ashigaru', n: 9 }], { flag: 'kyogoku' }) : dress([{ type: 'samurai', n: 2, o: { hat: 'kabuto_m' } }, { type: 'ashigaru', n: 9 }], TODO_LK));
    g.defMult = 1.3; g.dmgMult = 0.8;
    F.todo2 = g; F.nearT = -9;
    if (F.step >= 3) KIT.markRecyclable(g);
    rt.say(kyo ? '京極高知' : '藤堂高虎', kyo ? '後ろの備を前へ出せ！　藤堂の手を独りにするな！' : '二の備、前へ！　あの者の脇を固めよ！', 3);
  },

  // 11/21 10:10 クラウド 持ち主（K492「見渡すと敵が少なく見える・攻めてこない」）：味方の新手を厚くした後の描かずの数え（十秒ごと・携帯の見なし）で、
  //   霧の段の終わり〜寝返りの段（330〜460秒）の敵が全部で 52〜77人・本人の八十m 内 43〜76、本物の兵は全部で 115〜160（上限220の内）だった。
  //   大谷吉継の兵は寝返りの前まで押し返しを繰り返したと伝わる。八十m 内の敵が六十人を切り、本物の兵が二百より少ない間は、
  //   本人の西の見えない所（五十〜七十m）から大谷の新手（侍一・足軽十）を味方の線へ打ち込ませる（本人を的にはしない・二十秒に一組・八組まで・崩れの後は出さない）
  enemyFresh(rt) {
    const F = rt.flags, pu = rt.player && rt.player.u;
    if (!pu || !pu.alive || F.ending || (F.eFreshN || 0) >= 8 || F.eFreshT > rt.t - 20) return;
    let e80 = 0, live = 0;
    for (const u of rt.army.units) {
      if (!u.alive || u.isStruct) continue; live++;
      if (u.team !== pu.team && !u.fleeing && Math.hypot(u.pos.x - pu.pos.x, u.pos.z - pu.pos.z) < 80) e80++;
    }
    if (e80 >= 60 || live >= 200) return;
    const P = pu.pos, clamp = (x, z) => ({ x: Math.max(-105, Math.min(40, x)), z: Math.max(20, Math.min(110, z)) });
    const cam = rt.camera;
    let at = null;
    if (cam && cam.projectionMatrix) {
      cam.updateMatrixWorld(); _fm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_fm);
      const seen = (p) => { const y = rt.world && rt.world.heightAt ? rt.world.heightAt(p.x, p.z) : 0; for (const h of [0.2, 1.7, 3.2]) { _fv.set(p.x, y + h, p.z); if (_fr.containsPoint(_fv)) return true; } return false; };
      for (const r of [55, 70]) for (const a of [0, 0.5, -0.5, 0.9, -0.9, 1.3, -1.3]) {
        const p = clamp(P.x - Math.cos(a) * r, P.z + Math.sin(a) * r);
        if (Math.hypot(p.x - P.x, p.z - P.z) > 40 && !seen(p)) { at = p; break; }
      }
    }
    if (!at) at = clamp(P.x - 70, P.z);
    if (Math.hypot(at.x - P.x, at.z - P.z) < 40) return;
    F.eFreshT = rt.t; F.eFreshN = (F.eFreshN || 0) + 1;
    const g = enemyGroup(rt, { faction: 'otani', name: '大谷の新手', anchor: at, facing: Math.atan2(P.x - at.x, P.z - at.z), aggro: 16, width: 8, speed: 3.2, dmgMult: 0.6 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }], OTANI));
    g.order = 'attack'; g.seekRange = 45; g.anchor = { x: P.x, z: P.z };
    soften(g);
    g._rushOtani = true;
    (F.rush || (F.rush = [])).push(g);
  },

  mateNear(rt) {
    const F = rt.flags;
    if (!(F.nearT > rt.t - 2) && rt.player && rt.player.u.alive) {
      F.nearT = rt.t;
      const P = rt.player.u.pos, g = [F.todo2, F.tera, F.kyo].find((x) => x && x.count >= 3 && !x.routed);   // 二陣が討たれていれば寺沢・京極の手
      if (g) {
        const c = g.center(), to = { x: P.x + 3, z: P.z };
        if (Math.hypot(c.x - P.x, c.z - P.z) > 9) {
          g.order = 'move'; g.dest = to; g.speed = g.name.endsWith('の新手') ? 4.2 : 3.4;   // 新手は駆け足で本人に追いつく
          g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { ...to }; gg.aggro = 9; gg.formation = 'yari'; gg.facing = -Math.PI / 2; };
        }
      }
    }
  },

  // 段を重ねる（b_depth.js）：A 大谷勢の押し返し（霧が晴れた後、寝返りの前）→ B 西軍の崩れの中で（島津の前）→ C 捨て奸（豊久の殿の後）
  deep(rt, which, then) {
    const F = rt.flags;
    if (F['dp' + which]) return;
    F['dp' + which] = true;
    if (rt.G.lord) { then(); return; }
    F.dpOn = true;
    depthStart(rt, skCtx(rt, which), which === 'A' ? skA() : which === 'B' ? skB() : skC(), () => { F.dpOn = false; then(); });
  },
  shimazu(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('shimazu');
    sfx('taiko', 1);
    rt.army.play('eshout', { x: -70, z: -24 }, 2.5);
    rt.banner('島津の退き口', '島津義弘、敵中を突っ切って退く');
    // 遠くの島津の備も、前へ（東へ）一斉に駆け出す
    F.west[1].m.advance(70, 22, { charge: true });
    rt.after(30, () => F.west[1].m.rout({ hideAfter: 30 }));
    rt.say('足軽', '島津じゃ！　島津が逃げずに、こっちへ突っ込んでくる！', 3.5);
    rt.say('藤堂高虎', '前へ抜ける気か！　道に残る鉄砲に気をつけよ。命がけで撃つぞ', 5);
    // 義弘の本隊：道すじに沿って、東軍の中を南東へ抜ける
    const g = enemyGroup(rt, { faction: 'shimazu', name: '島津義弘の隊', anchor: { ...SHIMA_PATH[0] }, facing: Math.PI * 0.75, aggro: 4, width: 8, noRout: true, speed: 3.6, dmgMult: 0.8 },
      dress([{ type: 'busho', n: 1, o: { name: '島津義弘', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2a2626 } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 5 }], SHIMAZU));
    g.dmgMult = 0.5;   // 義弘の隊は戦うより抜けることを急ぐ
    g.order = 'path'; g.path = SHIMA_PATH.slice(1).map((q) => [q.x, q.z]); g.pathIdx = 0; g.march = false;
    // 11/18 23:00 クラウド 持ち主：足跡で義弘の隊が共通の頭に attack へ替えられ、673〜835秒 本人のまわり（50,55）に十五〜十九人で居座って抜けず、
    //   「島津義弘、戦場を脱す」が出ないまま act bot が避け続けた（島津の段の討ち取り0）。義弘は敵中を突っ切って伊勢路へ抜けた。道すじから外さない
    g.noAI = true;
    soften(g);
    F.yoshi = g; F.yoshiU = g.units[0];
    // 11/19：義弘の退き口は千五百ほどで敵中を抜けた。二十八人だけで抜けないように、後ろに島津の旗の列（本物の兵を軽く描く束・崩れず道について歩く）
    KIT.backOf(rt, g, { flag: 'shimazu', armor: SHIMAZU.armor, kind: 'mixed', w: 10, depth: 14, count: 90, gap: 4, seed: 159 });
    rt.marker('yoshi', unitPos(F.yoshiU), '島津義弘', { red: true });
    // 島津豊久の殿：義弘が抜けたあとの道に残り、追う者を食い止める（捨て奸）
    const R = enemyGroup(rt, { faction: 'shimazu', name: '島津豊久の殿', anchor: { x: -30, z: 14 }, facing: Math.PI * 0.75, fleeDir: { x: 1, z: 0.5 }, aggro: 10, width: 10, noRout: true, speed: 3.4, dmgMult: 0.65 },
      dress([{ type: 'busho', n: 1, o: { name: '島津豊久', horse: true, invuln: true, hat: 'kabuto_m', haori: 0x3a2a22 } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 8 }], SHIMAZU));
    // 豊久は捨て奸の間しばらく討たれない（殿が一瞬で崩れないように）
    rt.after(40, () => { for (const u of R.units) if (u.type === 'busho') { u.invuln = false; u.announced = false; } });
    R.order = 'path'; R.path = [[-10, 30], [16, 58]]; R.pathIdx = 0; R.march = false;
    R.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: 16, z: 58 }; gg.facing = -Math.PI * 0.6; gg.aggro = 16; };
    soften(R);
    F.toyo = R;
    KIT.backOf(rt, R, { flag: 'shimazu', armor: SHIMAZU.armor, kind: 'gun', w: 14, depth: 6, count: 70, seed: 154 });
    rt.obj('toyo', '島津豊久の殿を崩し、南の伊勢路へ退く島津勢を追う', 'main');
    // 島津は東軍の中を突っ切って退いた（藤堂・福島の手の前も抜けた）。先駆けの者が本人の組へ斬り込んでくる
    rt.after(12, () => { if (F.step === 4 && rushAt(rt, '島津の先駆け', { x: -18, z: -14 }, SHIMAZU, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }])) rt.say('足軽', '島津の先駆けが、こっちへ斬り込んでくる！　止めよ！', 3.5); });
    //   11/19 04:50：二の組は先駆けが四人を切ってから（先駆け十二・二の組八・豊久の殿の斬り込みが重なり、六歩内に敵二十人超で bot が動けなかった）
    const rush2 = () => { if (!(F.step === 4 && F.toyo && F.toyo.count)) return; if ((F.rush || []).some((g) => !g._rushOtani && g.name === '島津の先駆け' && g.count >= 4 && !g.routed)) { rt.after(5, rush2); return; } rushAt(rt, '道を切り開く島津の者', { x: -16, z: -12 }, SHIMAZU, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }]); };
    rt.after(70, rush2);
    rt.marker('toyo', centerOf(R), () => `島津豊久の殿・${moraleWord(R.morale)}`, { red: true, group: R });
    // 井伊直政が追う
    rt.after(26, () => {
      if (F.ending) return;
      const ii = allyGroup(rt, { faction: 'ii', name: '井伊直政の赤備え', anchor: { x: 22, z: -18 }, facing: Math.PI, width: 8, aggro: 12, noRout: true, speed: 4 },
        dress([{ type: 'busho', n: 1, o: { name: '井伊直政', invuln: true, horse: true, hat: 'kabuto', haori: 0 } }, { type: 'cavalry', n: 6 }, { type: 'samurai', n: 4 }], II));
      ii.order = 'move'; ii.dest = { x: 10, z: 50 };
      ii.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 50; };
      F.ii = ii;
      // 赤備えの騎馬が土煙を上げて続く
      KIT.backOf(rt, ii, { flag: 'ii', armor: II.armor, kind: 'cavalry', w: 18, depth: 14, count: 90, gap: 3, seed: 155 });
      rt.say('伝令', '井伊直政殿の赤備えが、島津を追って駆けてまいります！', 3.5);
      rt.after(22, () => {
        if (F.ending) return;
        rt.banner('井伊直政、鉄砲に撃たれる', '島津の捨て奸に、馬上で傷を負う'); rt.say('足軽', '赤備えの大将が撃たれた！', 2.5);
        // 撃たれた直政は家来に囲まれて陣へ下がる（史実。敵の前で突っ立たせない）
        rt.after(4, () => {
          if (F.ending || !ii.count) return;
          rt.say('井伊の侍', '殿を陣へお下げせよ！　赤備え、殿を囲め！', 3);
          ii.order = 'move'; ii.dest = { x: 128, z: -6 }; ii.speed = 3.4;   // 11/19 03:00 持ち主：(70,6) は本人から六、七十歩でカメラに写り、着いた所で消えた（K153）。桃配山の内府の陣の方（東の端）まで下げてから消す ii.aggro = 3; ii.seekRange = 0;
          // 11/19：本隊を陣で消すと、後ろの赤備えの控え（backOf）が「崩れ」て逃げ散っていた（backTick は数0を崩れと見る）。控えは崩さずに一緒に下げて消す
          ii.onArrive = (gg) => { for (const q of F.backs || []) if (q.g === gg && !q.gone) { q.gone = true; q.b.visible = false; } for (const u of gg.units) if (u.alive) rt.army.despawn(u); };
        });
      });
    });
  },

  finishWin(rt, how) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.unmark('toyo'); rt.unmark('yoshi');
    rt.banner('関ヶ原の戦、終わる', how);
    rt.say('藤堂高虎', `${nm(rt)}、生き延びたな。天下の分かれ目に立ったこと、忘れるでないぞ`, 4.5);
    rt.say('伝令', '島津義弘、伊勢路へ抜けた由。討ち取った首は、数え切れませぬ', 3.5);
    sfx('horagai', 0.8);
    rt.player.u.invuln = true;   // 戦が終わったあとの流れ弾で重傷にならないように
    // 東軍の勝鬨：西軍の旗の消えた野で、組ごとに旗の下へ寄って三度。桃配山の家康の陣からも
    for (const [t, v] of [[3, 0.55], [5.8, 0.8], [8.6, 1]]) rt.after(t, () => { if (rt.ended) return; try { rt.army.celebrate(0); } catch (e) { /* なし */ } sfx('sig_eiei', v); });
    rt.after(6, () => rt.say('伝令', '桃配山の内府様の陣から、勝鬨の声が上がっておりまする！', 3.5));
    rt.after(10, () => rt.say('藤堂の侍', '朝に始まって昼過ぎには片が付いた……これほどの大戦、聞いたこともない', 3.6));   // K355：大乱関ヶ原6巻の聞き書き「前代未聞」
    rt.finish({}, 14);
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    // 11/21 05:40 クラウド 持ち主（K493・K564 重さ）：描かずの数え（十秒ごと）で生きた本物の兵が段1 の間 262・253・252・268（70〜190秒・上限 250）。
    //   道の始めの行軍の列（飾りの味方十八人・march_open.js）が戦の終わりまで陣の後ろに立ち続けていた。段1からは、列の誰もが本人の七十m の外なら外す（k06 関ヶ原・真田丸と同じ手）
    const mg = F.marchG;
    if (mg && !F._mgOff && (F.step || 0) >= 1 && rt.player.u.alive && (F._mgT = (F._mgT || 0) - dt) <= 0) {
      F._mgT = 1;
      const us = (mg.units || []).filter((u) => u.alive && !u.gone);
      if (!us.length) F._mgOff = true;
      else if (!us.some((u) => Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 70)) { for (const u of us) { try { rt.army.despawn(u); } catch (e) { /* そのまま */ } } F._mgOff = true; }
      // 列は着いた所（陣の後ろ）が本人の斬り合いの五〜三十m 内で、敵が五十人寄っても槍を構えて立つだけだった（noAI・aggro 0）。
      //   着いた後に敵が十五m 内へ来たら、ふつうの味方の備として戦わせる（立ち尽くす人形を消し、討たれた分だけ数も減る）
      else if (mg._marchDone && !F._mgWake) {
        const c = mg.center?.();
        if (c && rt.army.units.some((u) => u.alive && u.team !== mg.team && !u.isStruct && !u.fleeing && Math.hypot(u.pos.x - c.x, u.pos.z - c.z) < 15)) {
          F._mgWake = true;
          mg.noAI = false; mg.fixed = false; mg.aggro = 9; delete mg.seekRange; mg.noRing = false; mg.arriveNoncombat = false; mg.order = 'hold'; mg.formation = 'yari';
          for (const u of us) { u.noTarget = false; u.aiT = 0; }
        }
      }
    }
    // 11/18 クラウド持ち主（act bot 860秒 達成・本人の討ち取り12／味方96「斬り合う相手が少なくて退屈」）：
    //   本人から二十五歩より遠い味方の隊は刃を半分に（遠くで先に討ち切らず、本人の行く先に斬り合う相手を残す。木津川口と同じ）。
    //   本人のそばの隊・本人の組・敵の数と強さは同じ。島津の退き口（段4〜）と、本人の命が半分を切った間は元の刃に戻す（act bot 749秒に豊久の殿で倒れた）
    if ((F.farT = (F.farT || 0) - dt) <= 0) {
      F.farT = 1;
      for (const g of F.rush || []) if (g.focus && (!rt.player.u.alive || rt.player.u.hp < rt.player.u.maxHp * 0.6 || g.routed)) { g.focus = null; g._staRest = false; for (const u of g.units) if (u.target === rt.player.u) { u.target = null; u.aiT = 0; } }
      // 11/18 19:40 クラウド 持ち主：描かずの足跡で、押し合い〜島津の段の本人の気力が 1〜30 のまま（六m 内に敵2〜21人・突き0）。
      //   本人を的にした組が、息を整えに味方の後ろへ下がる本人をどこまでも追い、気力が戻らなかった。気力が二割を切った間は的を外して
      //   そばの藤堂の兵と斬り合わせ、五割半まで戻ったら、また本人を的にする（数・傷の重さは同じ。命六割で放すのも同じ）
      const PL = rt.player, winded = PL.sta < PL.maxSta * 0.22, fresh = PL.sta > PL.maxSta * 0.55;
      for (const g of F.rush || []) {
        if (g.focus && winded) { g.focus = null; g.focusMeFirst = false; g._staRest = true; for (const u of g.units) if (u.target === PL.u) { u.target = null; u.aiT = 0; } }
        else if (g._staRest && fresh && !g.routed && g.count && PL.u.alive && PL.u.hp >= PL.u.maxHp * 0.6) { g._staRest = false; g.focus = PL.u; g.focusMeFirst = true; }
      }
      const me = rt.player.u.team, pu = rt.player.u, half = !F.ending && (F.step || 0) < 4 && pu.hp > pu.maxHp * 0.5;
      for (const g of rt.army.groups) {
        if (g.team !== me || g.isPlayerSquad || g.routed || !g.count) continue;
        if (g._skDm === undefined) g._skDm = g.dmgMult ?? 1;
        const c = g.center();
        g.dmgMult = half && c && Math.hypot(c.x - p.x, c.z - p.z) > 25 ? g._skDm * 0.5 : g._skDm;
      }
    }
    // 朝霧：はじめは一町先も見えず、しだいに晴れる（world の霧の距離を上から書きかえる）
    // 霧は時とともに晴れる。隊を倒した速さで天気を早送りしない。
    const ft = rt.t;
    F.fog = ft < FOG_T0 ? 1 : Math.max(0, 1 - (ft - FOG_T0) / (FOG_T1 - FOG_T0));
    if (F.fog > 0) {
      const f = rt.scene.fog, k = F.fog;
      // 手前は乳白に沈め、奥の旗の列（80〜110m）は濃さの違う影として層で透かす
      f.near = Math.min(f.near, lerp(40, 0, k));
      f.far = Math.min(f.far, lerp(230, 112, k));
      if (!F.fogCol) F.fogCol = f.color.clone();
      if (rt.world.dayClock) F.fogCol.copy(rt.world.look.fog);
      f.color.copy(F.fogCol).lerp(MIST, k);
      // 空と遠くの山も霧に沈める（霧の上に青空が抜けて見えないように）
      const W = rt.world, U = W.skyMat && W.skyMat.uniforms;
      if (U && U.top && U.bottom) {
        if (!F.skyCol) F.skyCol = { top: U.top.value.clone(), bottom: U.bottom.value.clone() };
        if (W.dayClock) { F.skyCol.top.copy(W.look.top); F.skyCol.bottom.copy(W.look.fog); }
        U.top.value.copy(F.skyCol.top).lerp(MIST, k * 0.9);
        U.bottom.value.copy(F.skyCol.bottom).lerp(MIST, k);
      }
      if (W.mountU) { W.mountU.mist.value = Math.max(W.mountU.mist.value, k); W.mountU.hazeCol.value.copy(f.color); }
      for (const m of (W.mountains && W.mountains.children) || []) if (m.material.uniforms && m.material.uniforms.haze) m.material.uniforms.haze.value = Math.max(m.material.uniforms.haze.value, k);
    } else if (F.fogCol && !F.fogClear) {
      F.fogClear = true;
      rt.scene.fog.color.copy(F.fogCol);
      const U = rt.world.skyMat && rt.world.skyMat.uniforms;
      if (U && F.skyCol) { U.top.value.copy(F.skyCol.top); U.bottom.value.copy(F.skyCol.bottom); }
      rt.banner('霧が晴れた', '関ヶ原の全体が見える');
      if (!F.strayed) rt.objDone('stay');
      rt.say('足軽', '霧が晴れた……！　見ろ、山という山に旗が並んでおる', 3.5);
    }
    KIT.backTick(rt);
    if (F.ending) return;
    // 霧の間、藤堂の旗から離れたか
    if (F.step >= 1 && F.fog > 0.25 && !F.strayed) {
      const d = Math.hypot(p.x - F.todoU.pos.x, p.z - F.todoU.pos.z);
      F.strayT = d > 24 ? (F.strayT || 0) + dt : 0;
      if (F.strayT > 4) {
        F.strayed = true;
        rt.violation('霧の中で持ち場を離れた', ['藤堂高虎', '戻れ！　霧の中ではぐれるなと申したはずじゃ！']);
        rt.objFail('stay');
      }
    }
    volleyTick(rt, dt, F.vol);
    // 霧が晴れてから寝返りまで：北の野の戦況が使番で次々に届く。西軍が強く、東軍は押し切れない（kaito 11/9 の前半の不安）
    if (F.step === 1 && F.fog <= 0) {
      const BARK = [[20, '伝令', '福島正則殿、宇喜多勢と押し合うも、宇喜多勢、崩れませぬ！'], [55, '伝令', '笹尾山の石田勢、なお健在！　島左近が黒田・田中の手を押し返しております！'],
        [75, '伝令', '黒田の鉄砲衆が横の丘から撃ちかけ、島左近、倒れました！　石田の前が揺れております！'],   // 11/21 クラウド 持ち主（K494 名場面：島左近が黒田の鉄砲に倒れる。docs/events/sekigahara.md）
        [95, '藤堂の侍', '南宮山の毛利勢は、なお動かず。……あの大軍が下りてくれば、こちらが挟まれる'], [115, '藤堂高虎', '脇坂・朽木・小川・赤座とは、とうに話がついておる。……なのに、まだ一人も動かぬ'], [135, '足軽', '小早川は何をしておる。山の上から見ておるだけじゃ'],
        [155, '足軽', '霧で敵も味方も分からぬ……足もとが田でなく畠なのが救いじゃ'],   // K355（11/17 クラウド k365-26）：大乱関ヶ原6巻（藤堂が付けた寝返りの約束が静まる・関ヶ原は畠）を自分の言葉で
        [175, '伝令', '宇喜多勢、福島殿の手を押し戻しました！　福島殿の旗が下がっております！'], [215, '藤堂高虎', '……動かぬな、松尾山は。このままでは、西軍に押し切られるぞ'],
        [238, '伝令', '大谷刑部殿、輿の上から下知し、我らの前を三度押し返しております！'],   // K494 名場面：病の大谷吉継が輿の上から指図する
        [262, '伝令', '桃配山の内府様、床几を立たれ、松尾山をにらんでおられまする！'], [312, '伝令', '大谷勢、動かず崩れず！　石田勢も、なお健在！']];
      const at = rt.t - FOG_T1;
      F.barkI = F.barkI || 0;
      while (F.barkI < BARK.length && at >= BARK[F.barkI][0]) { const b = BARK[F.barkI++]; rt.say(b[1], b[2], 4); }
    }
    depthTick(rt, dt);
    // 11/18 20:40 クラウド 持ち主：act bot が「避」（survive）の間は b_depth の depthBot が回らず、flags.dpBack が気力・命が満ちても解けず、
    //   押し合いの段で 236〜449秒ずっと退いたまま突き0（連絡帳 2424）。解く決まり（気力五割五分・手当て不要）は b_depth と同じで、ここでも毎コマ見る（bot の印だけ・遊ぶ人には効かない）
    if (F.dpBack) {
      const pl = rt.player, pu = pl && pl.u;
      if (pu && pl.sta > pl.maxSta * 0.55 && !(pu.hp < pu.maxHp * 0.5 && pl.treatmentLeft > 0 && !pl.bandaged)) F.dpBack = false;
    }
    // 11/18 クラウド：押し返しの段の波（北・南へ回る大谷勢・三度目）に囲まれて act bot が三回に一度倒れた（騎馬の一太刀48）。
    //   傷の重さ（K360⑦）は変えず、三人以上に囲まれたら近くの藤堂・京極の組を二つ駆け寄らせて囲みを解く（越前・金ヶ崎と同じ mob_help.js）
    if (F.step >= 1 && F.step <= 4) mobHelp(rt, 'skMob');   // 11/18 22:30 島津の段にも（足跡 602〜710秒、島津の殿・先駆けの四十人に一人で囲まれて避け続けた）
    // 11/18 クラウド 持ち主：段A の間、霧の中で出た大谷方の将（平塚・戸田・木下・大谷吉勝・討てない馬上の将）が名乗って本人に挑み（army_think の一騎打ち）、
    //   逃げる本人を東の奥（x=+96）まで馬で追い続けた。act bot は段A の大半を追われて走り、守る段が〔失〕・討ち取り0（描かずの通し 350〜436秒）。
    //   退いて備を立て直す隊の将は、持ち場から22歩より出たら追うのをやめて旗の下へ戻る（近くの本人へ打ち掛かるのは今のまま）
    if (F.dpOn && F.step === 1 && rt.player) {
      const PP = rt.player.u;
      for (const g of [F.hira, F.toda, ...(F.extra || [])]) {
        if (!g || gone(g)) continue;
        for (const u of g.units) {
          if (!u.alive || u.type !== 'busho' || u.target !== PP) continue;
          const a = g.anchor;
          if (Math.hypot(u.pos.x - a.x, u.pos.z - a.z) < 22) continue;
          u.target = null; u.watch = null; u.moveTo = { x: a.x, z: a.z }; u.aiT = 4;
          if (rt.army._challenger === u) rt.army._challenger = null;
        }
      }
    }
    // 11/10：済んだ段の寄せ（b_depth.js の routAll で気が 0）が、頭の侍が生きているため崩れず、東の後ろまで遊び手を追って討っていた。
    //   気の挫けた西軍の組は、大谷の陣（西）へ退かせる
    if ((F.sweepT = (F.sweepT || 0) - dt) <= 0) {
      F.sweepT = 2;
      // 11/19 05:45 クラウド 持ち主：足跡（2秒ごと）で、大谷の陣の前へ退くはずの平塚・戸田の隊の者が 105〜250秒も本人の二十五歩内に十〜三十人残り、
      //   act bot はその者らを迫る敵と見て「避」で走り続け、気力が百→一割に落ちて押し返しの段の討ち取りが0〜2（三十秒後の一度きりの寄せ直しでは足りない）。
      //   寝返りの段まで、本人の三十歩内で退き先から三十歩より遠い者は、二秒ごとに的を外して退き先へ歩かせる（数は同じ・寝返りの段で前へ戻る）
      if (F.step === 1) {
        const P0 = rt.player.u.pos;
        for (const g of [F.hira, F.toda, ...(F.extra || [])]) {
          if (gone(g) || !g._skTo) continue;
          const to = g._skTo;
          for (const u of g.units) {
            // 11/21 クラウド 持ち主（K492「敵がいても攻めてこない」）：act bot 134秒、本人のすぐそばの戸田の者が退き先へ歩くだけで六秒何もしなかった。
            //   本人の十歩内の者は退かせず、そのまま本人に斬りかかる（十〜三十歩の者だけ退かせる）
            //   将（戸田勝成・馬上）も持ち場の近くで本人の三、四歩に立ったままだった（act bot 131秒）ので、退き先の遠近に関わらず十歩内なら狙わせる
            const dP = Math.hypot(u.pos.x - P0.x, u.pos.z - P0.z);
            if (!u.alive || dP > 30) continue;
            if (dP < 10) { if (!u.target && rt.player.u.alive && !u.fleeing) { u.moveTo = null; u.target = rt.player.u; u.aiT = 0; } continue; }
            if (Math.hypot(u.pos.x - to.x, u.pos.z - to.z) <= 30) continue;
            u.target = null; u.watch = null; u.moveTo = { x: to.x, z: to.z + (u.slot || 0) % 7 - 3 }; u.aiT = 2;
          }
        }
      }
      const og = F.otaniH && F.otaniH.general;
      if (og && og.alive && og.group) {
        const gg = og.group;
        if (gg.order !== 'hold') { gg.order = 'hold'; gg.anchor = { ...F.otaniHome }; }
        if (og.mounted && rt.army.setMounted) rt.army.setMounted(og, false);
      }
      // 段で出た組を覚えておき、その段が済んで次の段へ移ったら（今の段の組でなくなったら）退かせる
      const cur = (F.dp && F.dp.on && F.dp.cur && F.dp.cur.groups) || [];
      const seen = F.dpSeen || (F.dpSeen = new Set());
      for (const g of cur) seen.add(g);
      for (const g of rt.army.groups) {
        if (g.team !== 1 || g.routed || !g.count || g._skBack || !seen.has(g) || cur.includes(g)) continue;
        g._skBack = true;
        const c = g.center(), z = Math.max(20, Math.min(100, c.z));
        g.order = 'move'; g.dest = { x: -96, z }; g.aggro = 2; g.speed = 3; g.formation = null;
        g.onArrive = (gg) => offStage(rt, gg);
        // 11/18 クラウド：act bot 435秒、退く南へ回る大谷勢の足軽が柵の手前で行き先(-94,26)へ20秒動かなかった。25秒で着かない組は崩れて西の山へ散る（共通の崩れの形）
        rt.after(25, () => { if (g.count && !g.routed && g.order === 'move') { g.fleeDir = { x: -1, z: 0 }; g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; } });
      }
    }
    // 11/18 22:40 クラウド 持ち主：霧が晴れた後の押し合い（段A・約三百三十秒）で act bot の討ち取り0〜1が三本中二本。足跡では本人が藤堂の旗から
    //   二、三十歩離れた所（戸田の横・大谷の陣の前）で味方が居らず「避」のまま息切れ（気力一割）して逃げ回っていた。寝返り・島津の段と同じく、
    //   藤堂の二陣が本人のそばへ寄って並ぶ（数は同じ）
    if (F.step === 1 && F.fog <= 0 && !F.ending) this.mateNear(rt);
    // 11/19 00:45 クラウド 持ち主：討ち取りの揺れ（3〜19）の訳＝足跡（3秒ごと）で藤堂の二陣・寺沢・京極の手（八〜十人ずつ）が霧の段の 160秒までに
    //   討ち尽くされ、その後は本人の八歩内に味方が0〜1人＝bot が「孤立」と見て島津の段まで避け続けた。藤堂は二千五百・京極は三千の大軍で
    //   新手を次々に入れたと伝わる。そばへ寄る組が三人を切ったら、東の後ろから藤堂・京極の新手（侍二・足軽九）を出して本人のそばへ寄せる
    //   （本物の兵の数が二百二十を超える間は出さない・七組まで）
    if (F.step >= 1 && F.step <= 4 && !F.ending) this.allyFresh(rt);
    if (F.step >= 1 && F.step <= 2 && F.fog <= 0 && !F.ending) this.enemyFresh(rt);
    if (F.dpOn || F.ending) return;
    if (F.step === 1) {
      rt.objProgress('main', `平塚の隊 ${F.hira.count}人・戸田の隊 ${F.toda.count}人`);
      // 霧が晴れて押し合いが続いたころ、あるいは平塚が弱ったら小早川が動く
      // 大谷勢は粘る：崩れかけたら、大谷の本陣から次の隊が出てくる（小早川が動くまで）
      const weak = [F.hira, F.toda, ...(F.extra || [])].filter((g) => !gone(g)).reduce((a, g) => a + g.count, 0);
      if (weak < 26 && (F.extra || []).length < 2 && !(F.reinT > rt.t - 25)) { F.reinT = rt.t; this.reinforce(rt); }
      if ((F.extra || []).length >= 2 && [F.hira, F.toda, ...F.extra].every(gone)) {
        if (!F.fogFast) { F.fogFast = true; rt.say('藤堂高虎', '大谷の先手は崩れた。霧が晴れるまで、旗の下で備を直せ', 3.5); }
      }
      if (F.fog <= 0 && rt.t > FOG_T1 + 14 && !F.dpA) {
        // 11/18 クラウド：押し返しの段の波が、まだ前に残る平塚・戸田・木下・大谷吉勝の隊と重なり、act bot が 224秒に騎馬と侍に囲まれて倒れた。
        //   残る隊は消さず（数は同じ）、大谷の陣の前（西）へ一度退いて備を立て直させ、押し返しの波として来る形にする（大谷勢は押しては退いたと伝わる）
        for (const g of [F.hira, F.toda, ...(F.extra || [])]) {
          if (gone(g)) continue;
          // 11/18 クラウド（二度目）：x=-62 では段A の「戸田の横」（-24,84）の近くに残り、act bot が 383〜402秒に大谷吉勝・木下頼継の隊に討たれた（受けた傷の半分）。
          //   大谷の陣の柵の前（x=-84）まで退かせ、構える間合いを狭くする（数は同じ。寝返りの段で前へ戻る）
          const to = { x: -96, z: g.anchor.z };   // 11/19 07:50：x=-84 では押し返しの波の後ろの大谷の控え（-78,60 の束）の中に十〜十五人が埋もれた（act bot 186秒）。束の後ろへ
          g.front = { ...g.anchor };   // 寝返りの段の始めに、元の押し合いの場へ戻す（turn）
          g._skTo = to;
          // 11/18 22:50 クラウド 持ち主：足跡では退くはずの平塚・戸田が 130〜300秒「move」のまま本人の二十五歩内に十数人ずつ残り（共通の頭が attack に替えた時も）、
          //   段A の波と重なって本人のまわりの敵が七十〜百人になり、act bot が避け続けた。退く間は共通の頭から外し（noAI）、斬り結ばずに下がる（寝返りの段で戻す）
          g.order = 'move'; g.dest = { ...to }; g.speed = 2.8; g.aggro = 0; g.noAI = true; g.focus = null;
          for (const u of g.units) if (u.alive && u.type !== 'busho') { u.target = null; u.watch = null; }
          g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { ...to }; gg.aggro = 6; gg.formation = 'yari'; gg.facing = Math.PI / 2; };
          rt.after(30, () => { if (!gone(g) && g.order === 'move' && F.step === 1) { for (const u of g.units) if (u.alive && Math.hypot(u.pos.x - to.x, u.pos.z - to.z) > 30) u.moveTo = { x: to.x, z: to.z + (u.slot || 0) % 7 - 3 }; } });
        }
        // 11/18 16:40 クラウド：霧の中で本人へ突きかかった平塚・戸田の槍の者の残りは、押し返しの波と重ならないよう西の大谷の陣へ退いて消える
        for (const g of F.rush || []) {
          if (!g._fog || !g.count || g.routed) continue;
          const c = g.center();
          g.focus = null;
          g.order = 'move'; g.dest = { x: -112, z: Math.max(20, Math.min(100, c.z)) }; g.aggro = 2; g.speed = 3; g.formation = null;
          g.onArrive = (gg) => offStage(rt, gg);
          rt.after(25, () => { if (g.count && !g.routed && g.order === 'move') { g.fleeDir = { x: -1, z: 0 }; g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; } });
        }
        // 11/18 クラウド：霧は105秒で晴れるのに、右上の一行が寝返り（約560秒）まで「霧の中、平塚・戸田の隊を押しとどめよ」のままだった。晴れたら言い替える
        rt.obj('main', '藤堂の手と並び、大谷勢の押し返しを凌げ', 'main');
        // 11/18 クラウド：退いた平塚の隊にピンが残り、段A の持ち場のピンと二つ並んだ（act bot「256秒 平塚為広の隊へ歩けず・最も近くて28m」）。退く間は外す（寝返りの段で戻す）
        rt.unmark('hira');
        this.deep(rt, 'A', () => this.turn(rt));
      }
    }
    if (F.step === 2) {
      const all = [F.hira, F.toda, ...(F.extra || [])];
      rt.objProgress('main', `大谷勢 ${all.reduce((a, g) => a + (gone(g) ? 0 : g.count), 0)}人`);
      if (all.every(gone)) this.collapse(rt);
      else if (rt.t - F.stepT > 160) this.collapse(rt);   // 頭（将）が生きている組は崩れない（army_groups.js の headUp）。山が動いてから三分で大谷勢は総崩れ（11/8：段2のまま15分を超えた）
      else if (rt.t - F.stepT > 130) { for (const g of all) { g.noRout = false; g.morale = 0; } }
      // 11/18 クラウド 持ち主：寝返りの段（160秒）で act bot の討ち取り0〜1。藤堂の手は後ろの旗の下に留まり、ピンの大谷方の前に出た本人の八歩内に味方が居らず、
      //   囲まれる前に退き続けた（命は満ちたまま）。藤堂の二陣が本人のそばへ寄って並ぶ（藤堂・京極の手はこの間も大谷勢と押し合っていたと伝わる。数は同じ）
      this.mateNear(rt);
      // 寝返りの前：大谷勢も、小早川がどちらへ付くか分からぬ間は押し合いを続ける
      if (!F.flipT && rt.t - F.stepT > 30 && !F.lookSaid) { F.lookSaid = true; rt.say('足軽', 'みな手を止めて、山を見ておる……', 3); }
    }
    // 11/18 22:30 クラウド 持ち主：act bot 774〜869秒の島津の段（約二百三十秒）で討ち取り0〜4。足跡（5秒ごと）では 602〜710秒ずっと「避」で、
    //   本人のそばに味方が居らず（藤堂の手は後ろの旗の下）、豊久の殿・先駆け・義弘の隊の四十人の中へ一人で入って息切れのまま逃げ回っていた。
    //   寝返りの段と同じく、藤堂の二陣（討たれていれば寺沢・京極の手）が本人のそばへ寄って並ぶ（藤堂の手も島津の退き口を追ったと伝わる。数は同じ）
    if (F.step === 4 && F.toyo && !gone(F.toyo)) this.mateNear(rt);
    if (F.step === 4) {
      const R = F.toyo;
      rt.objProgress('toyo', `豊久の殿 ${R.count}人`);
      const Y = F.yoshiU;
      // 11/19 02:58 クラウド 持ち主：足跡（act bot 六本）で義弘は段の終わりまでに x=150 へ届かず（本人から七十〜百三十歩）、「戦場を脱す」が一度も出なかった。
      //   道すじの半ば（藤堂の陣の前）を越えて本人から八十歩離れたら抜けたと知らせる（隊は道すじを歩き続け、x=150 の先で消す。目の前で消さない・K153）
      const P0 = rt.player.u.pos;
      if (Y && Y.alive && !F.yoshiOut && (Y.pos.x > 150 || (F.yoshi.pathIdx >= 2 && Math.hypot(Y.pos.x - P0.x, Y.pos.z - P0.z) > 80))) {
        F.yoshiOut = true;
        rt.unmark('yoshi');
        rt.banner('島津義弘、戦場を脱す', '敵中を突っ切り、伊勢街道へ');
      }
      if (F.yoshiOut && !F.yoshiHid && Y && Y.pos.x > 150) {
        F.yoshiHid = true;
        for (const u of F.yoshi.units) { u.alive = false; u.mesh.visible = false; }
      }
      // 11/18 19:45 クラウド 持ち主：義弘の隊（号令 path）の侍・足軽が本人のそばを素通りし、六秒何もしない（act bot 655秒）。
      //   義弘の隊の aggro を上げると隊ごと本人に群れて倒れた（4-16）ので、本人の五歩の内を抜ける者だけを一人ずつ捨て奸として道に残し、
      //   島津の先駆けの組（無ければ豊久の殿）に移して本人と斬り結ばせる（島津の退き口の捨て奸は、隊から数人ずつ残って追手を止めた）。この段で四人まで
      // 11/19 01:50 クラウド 持ち主：島津の段の討ち取りが 0〜4（act bot 三本）。六人まで・六歩半の内に広げる（一人ずつ・一秒あけは同じ）
      // 11/19 02:40 クラウド 持ち主：足跡（act bot 750秒）で義弘の隊が本人の真横を抜け、本人の六歩内に敵二十七人＝bot が「避」のまま捨て奸と斬り結べなかった。
      //   義弘の隊は道の前に本人が立っていたら、隊ごと横へ膨らんで避けて抜ける（斬り結ぶのは道に残る捨て奸だけ。島津は戦うより抜けるのを急いだ）
      const Yg = F.yoshi, yp = Yg && !F.yoshiOut && Yg.path && Yg.path[Yg.pathIdx];
      if (yp && rt.player.u.alive) {
        const a = Yg.anchor, P = rt.player.u.pos, dx = yp[0] - a.x, dz = yp[1] - a.z, dl = Math.hypot(dx, dz) || 1;
        const fx = dx / dl, fz = dz / dl, rx = P.x - a.x, rz = P.z - a.z, along = rx * fx + rz * fz, lat = rx * -fz + rz * fx;
        // 11/19 04:50 クラウド 持ち主：足跡（act bot 727〜782秒）で義弘の隊が本人の真上を抜け、六歩内に敵十六〜二十九人（隊の幅八・横十歩では避け切れない）＝
        //   bot が「囲まれた」と見て動けず島津の段の討ち取り0。避ける幅を横十四歩・前二十二歩に広げ、毎秒六歩で膨らむ（島津は戦うより抜けるのを急いだ）
        if (along > -14 && along < 22 && Math.abs(lat) < 14) { const s = (lat >= 0 ? -1 : 1) * 6 * dt; a.x += -fz * s; a.z += fx * s; }
      }
      if (!F.yoshiOut && F.yoshi && (F.stemaT = (F.stemaT || 0) - dt) <= 0 && (F.stemaN || 0) < 6 && rt.player.u.alive) {
        F.stemaT = 1;
        const P = rt.player.u, to = (F.rush || []).find((g) => !g._rushOtani && g.count && !g.routed) || (R.count && !R.routed ? R : null);
        // 11/19 02:30 クラウド 持ち主：本人が義弘の道から外れると六歩半の内を抜ける者が居らず、島津の段の討ち取りが0の回があった。
        //   段に入って二十秒、前の捨て奸から十五秒たっても次が出ない時は、本人に一番近い島津の者（二十四歩の内）を一人、道から外して寄せる
        const far = rt.t - F.stepT > 20 && rt.t - (F.stemaLast || 0) > 15;
        let u = null, best = far ? 24 : 6.5;
        if (to) for (const q of F.yoshi.units) {
          if (!q.alive || q.type === 'busho' || q.mounted) continue;
          const d = Math.hypot(q.pos.x - P.pos.x, q.pos.z - P.pos.z);
          if (d < best) { best = d; u = q; }
        }
        if (u) {
          F.stemaN = (F.stemaN || 0) + 1; F.stemaLast = rt.t;
          F.yoshi.units = F.yoshi.units.filter((q) => q !== u); u.group = to; u.slot = to.units.length; to.units.push(u); to.initial = Math.max(to.initial || 0, to.units.length);
          u.target = P; u.moveTo = null; u.aiT = 0;
          if (F.stemaN === 1) rt.say('足軽', '島津の者が一人、道に残って斬りかかってくる！　捨て奸じゃ！', 3.5);
        }
      }
      if (gone(R)) {
        rt.objDone('toyo'); rt.unmark('toyo');
        rt.award((t) => { t.special = { label: '退き口の追い討ち', pts: 25 }; }, '島津の殿を崩した');
        // 捨て奸の段（C）が済むまで、右の目標が全部済んだ時の自動の勝ち（battle.js の goalsDoneTick）を止めておく
        rt.tracker.main = null;
        this.deep(rt, 'C', () => { rt.tracker.main = true; this.finishWin(rt, '島津の殿を崩した。西軍は散った'); });
      } else if (rt.t - F.stepT > 80 && !F.toyoLast) {
        // 11/10：刻限で〔失〕にしない。殿の残りは最後に向き直って斬り込んでくる（豊久はこの日、殿で討ち死にした）
        F.toyoLast = true;
        for (const u of R.units) if (u.type === 'busho') u.invuln = false;
        R.order = 'attack'; R.seekRange = 80; R.aggro = 40; R.anchor = { x: rt.player.u.pos.x, z: rt.player.u.pos.z }; R.morale = Math.min(R.morale, 40);
        sfx('taiko', 0.9);
        rt.say('島津豊久', '中務少輔豊久、ここにあり！　一人も通さぬ！', 4);
        rt.say('藤堂高虎', '殿が最後の斬り込みじゃ！　受け止めて崩せ！', 3.5);
      } else if (F.toyoLast && rt.t - F.stepT > 140 && !F.toyoEnd) {
        // それでも残れば、追いついた井伊の赤備えと押し包んで崩す（戦は止めない）
        F.toyoEnd = true;
        R.noRout = false; R.morale = 0;
        // 井伊の赤備えは撃たれた直政を囲んで下がった後（上の rt.after）。藤堂の手が押し包む
        for (const g of [F.todo, F.todo2]) if (g && g.count) { g.order = 'attack'; g.seekRange = 80; }
        // 豊久はこの日、殿で討ち死にした（頭が生きている組は崩れないので、追い手の槍で討たれたことにする）
        const ty = R.units.find((u) => u.type === 'busho' && u.alive);
        if (ty) { ty.invuln = false; ty.hp = 0; rt.army.kill(ty, null); }
        // 倒れて手当ての間の頭が残っても、殿の残りはここで崩れて南東へ散る
        R.routed = true; R.order = 'flee';
      }
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    KIT.carrion(rt, v);
    if (v.type === 'busho' && v.team === 1) {
      // 自分で討った時は「討ち取ったり」の大見出しが出るので、重ねない
      if (!(k && k.isPlayer)) rt.banner(`${v.name}、討死`, v.name === '島津豊久' ? '島津の殿、崩れる' : '大谷勢の将');
      if (v.group) v.group.morale -= 30;
      if (v.group === F.toyo) { F.toyo.noRout = false; }
    }
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.hira) rt.say('足軽', '平塚の隊が崩れたぞ！', 2.5);
    if (g === F.toda) rt.say('足軽', '戸田の隊も崩れた！', 2.5);
  },
};

// 両軍の総勢（戦国大名に合わせ、東軍 七万八千、西軍 八万四千）。小早川と四家が寝返ると、西軍から二万が抜ける
sekigahara.holdUnstack = true;   // 11/18 ト四（関ヶ原 act bot 221秒 家康の本陣 (142,-1) で旗本17人が hold のまま32組重なる）：共通の渦の散らしを使う

sekigahara.force = (rt) => {
  const F = rt.flags;
  const turned = F.flipT ? 15600 + (F.w4n || 0) * 1050 : 0;
  const b = Math.max(1500, 84000 - (F.ek || 0) * 90 - turned - (F.step >= 3 ? 30000 : 0));
  return { a: 78000 - (F.ak || 0) * 45, a0: 78000, b, b0: 84000 };
};
sekigahara.canSkip = (rt) => (rt.phase === 'fog' && rt.t > 3 ? '開戦まで待つ' : '');
sekigahara.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
sekigahara.sides = { a: { name: '東軍', mon: 'tokugawa' }, b: { name: '西軍', mon: 'ishida' } };
sekigahara.date = (rt) => {
  const F = rt.flags;
  const w = F.fog > 0.6 ? '朝霧' : F.fog > 0 ? '霧が晴れていく' : '晴';
  const time = rt.world.dayClock ? rt.world.dayClock.label : (rt.t < 120 ? '朝' : '昼');
  return `慶長五年九月十五日　秋・${w}・${time}`;
};
sekigahara.history = '慶長五年九月十五日、徳川家康の東軍と、石田三成らの西軍が美濃の関ヶ原で戦った。朝は深い霧で、霧が晴れかけたころ、井伊直政・松平忠吉の抜け駆けで戦が始まったと伝わる。大谷吉継の隊は藤堂高虎・京極高知らとよく戦ったが、松尾山の小早川秀秋が東軍に寝返って大谷勢の横を突き、脇坂・朽木・小川・赤座の四家も続いた。大谷吉継は自害し、西軍は崩れた。島津義弘は敵中を突破して退き（島津の退き口）、甥の島津豊久はその殿で討ち死にした。追った井伊直政は鉄砲で傷を負った。家康が松尾山へ撃ちかけたという「問鉄砲」の話は、後の書物に出るもので確かではない。';

// 素直な遊び手：霧の間は藤堂の旗のそばで戦い、寝返りのあとは大谷勢へ、最後は島津の殿へ
sekigahara.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  if (u.hp < u.maxHp * 0.6) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const lead = F.todoU.pos;
  if (b.botRest) { inp.guardHold = false; if (F.step >= 3) goTo(p, inp, 40, 26, 2); else goTo(p, inp, lead.x + 14, lead.z, 2); return; }
  const range = F.step >= 2 ? 12 : 7;
  // 島津が抜ける間は、義弘の本隊には自分からかからず、殿（豊久）を狙う
  // 大谷勢が崩れるまでは、藤堂の旗の近くの敵だけを相手にする（北の宇喜多の合戦へ迷い込まない）
  const leash = F.fog > 0.25 ? 20 : F.step < 3 ? 32 : Infinity;
  const e = b.army.nearestEnemy(u, range, (o) => !o.fleeing && !o.invuln && Math.hypot(o.pos.x - lead.x, o.pos.z - lead.z) < leash && (o.group !== F.yoshi || Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 3));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  if (F.step === 4 && F.toyo && F.toyo.count) { const c = F.toyo.center(); goTo(p, inp, c.x, c.z, 2); return; }
  if (F.step === 2 && F.fog <= 0) { const t = [F.hira, F.toda, ...(F.extra || [])].find((g) => !gone(g)); if (t) { const c = t.center(); goTo(p, inp, c.x, c.z, 2); return; } }
  goTo(p, inp, lead.x + (F.step >= 2 ? 3 : 5), lead.z + 2, 3);
};

// ---------------- 一つの戦を濃くする段（b_depth.js） ----------------
// 大谷勢は寡兵でも粘り強く、藤堂・京極の手を何度も押し返したと伝わる。霧が晴れると、天満山の鉄砲も並んで撃ちかける
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n });
const gunLine = (name, from, n, o = {}) => ({ name, from, list: [uS(1), uG(n)], formation: 'line', seek: 70, mass: 90, kind: 'gun', ...o });
const shima = (list) => ({ flag: 'shimazu', armor: SHIMAZU.armor, list: dress(list, SHIMAZU) });
function skCtx(rt, which) {
  const F = rt.flags;
  // 11/18 クラウド：act bot 4回で3回、段A の押し返し（200〜231秒）で倒れた（足軽・侍の傷・息切れで囲まれる）。傷の重さ（K360⑦）は変えず、
  //   藤堂の手は二千五百の大軍（大谷の手の数倍）だったので、段A は藤堂の新手の組が本人のそばに加わる（後ろの作り物の控えは付けない・kaito AA）
  const aid = which === 'A' ? { aid: { name: '藤堂の新手', faction: 'tokugawa', flag: 'todo', list: [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }] }, aidBacking: false } : {};
  // 11/18 クラウド：act bot が押し返しの段の 210秒で、南へ回る大谷勢と三度目の押し返しに同時に囲まれて倒れた（前にも230秒で一回）。兵の数は減らさず、一太刀を少し軽く・三度目を8秒遅らせて重ならないように
  // 11/18 クラウド：K360⑦ の後、段A の波の間で命が一〜二割のまま戻らず倒れた（act bot 306秒）。立て直しの段で八割五分まで息を整える（賤ヶ岳・越前と同じ。傷の重さは同じ）
  // 11/18 クラウド 持ち主：戸田の横の〔失〕6/12。深手で退く先を「敵から十四歩離れた一番近い味方」で探すと、敵が持ち場に群れる時は
  //   遠い寺沢・脇坂の手まで下がり、持ち場48m の内に31.5秒いられなかった。守る段の退き先は持ち場から（輪＋26歩）の内の味方だけにする
  return { ...aid, faction: 'otani', flag: 'otani', armor: OTANI.armor, dmg: 0.56, restHp: 0.85, mass: 280, look: (l) => dress(l, OTANI),
    botBackAllowed: (b, x, z) => { const c = b.flags.dp && b.flags.dp.cur; return !c || c.s.kind !== 'hold' || !c.at || Math.hypot(x - c.at.x, z - c.at.z) < (c.botRadius || 14) + 26; },
    friends: () => [F.todo, F.kyo, F.todo2, F.tera, F.kobaG, F.w4].filter((g) => g && g.count && !g.routed) };
}
// A 霧が晴れた後：大谷勢の押し返し → 京極の手を助けるか → 天満山の鉄砲
function skA() {
  // 11/19 07:40 クラウド 持ち主：act bot 782秒（十三分）で押し返しの段（119〜419秒）の討ち取り3・「退屈」。波の数と大きさは同じまま、
  //   三つの持ち場の刻を 90/70/70 → 68/55/55 秒、刻限を 130/120/105 → 96/88/80 秒に詰め、波の間を縮めて寄せを続けて来させる
  //   （持ち場は敵が残る限り刻限まで続き、毎回刻限で終わっていた。戦の長さを 4〜7 分の決まりへ寄せる）
  const at = { x: FRONT.x + 4, z: FRONT.z };
  return [
    rest({ dur: 7, heal: 0.3, say: [['藤堂高虎', '霧が晴れた。……大谷の備が、まるで崩れておらぬ'], ['足軽', '大谷刑部は病で目も見えぬと聞いたが……']] }),
    hold({ at, dur: 68, r: 15, title: '大谷勢の押し返し', sub: '寡兵の大谷勢が、藤堂の手を押し返しに来る', label: '藤堂の旗', obj: '藤堂の旗の前で、押し返しに来る大谷勢を受けよ',
      say: [['藤堂高虎', '押し返されるな！　一度下がれば、二度と前へは出られぬぞ！']],
      waves: [
        { t: 4, say: ['足軽', '大谷の旗が、一斉に押し出してきた！'], foes: () => [{ name: '押し返す大谷勢', from: { x: -60, z: 52 }, list: [uS(3), uA(14)], mass: 380, noRout: 30 }] },
        { t: 16, say: ['藤堂高虎', '天満山の麓に鉄砲衆が並んだ！　伏せよ！'], foes: () => [gunLine('天満山の鉄砲衆', { x: -54, z: 24 }, 9)] },
        { t: 30, say: ['足軽', '北の畦から回り込んでくる！'], foes: () => [{ name: '北へ回る大谷勢', from: { x: -40, z: 14 }, off: { x: 0, z: -12 }, list: [uS(2), uA(11)], mass: 280 }] },
        { t: 44, say: ['足軽', '南からもじゃ！　京極の手の間を割ってくる！'], foes: () => [{ name: '南へ回る大谷勢', from: { x: -44, z: 96 }, off: { x: 0, z: 12 }, list: [uS(2), uA(11)], mass: 280 }] },
        { t: 60, say: ['藤堂高虎', '三度目の押し返しじゃ！　凌げ！'], foes: () => [{ name: '大谷の三度目の押し返し', from: { x: -64, z: 60 }, list: [uS(3), uA(13), uG(2)], mass: 360 }] },
      ],
      reward: '大谷勢の押し返しを三度凌いだ', noRefill: true, limit: 96, lost: ['藤堂高虎', '押し下げられた……！　旗を立て直せ！'] }),
    rest({ dur: 7, bark: '立て直し：藤堂の旗の下に組を集める', say: [['伝令', '京極高知殿の手が、戸田勝成の隊に押されておりまする！']] }),
    // 11/11：選ぶ札はやめる（Simple・kaito 10/23）。spec_1109 の「右翼を救援せよ」として、藤堂高虎の下知で京極の手を助けに南へ回る一本の任務にする
    // 11/10：斬り合いの数で決めると、刻限で〔失〕になりがちだった。戸田の横の持ち場を京極の手と支える段にする（行った者は果たせる）
    hold({ at: { x: -24, z: 84 }, dur: 55, r: 18, title: '戸田の横', sub: '京極の手を押す戸田勝成の隊の横腹', label: '戸田の横', obj: '戸田の横へ回り、京極の手と並んで大谷方を押し返せ',
      say: [['藤堂高虎', '組を連れて南へ回れ。戸田の横を突き、京極の手を助けよ']],
      waves: [
        { t: 3, say: ['足軽', '戸田の隊の横腹じゃ！　槍を入れよ！'], foes: () => [{ name: '京極の手を押す大谷方', from: { x: -50, z: 92 }, list: [uS(2), uA(9)], mass: 300 }, gunLine('戸田の鉄砲', { x: -52, z: 76 }, 5)] },
        { t: 24, say: ['足軽', '大谷の本陣から、また新手じゃ！'], foes: () => [{ name: '大谷の本陣の新手', from: { x: -74, z: 88 }, list: [uS(1), uA(8)], mass: 300 }] },
        // 11/19 05:40 クラウド 持ち主：足跡（2秒ごと）で一の波・二の波が 308〜350秒に崩れて逃げ、本人の二十五歩内の敵が逃げる三〜八人だけ＝
        //   持ちこたえる刻の後半三十秒、斬り合う相手が居なかった。戸田勝成はこの日、京極・藤堂の手と何度も押し合って討ち死にした。
        //   戸田の隊が立て直してもう一度押す（数は二の波と同じ・七十八秒で他の組と一緒に退く）
        { t: 40, say: ['足軽', '戸田の隊が立て直して、また押してくるぞ！'], foes: () => [{ name: '立て直した戸田の隊', from: { x: -54, z: 90 }, list: [uS(1), uA(8)], mass: 300 }] },
        // 11/18 クラウド：act bot 7回とも、頭の侍が生きている組（鉄砲の列など）が崩れず、刻限120秒で〔失〕になった。
        //   持ちこたえる刻（70秒）の後は、残った戸田方を大谷の陣へ退かせる（京極・藤堂に押し返されて戸田の隊が退いたと伝わる）
        { t: 62, foes: () => [], if: (rt) => {
          const left = rt.army.groups.filter((g) => g.count && !g.routed && g.team !== rt.player.u.team && ['京極の手を押す大谷方', '戸田の鉄砲', '大谷の本陣の新手', '立て直した戸田の隊'].includes(g.name));
          for (const g of left) { g.noRout = false; g.morale = 0; g.order = 'retreat'; }   // 退きの号令で頭が立っていても崩れる（army_morale.js headUp）。崩れの形は共通のまま
          if (left.length) rt.say('足軽', '戸田の隊が退いていく！　京極の手が持ち直したぞ！', 3.5);
          return false;
        } },
      ],
      reward: '京極の手を助けた', noRefill: true, limit: 88 }),
    // 寝返りの前の一番の不安（kaito 11/9：9:30〜10:30 任務「大谷隊の前進を止めろ」）。大谷勢が総がかりで前へ出る。山はまだ動かない
    rest({ dur: 8, heal: 0.4, say: [['伝令', '大谷勢、総がかりで藤川を越えてまいります！'], ['藤堂の侍', '……このままでは、西軍が勝つのではないか']] }),
    hold({ at, dur: 55, r: 20, title: '大谷勢の前進', sub: '大谷刑部の備が、総がかりで押し出してくる', label: '藤堂の旗', obj: '藤堂の旗の前で、大谷勢の前進を止めよ',
      say: [['藤堂高虎', 'ここで退けば、内府様の陣まで押し込まれる！　一歩も引くな！']],
      waves: [
        { t: 3, say: ['足軽', '大谷の旗が、また前へ出てきた！'], foes: () => [{ name: '前へ出る大谷勢', from: { x: -62, z: 56 }, list: [uS(2), uA(10)], mass: 360, noRout: 25 }] },
        { t: 24, say: ['足軽', '松尾山は……まだ動かぬのか！'], foes: () => [{ name: '大谷の新手', from: { x: -58, z: 74 }, off: { x: 0, z: 8 }, list: [uS(1), uA(9), uG(2)], mass: 300 }] },
      ],
      reward: '大谷勢の前進を止めた', noRefill: true, limit: 80, lost: ['藤堂高虎', '押し込まれた……！　旗の下へ戻れ！'] }),
  ];
}
// B 西軍の崩れ：宇喜多の敗兵を追うか、大谷の陣の跡か
function skB() {
  return [
    rest({ dur: 8, heal: 0.3, say: [['足軽', '勝った……のか'], ['藤堂高虎', 'まだじゃ。崩れた者は、死にものぐるいで斬りかかってくる']] }),
    // 11/18 クラウド：選ぶ札（北の宇喜多か西の大谷か）をやめる（Simple・kaito 10/23「選ぶ画面は足さない」）。藤堂の手の相手は大谷方なので、大谷の陣の跡の一本にする
    fight({ at: { x: -70, z: 70 }, title: '大谷の陣の跡', sub: '大谷刑部の首を隠す者たちが、最後の槍を構える', obj: '大谷の陣の跡で、最後の大谷勢を崩せ',
      say: [['藤堂高虎', '大谷の陣じゃ。……刑部の首を探せ'], ['足軽', 'あそこじゃ！　土を掘っておる者がおる！']],
      foes: () => [{ name: '大谷の最後の者', from: { x: -90, z: 66 }, list: [uS(4), uA(8)], mass: 160, noRout: 25 }],
      later: [{ t: 36, title: '鉄砲', sub: '陣の跡の鉄砲', say: ['足軽', '陣の柵の陰から撃ってくる！'], foes: () => [gunLine('大谷の最後の鉄砲', { x: -92, z: 80 }, 7)] }],
      max: 140, reward: (t) => { t.special = { label: '大谷の陣の跡を掃った', pts: 20 }; }, rewardLabel: '大谷の陣の跡を掃った',
      onEnd: (rt) => rt.say('藤堂高虎', '……刑部の首は、見つからぬか。湯浅五助が埋めたとも聞く。それでよい', 4) }),
  ];
}
// C 豊久の殿の後：捨て奸 → 伊勢街道まで追うか、止まるか
function skC() {
  return [
    // 11/10：選ぶ札をやめ（Simple）、寝返りの後を短くする（kaito 11/9：寝返りは15分中の10〜11分）。退き口の道で捨て奸を受け、二の捨て奸まで
    rest({ dur: 5, heal: 0.3, say: [['足軽', '島津の者が、道に座り込んで鉄砲を構えておる……'], ['藤堂高虎', '捨て奸じゃ。死ぬ気で撃ってくる。道を塞げ、追うのは井伊殿に任せよ']] }),
    hold({ at: { x: 18, z: 62 }, dur: 45, r: 12, title: '捨て奸', sub: '道に座り込んだ島津の者が、死ぬ気で撃ちかける', label: '島津の退き口', obj: '島津の退き口の道で、座り込んで撃つ捨て奸を受けよ',
      waves: [
        { t: 3, foes: () => [{ name: '斬りかかる島津の者', from: { x: 50, z: 84 }, ...shima([uS(2), uA(7)]), mass: 120 }, gunLine('捨て奸の鉄砲', { x: 44, z: 90 }, 6, shima([uS(1), uG(6)]))] },
        { t: 22, say: ['足軽', 'その先の道にも、また座り込んでおる！'], foes: () => [gunLine('二の捨て奸', { x: 56, z: 96 }, 6, shima([uS(1), uG(6)]))] },
        // 11/18 クラウド：act bot が終わりに「斬り合う相手が少なくて退屈」（14分で討ち取り15人に届かず）。捨て奸は撃ち終えると槍を取って斬り込んだと伝わる。
        //   二の捨て奸の後ろに座っていた者が立って斬り込む小さな組を一つ足す（鉄砲の数・段の長さは同じ）
        { t: 30, say: ['足軽', '撃ち終えた者が、槍を取って斬り込んでくる！'], foes: () => [{ name: '槍を取った捨て奸', from: { x: 52, z: 92 }, ...shima([uS(2), uA(6)]), mass: 120 }] },
      ],
      reward: '島津の捨て奸を受けきった', noRefill: true, limit: 90 }),
  ];
}

export { sekigahara };
