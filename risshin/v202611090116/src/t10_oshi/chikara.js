// ======================================================================
// 忍城攻め　始めの段「力攻め」（0〜3分）と「丸墓山へ退く」　docs/toyo15_plan_1108.md の 13
// 史実：六月の初め、三成はまず力で城の口へ寄せたが、沼と深田に足を取られ、土手一本の道で上から撃たれて進めなかった。
//   秀吉の下知もあり、水攻め（石田堤）に切り替える。
// 遊び：浅瀬の土手を石田勢の先手と進み、城の外の柵に取り付く。柵の守りを崩しても城から新手が次々来て、
//   佐間口の塀の鉄砲が土手を撃ちすくめる。三成の使番が「退け」を伝え、丸墓山の本陣へ退く。本陣で水攻めが決まり、その夜の普請へ。
//   同じ時、北の長野口でも寄せ手が押し返されている（軽い作りの乱戦）。湖の向こうの岸には寄せ手の別の陣（軽い大軍）。
// 入れ方：b_t10_oshi.js の setup が start(rt, C) を、update が tick(rt, dt, C) を呼ぶ。C は本体の座標と道具。
// ======================================================================
import { allyGroup, enemyGroup, nm } from '../bhelp.js';
import { koshisaku, nobori } from '../props.js';
import { clash } from '../b_sekigahara.js';
import { flagTexture } from '../textures.js';
import { sfx } from '../audio.js';

const LIMIT = 175;
// 城の鉄砲は当たれば痛いが、一発では倒れない強さに（b_sekigahara.js の soften と同じ）
const soften = (g) => { for (const u of g.units) if (u.type === 'gun') u.dmg *= 0.4; return g; };   // 柵の段の長さの限り（秒）。過ぎたら使番が退けを伝える

// 浅瀬の土手の向き（浅瀬の手前→城の口）と、城の外の柵の位置
function geom(C) {
  const dx = C.GATE.x - C.FORD.x, dz = C.GATE.z - C.FORD.z, L = Math.hypot(dx, dz);
  const d = { x: dx / L, z: dz / L }, p = { x: -d.z, z: d.x };
  const saku = { x: C.FORD.x + d.x * 22, z: C.FORD.z + d.z * 22 };
  return { d, p, saku };
}

export function start(rt, C) {
  const F = rt.flags, W = rt.world;
  if (F.step >= 1) return;
  F.step = 1; F.stepT = rt.t;
  rt.setPhase('chikara');
  rt.obj('main', C.MISSIONS[0], 'main');
  const { d, p, saku } = geom(C);
  const K = F.chi = { saku, d, p, t0: rt.t };
  // 城の外の柵：土手を横切る杭の柵。真ん中に木戸の口を空ける
  for (const s of [-1, 1]) {
    const a = { x: saku.x + p.x * s * 1.5, z: saku.z + p.z * s * 1.5 }, b = { x: saku.x + p.x * s * 7, z: saku.z + p.z * s * 7 };
    const seg = [a.x, a.z, b.x, b.z];
    const st = rt.army.addStruct({ seg, nx: -d.x, nz: -d.z, hp: 99999, maxHp: 99999, team: 1, name: '柵' });
    st.mesh = koshisaku(W, seg, { h: 1.5 }); rt.scene.add(st.mesh);
  }
  rt.scene.add(nobori(W, saku.x + d.x * 3 + p.x * 4, saku.z + d.z * 3 + p.z * 4, 'narita', 4.5));
  // 柵の守り（城の口の外に出た成田の兵）
  const back = { x: saku.x + d.x * 3, z: saku.z + d.z * 3 };
  K.foe = enemyGroup(rt, { faction: 'narita', name: '城の外の柵の守り', anchor: back, facing: Math.atan2(-d.x, -d.z), fleeDir: { x: d.x, z: d.z }, width: 6, noRout: true, formation: 'line', morale: 85,
    order: 'hold', aggro: 9, seekRange: 10, dmgMult: 0.22 },
  C.dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }, { type: 'bow', n: 2 }], C.HOJO));
  K.n0 = K.foe.units.length;
  soften(K.foe);
  // 佐間口の塀の鉄砲：土手を寄せる者を上から撃つ（当たりは軽く、煙と音で）
  const ya = Math.atan2(C.GATE.z - C.NI.z, C.GATE.x - C.NI.x);
  K.shot = [ya + 0.45, ya - 0.45].map((wa) => enemyGroup(rt, { faction: 'narita', name: '佐間口の塀の鉄砲', anchor: { x: C.NI.x + Math.cos(wa) * (C.NI.r - 3), z: C.NI.z + Math.sin(wa) * (C.NI.r - 3) },
    facing: Math.PI * 0.25, width: 4, noRout: true, order: 'hold', aggro: 40, fixed: true, dmgMult: 0.06 }, C.dress([{ type: 'gun', n: 3 }, { type: 'bow', n: 1 }], C.HOJO)));
  // 石田勢の先手：主人公と並んで土手を進む（深田の泥で足が遅い）
  const to = { x: saku.x - d.x * 5, z: saku.z - d.z * 5 };
  K.ally = allyGroup(rt, { faction: 'ishida', name: '石田勢の先手', fullStrength: true, anchor: { x: C.RAIDAT.x + 2, z: C.RAIDAT.z + 2 }, facing: Math.atan2(d.x, d.z), width: 6, aggro: 8, noRout: true,
    order: 'move', dest: to, speed: 3.3, dmgMult: 0.55 },   // 泥で遅いが、主人公一人を先に柵へ着かせない
  C.dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], C.ISHI));
  K.ally.ai = false;
  K.ally.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 14; q.aggro = 14; };
  C.KIT.backOf(rt, K.ally, { flag: 'ishida', armor: C.ISHI.armor, kind: 'spear', w: 12, depth: 8, count: 120, gap: 4, seed: 10907 });
  // 湖の向こうの岸の寄せ手の陣（寄せ手二万三千のうち、長束・中江・北関東の衆）。遠くの軽い作り
  if (W.addDistantArmy) {
    W.addDistantArmy({ x: -170, z: -40, w: 26, d: 12, count: 220, facing: Math.PI * 0.6, armor: C.ISHI.armor, flagTex: flagTexture('ishida'), kind: 'mixed', host: false, seed: 10911 });
    W.addDistantArmy({ x: 30, z: -170, w: 30, d: 12, count: 240, facing: -Math.PI * 0.6, armor: C.ISHI.armor, flagTex: flagTexture('asano'), kind: 'mixed', host: false, seed: 10912 });
  }
  // 北の長野口でも、同じ時に寄せ手が押し返されている（軽い作りの乱戦。寄っても本物に替えない）
  K.clash = clash(rt, { x: -150, z: -150, facing: Math.PI * 0.25, w: 22, gap0: 0, seed: 10913, host: false, noRout: true, killRate: 0.015, maxDrift: 2,
    A: { flag: 'ishida', armor: C.ISHI.armor, count: 60, flagRate: 0.25 }, B: { flag: 'narita', armor: C.HOJO.armor, count: 40, flagRate: 0.2, guns: true } });
  K.clash?.go?.();
  K.clash?.push?.('B', 0.4);
  rt.army.play('shout', C.RAIDAT, 1.1);
  rt.say('石田勢の侍', 'かかれ！　土手を伝って、城の外の柵へ寄せよ！', 3);
}

// 段の終わり：先手を下げ、柵の守りは柵の内に留める（追っては来ない）
function retreat(rt, C) {
  const F = rt.flags, K = F.chi;
  if (F.step >= 2) return;
  F.step = 2; F.stepT = rt.t;
  rt.setPhase('taikyaku');
  rt.obj('main', C.MISSIONS[1], 'main');
  for (const g of [K.foe, K.foe2]) if (C.live(g)) { g.order = 'hold'; g.anchor = { x: K.saku.x + K.d.x * 3, z: K.saku.z + K.d.z * 3 }; g.aggro = 8; g.seekRange = 8; g.onArrive = null; g.ai = false; g.fixed = true; g.fire = false; for (const u of g.units) u.target = null; }
  // 退く背を撃たない（主人公が撃たれ続けて倒れた）。fire=false は近くの本人には撃つので、玉を切らせる（army_ranged.js の gunAmmo）
  for (const g of [K.foe, K.foe2, ...(K.shot || [])]) if (g) { g.fire = false; for (const u of g.units) if (u.type === 'gun') u.gunAmmo = 0; }
  if (C.live(K.ally)) { K.ally.order = 'move'; K.ally.dest = { x: C.CAMP.x - 4, z: C.CAMP.z - 8 }; K.ally.speed = 3.4; K.ally.aggro = 0; K.ally.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; }; for (const u of K.ally.units) u.target = null; }
  rt.say('使番', '退け！　三成様の御下知じゃ。力攻めはならぬ、丸墓山の本陣へ戻れ！', 3.6);
  rt.after(4.2, () => rt.say(nm(rt), '土手一本では、寄せても寄せても上から撃たれる……', 3.2));
  rt.after(16, () => { if (F.step === 2) rt.say('石田勢の足軽', '深田に足を取られて、半分も戻れぬわ', 3); });
  rt.after(30, () => { if (F.step === 2) rt.say('使番', '北の長野口、下忍口の寄せも退いた。どの口も土手一本じゃ', 3.4); });
  rt.after(46, () => { if (F.step === 2) rt.say(nm(rt), '丸墓山の上に、三成様の旗が見える', 2.8); });
}

// 本陣に着いた：水攻めが決まる。別の口の知らせ。その夜の普請へ
function council(rt, C) {
  const F = rt.flags, K = F.chi;
  if (K.council) return;
  K.council = true;
  rt.army.play('shout', C.MARU, 1);
  const me = nm(rt);
  rt.say('石田三成', '深田と沼で、寄せる道が土手一本しか無い。力では落ちぬ', 3.4);
  rt.after(3.8, () => rt.say('使番', '小田原より。山中城は半日で落ち、殿下は小田原を囲まれた。韮山はなお抵抗との事', 3.8));
  rt.after(8, () => rt.say('大谷吉継', '殿下の御下知は水攻めじゃ。城のまわりに堤を築き、川の水で囲む', 3.6));
  rt.after(12, () => rt.say(me, 'あの長い沼を、堤で囲むのでござるか', 3));
  rt.after(15.4, () => rt.say('石田三成', '人夫を集めよ。今夜から堤じゃ。城は夜討ちで邪魔をしよう。人夫を守れ', 3.6));
  rt.after(19.4, () => {
    if (F.step !== 2) return;
    // 時が飛ぶ（その夜）。柵の段の兵は片付け、主人公と組は区の堤の上へ
    for (const g of [K.foe, K.foe2, ...(K.shot || []), K.ally]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
    if (K.clash?.mesh) K.clash.mesh.visible = false;   // 長野口の乱戦はこの段だけ
    C.warp(rt, C.START.x, C.START.z, Math.atan2(-1, -1));
    rt.banner('その夜　堤の普請', '浅瀬の口で、夜討ちを防げ');
    C.def.night(rt);
  });
}

export function tick(rt, dt, C) {
  const F = rt.flags, K = F.chi;
  if (!K) return;
  const P = rt.player.u;
  if (F.step === 1) {
    const down = K.foe.units.filter((u) => !u.alive || u.gone || u.fleeing).length;
    if (!K.contact && (C.near(P.pos, K.saku, 16) || C.near(K.ally.center?.() || K.ally.anchor, K.saku, 9))) {
      K.contact = rt.t;
      rt.say('石田勢の足軽', '泥が深い！　足が抜けぬ……', 2.8);
      rt.after(3, () => rt.say('石田勢の侍', '柵を越えよ！　木戸の口へ詰めよ！', 2.8));
    }
    // 柵の守りが半ば崩れると、城の口から新手が土手を来る（城は落ちない）
    if (!K.foe2 && (down >= K.n0 * 0.5 || (K.contact && rt.t - K.contact > 70))) {
      K.newT = rt.t;
      const at = { x: K.saku.x + K.d.x * 16, z: K.saku.z + K.d.z * 16 };
      K.foe2 = enemyGroup(rt, { faction: 'narita', name: '城から出た新手', anchor: at, facing: Math.atan2(-K.d.x, -K.d.z), fleeDir: { x: K.d.x, z: K.d.z }, width: 5, noRout: true, formation: 'line', morale: 90,
        order: 'move', dest: { x: K.saku.x + K.d.x * 2, z: K.saku.z + K.d.z * 2 }, speed: 3.4, aggro: 6, dmgMult: 0.22 },
      C.dress([{ type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], C.HOJO));
      soften(K.foe2);
      K.foe2.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 12; q.aggro = 12; };
      rt.army.play('eshout', at, 1.2);
      rt.say('石田勢の足軽', '城から新手じゃ！　土手の先から次々来る！', 3);
      rt.after(5, () => rt.say('使番', '北の長野口も押し返されたぞ！', 2.8));
    }
    // 新手と揉み合って一息のち、佐間口の塀から一斉に撃たれ、先手が崩れる。使番が退けを伝える
    const down2 = K.foe2 ? K.foe2.units.filter((u) => !u.alive || u.gone || u.fleeing).length : 0;
    if (!K.volley && K.foe2 && (rt.t - K.newT > 50 || down2 >= K.foe2.units.length * 0.6 || rt.t - F.stepT > LIMIT)) {
      K.volley = rt.t;
      sfx('volley', 1); rt.army.play('volley', C.GATE, 1.4);
      // 土手の先手が何人も撃ち倒される（一つの城の口に寄るだけで、これだけ倒れる）
      let n = 0;
      for (const u of K.ally.units) if (u.alive && !u.gone && !u.name && n < 4 && C.near(u.pos, K.saku, 20)) { u.invuln = false; u.hp = 0; rt.army.kill(u, null); n++; }
      rt.say('石田勢の足軽', '塀の上から一斉に撃ってくる！　土手の上では隠れる所が無い！', 3.2);
    }
    if (K.volley && rt.t - K.volley > 4) retreat(rt, C);
  } else if (F.step === 2) {
    // 柵の守りは柵の内から出ない
    for (const g of [K.foe, K.foe2]) if (C.live(g)) { g.order = 'hold'; for (const u of g.units) if (u.alive && !u.gone && !C.near(u.pos, K.saku, 9)) u.target = null; }
    // 本陣の印まで戻ってから軍議へ。遠くに残ったまま時刻だけで済ませない。
    if (!K.council && P.alive && C.near(P.pos, C.MARU, 16)) council(rt, C);
  }
}

export function pin(rt, C) {
  const F = rt.flags, K = F.chi;
  if (!K) return undefined;
  if (F.step === 1) return { x: K.saku.x, z: K.saku.z, r: 6 };
  if (F.step === 2) return K.council ? null : { x: C.MARU.x, z: C.MARU.z, r: 16 };
  return undefined;
}

// bot：柵の前で近い敵を突く。退けが出たら浅瀬の口を経て丸墓山へ
export function bot(b, inp, T, C) {
  const p = b.player, u = p.u, F = b.flags, K = F.chi;
  if (!K || F.step > 2) return false;
  if (F.step === 1) {
    const e = b.army.nearestEnemy(u, 14, (o) => !o.fleeing && !o.invuln && C.near(o.pos, K.saku, 12));
    if (e) {
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > 2.2) T.goTo(p, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
      T.patientStrike(p, inp, e, d, true);
      return true;
    }
    T.goTo(p, inp, K.saku.x - K.d.x * 3, K.saku.z - K.d.z * 3, 2);
    return true;
  }
  if (K.council) { inp.k.delete('KeyW'); return true; }
  if (!K.viaMouth && C.near(u.pos, C.RAIDAT, 6)) K.viaMouth = true;
  if (!K.viaMouth && C.near(u.pos, K.saku, 40)) T.goTo(p, inp, C.RAIDAT.x, C.RAIDAT.z, 4);
  else T.goTo(p, inp, C.MARU.x, C.MARU.z, 6);
  return true;
}
