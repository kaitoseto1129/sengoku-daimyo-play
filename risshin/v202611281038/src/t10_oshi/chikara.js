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
import { takatabaRow } from '../castle_parts.js';

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
  // 共通の近接判断より先に持ち場へ戻す。狙いを消すだけでは次の判断で追手に戻る。
  W.def.combatSpace = (_army, u) => {
    if (F.step !== 2 || !u.oshiGuardPost) return null;
    const P = rt.player.u;
    if (Math.hypot(P.pos.x - saku.x, P.pos.z - saku.z) > 6 ||
        Math.hypot(u.pos.x - saku.x, u.pos.z - saku.z) > 8) return u.oshiGuardPost;
    return null;
  };
  // 力攻めでも竹束で矢玉を避けられるよう、土手の両脇へ置く。中央の通り道は空ける。
  for (const back of [8, 18]) for (const side of [-1, 1]) {
    const pts = [2.4, 4.2].map((offset) => [saku.x - d.x * back + p.x * side * offset, saku.z - d.z * back + p.z * side * offset]);
    takatabaRow(rt, pts, { spacing: 2, side: -side });
  }
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
    order: 'hold', aggro: 9, seekRange: 10, dmgMult: 0.14 },
  C.dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 3 }, { type: 'bow', n: 2 }], C.HOJO));
  K.n0 = K.foe.units.length;
  soften(K.foe);
  // 佐間口の塀の鉄砲：土手を寄せる者を上から撃つ（当たりは軽く、煙と音で）
  const ya = Math.atan2(C.GATE.z - C.NI.z, C.GATE.x - C.NI.x);
  K.shot = [ya + 0.45, ya - 0.45].map((wa) => enemyGroup(rt, { faction: 'narita', name: '佐間口の塀の鉄砲', anchor: { x: C.NI.x + Math.cos(wa) * (C.NI.r - 6), z: C.NI.z + Math.sin(wa) * (C.NI.r - 6) },
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
export function retreat(rt, C) {
  const F = rt.flags, K = F.chi;
  if (F.step >= 2) return;
  F.step = 2; F.stepT = rt.t;
  rt.setPhase('taikyaku');
  rt.obj('main', C.MISSIONS[1], 'main');
  // 待機でも共通の近接判断は十五歩まで寄せ直す。守兵も柵の城側へ下がり、追撃を終える。
  for (const [i, g] of [K.foe, K.foe2].entries()) if (C.live(g)) {
    g.order = 'retreat'; g.dest = { x: K.saku.x + K.d.x * (6 + i * 6), z: K.saku.z + K.d.z * (6 + i * 6) };
    g.stay = true; g.directOrders = true; g.aggro = 0; g.seekRange = 0;
    // 11/17 クラウド act bot：退く背に柵の守りの弓が当たり続け77秒で倒れた（弓67）。退く間は刃も矢も浅く
    g.dmgMult = Math.min(g.dmgMult ?? 1, 0.1);
    g.onArrive = null; g.ai = false; g.fixed = false; g.fire = false;
    // 11/18 見回り（cloud-18 act bot 81秒）：持ち場を slot%6 で決めていたため、六人目からは前の者と同じ点になり、
    //   城から出た新手の九人が (-75,-85) で二人ずつ重なって止まった。六人ずつ列を作り、二列目は城側へ一歩半下げる
    for (const u of g.units) {
      const side = (u.slot % 6 - 2.5) * 1.1, back = Math.floor(u.slot / 6) * 1.5;
      u.oshiGuardPost = { x: g.dest.x + K.p.x * side + K.d.x * back, z: g.dest.z + K.p.z * side + K.d.z * back };
      u.target = null; u.moveTo = u.oshiGuardPost; u.aiT = 0;   // 11/18 チ四：持ち場の点を個々の行き先にも（bot 106秒：新手九人が同じ点へ退いて重なった）
    }
  }
  // 二つの守りを同じ要へ集めず、それぞれの持ち場から柵を守る。
  // 柵際で深手のまま退く本人を、柵の守りの侍が八歩の内で斬り続けた（11/14 クラウドゆ act bot：退きの下知の後 67秒・73秒に背を斬られ倒れた）。
  //   守りは柵の口の三歩だけを守り、退き始めの四秒は本人に刃が届かない
  { const pu = rt.player?.u; if (pu?.alive && rt.army?.time != null) pu.graceUntil = Math.max(pu.graceUntil || 0, rt.army.time + 4); }
  // 11/9 三巡：それでも近い本人には「撃つな」の下知を越えて弓・鉄砲が撃ち、退く背に矢玉が重なって倒れた（bot 109秒・113秒）。退く間は下知を守らせる
  if (rt.world?.def) { K.strictWas = rt.world.def.strictFireOrders; rt.world.def.strictFireOrders = true; }
  // 柵の段の外の組（塀の上の鉄砲など）も、退く間は撃たない（bot 125秒：20〜28 歩先の鉄砲で倒れた）
  const me = rt.player.u.team; K.fireWas = [];
  for (const g of rt.army.groups) if (g.team !== me && g.fire !== false) { K.fireWas.push(g); g.fire = false; }
  // 狙いを外すだけでは、既に振り出した刃や構えた矢玉が退く本人へ当たる。
  for (const g of rt.army.groups) if (g.team !== me) for (const u of g.units) {
    u.atk = null; u.swing = null; u.bind = null; u.charging = false;
  }
  // 射撃停止は strictFireOrders で守る。矢玉をゼロにすると刀へ持ち替え、退く背を追う。
  if (C.live(K.ally)) {
    const g = K.ally;
    // 前衛も下知どおり丸墓山へ退く。低地の陣への直進では沼を横切り、主人公と離れてしまう。
    g.order = 'path'; g.path = [[C.FORD.x, C.FORD.z], [C.RAIDAT.x, C.RAIDAT.z], ...C.DIKE2]; g.pathIdx = 0;
    g.formation = 'column'; g.roadColumn = true; g.followColumnRoad = true; g.width = 2;
    // 到着後も共通の突撃で城へ引き返さない。
    g.stay = true; g.directOrders = true; g.retreatOnly = true; g.speed = 3.4; g.aggro = 0; g.seekRange = 0;
    g.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; };
    for (const u of g.units) { u.target = null; u.watch = null; u.atk = null; u.swing = null; u.bind = null; u.charging = false; u.moveTo = null; u.aiT = 0; }
  }
  // 11/18 クラウド21（K281：退く段で60m内の敵が数人で、大軍に追い返された重みが無い）：柵の内で勝鬨をあげる城兵を、退く間だけ置く。
  //   本人へは出ない・撃たない・狙えない（退く背を斬られて倒れる回を戻さない）。本物の兵の決まり（250人ほど）の余りの内の十四人。夜の段で消す
  if (!K.toki) {
    const at = { x: K.saku.x + K.d.x * 9, z: K.saku.z + K.d.z * 9 };
    K.toki = enemyGroup(rt, { faction: 'narita', name: '柵の内で鬨をあげる城兵', anchor: at, facing: Math.atan2(-K.d.x, -K.d.z), width: 7, noRout: true, formation: 'line',
      order: 'hold', fixed: true, aggro: 0, seekRange: 0, fire: false, morale: 100, ai: false },
    C.dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }], C.HOJO));
    if (K.toki) { K.toki.stay = true; K.toki.directOrders = true; for (const u of K.toki.units) { u.noTarget = true; u.invuln = true; } }
    rt.after(1.5, () => { if (F.step === 2) rt.army.play('eshout', at, 1.2); });
  }
  rt.say('使番', '前衛を引け！　三成様の御下知じゃ。力攻めはならぬ、丸墓山の本陣へ戻れ！', 3.6);
  rt.after(4.2, () => rt.say(nm(rt), '土手一本では、寄せても寄せても上から撃たれる……', 3.2));
  rt.after(16, () => { if (F.step === 2) rt.say('石田勢の足軽', '深田に足を取られて、半分も戻れぬわ', 3); });
  // 11/17 K355（センゴク一統記5巻の備中高松の水攻め・忍城の失敗）：高松を見た者は、堤一つの切れで湖が寄せ手を呑むと知っていた
  rt.after(21, () => { if (F.step === 2) rt.say('石田勢の古参', '備中高松の水攻めを見た。堤が一つ切れれば、溜めた水はこちらの陣を呑むぞ', 3.4); });
  rt.after(30, () => { if (F.step === 2) rt.say('使番', '北の長野口、下忍口の寄せも退いた。どの口も土手一本じゃ', 3.4); });
  rt.after(46, () => { if (F.step === 2) rt.say(nm(rt), '丸墓山の上に、三成様の旗が見える', 2.8); });
  // K358（act bot：退く道の後半に45秒なにも起きなかった）。道中の声を足す
  rt.after(64, () => { if (F.step === 2 && !K.council) rt.say('石田勢の足軽', '振り返るな。城の者は柵から出て来ぬ', 2.8); });
  rt.after(84, () => { if (F.step === 2 && !K.council) rt.say('使番', '本陣で御評定じゃ。大谷様、長束様も丸墓山に上がられた', 3.2); });
  rt.after(104, () => { if (F.step === 2 && !K.council) rt.say(nm(rt), 'あの古い塚の上が本陣か……あと少しじゃ', 2.8); });
}

// 本陣に着いた：水攻めが決まる。別の口の知らせ。その夜の普請へ
function council(rt, C) {
  const F = rt.flags, K = F.chi;
  if (K.council) return;
  K.council = true;
  rt.army.play('shout', C.MARU, 1);
  const me = nm(rt);
  rt.say('石田三成', '深田と沼で、寄せる道が土手一本しか無い。力では落ちぬ', 3.4);
  rt.after(4.2, () => rt.say('使番', '小田原より。山中城は半日で落ち、殿下は小田原を囲まれた。韮山はなお抵抗との事', 3.8));
  // 絵図を見て、短く決める（docs/oshi_spec_1109.md：三成を無能にしない。地形を見て戦場を作り変える人）
  rt.after(10.5, () => rt.say('石田三成', '……水を入れる。', 2.6));
  rt.after(13.4, () => rt.say('大谷吉継', '川の水か。城のまわりの低地を、堤で囲めばよい。自然の堤と微高地を繋げば、早い', 3.8));
  rt.after(19.3, () => rt.say('長束正家', '人足は近在から米と銭で集めまする。土と俵と材木も', 3.2));
  rt.after(23.6, () => rt.say(me, 'あの沼を、堤で囲むのでござるか……', 2.8));
  rt.after(27, () => rt.say('石田三成', '今夜から普請じゃ。城は夜討ちで邪魔をしよう。人足を守れ', 3.4));
  // 11/19 k365-cloud-41：評定の七言を字数の長さどおりに離し、夜へ移るのを25.4→32秒（描かずの通しで167〜181秒に字幕が13〜14秒遅れていた）
  rt.after(32, () => {
    if (F.step !== 2) return;
    // 時が飛ぶ（その夜）。柵の段の兵は片付け、主人公と組は区の堤の上へ
    for (const g of [K.foe, K.foe2, ...(K.shot || []), K.ally]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
    if (K.clash?.mesh) K.clash.mesh.visible = false;   // 長野口の乱戦はこの段だけ
    C.warp(rt, C.START.x, C.START.z, Math.atan2(-1, -1));
    rt.banner('その夜　石田堤の普請', '浅瀬の口で、堤を築く者たちを守れ');
    C.def.night(rt);
  });
}

export function tick(rt, dt, C) {
  const F = rt.flags, K = F.chi;
  if (!K) return;
  const P = rt.player.u;
  // 11/17 クラウド act bot：柵の段と退く段で六戦に三度、矢玉と刃が重なって倒れた（47〜119秒）。初めの段は深手から息を継げる（三割を切ったら毎秒少し戻る）
  if (P?.alive && F.step <= 2 && P.hp < P.maxHp * 0.3) P.hp = Math.min(P.maxHp * 0.3, P.hp + P.maxHp * 0.04 * dt);
  // 退く段（②）で一割を切ったら、背を追う刃と矢は通さない（act bot 108秒：退く背を侍に斬られ続けて倒れた）
  if (P?.alive && F.step === 2 && P.hp < P.maxHp * 0.1 && rt.army?.time != null) P.graceUntil = Math.max(P.graceUntil || 0, rt.army.time + 0.5);
  // 11/18 クラウド act bot：柵の段（力攻めは無理と知る段）の74秒、柵の守りの侍の一太刀と鉄砲で倒れて戦が終わった。
  //   柵と退きの段（①②）だけは命の三割で止める（打たれて退く段。ここで戦を終わらせない）。夜の普請から先は外す
  // 11/21 12:30 UTC クラウド持ち主（act bot 6回に2回・夜討ちの段 229秒・337秒に倒れた：命二割から夜討ちの鉄砲と侍に重ねて削られた）：
  //   夜の段は人夫を守る段（負けは人夫が討たれる時）。命は一割で止める
  if (P) P.hpFloor = F.step <= 2 ? 0.3 : F.step === 3 ? 0.1 : 0;
  // 11/28 10:40 UTC クラウド 忍城の一時間の持ち主（act bot --mobile 96秒★「城から出た新手の九人が (-75,-84) で十三組重なって止まる・行き先無」）：
  //   新手の持ち場は柵の口から十二歩で、八歩より先の者は毎コマ行き先を消され、持ち場へ着けず城の口へ流れて固まった。行き先は消さず持ち場へ戻す
  // 退く間（②）、柵の守りと城から出た新手は柵の口から八歩より先へ追わない（11/14 クラウドゆ act bot：退きの下知の後も四十秒、新手の足軽に背を突かれ138秒で倒れた）
  if (F.step === 2) for (const g of [K.foe, K.foe2]) if (g) for (const u of g.units) {
    if (!u.alive || u.gone || u.fleeing) continue;
    if (Math.hypot(u.pos.x - K.saku.x, u.pos.z - K.saku.z) > 8 || (u.target === P && Math.hypot(P.pos.x - K.saku.x, P.pos.z - K.saku.z) > 6)) { u.target = null; u.watch = null; u.atk = null; u.swing = null; u.bind = null; u.charging = false; u.moveTo = u.oshiGuardPost || null; u.aiT = 0; }
  }
  if (F.step === 1) {
    // 11/19 クラウド29（中学生 bot 0922 の二戦目：本人が出だしから西 (-105,63) へ離れ、柵へ一度も寄らず①のまま1080秒で失敗・四回に一回）：
    //   柵に着く前に、柵への近さが六十秒縮まらなければ、土手の付け根（柵の二十六歩手前）へ呼び戻す。呼び戻して更に六十秒寄れなければ、柵の段を退きの段へ進める
    if (!K.contact && P.alive) {
      const dd = Math.hypot(P.pos.x - K.saku.x, P.pos.z - K.saku.z);
      if (K.bestD == null || dd < K.bestD - 2) { K.bestD = dd; K.bestT = rt.t; }
      else if (rt.t - K.bestT > 60 && dd > 40) {   // 柵の口の手前で斬り合う本人（三十二歩内）は飛ばさない
        if (!K.recalled) {
          K.recalled = true; K.bestD = null;
          C.warp(rt, K.saku.x - K.d.x * 26, K.saku.z - K.d.z * 26, Math.atan2(K.d.x, K.d.z));
          rt.say('石田勢の侍', 'どこへ行く！　土手はこっちじゃ、柵へ寄せよ！', 3);
        } else { rt.say('使番', '寄せは無理じゃ！　退け、本陣へ退け！', 3); retreat(rt, C); return; }
      }
    }
    const down = K.foe.units.filter((u) => !u.alive || u.gone || u.fleeing).length;
    // 11/19 07:40 UTC クラウド持ち主（act bot POSLOG：本人が柵の二十五〜三十二歩で、木戸から出た守りと斬り合い続け、十六歩内へ入らず①が205秒）：
    //   柵の三十二歩内で、この段に入ってから二人討てば、柵へ寄せた事にする（守りを土手の上で斬り伏せるのも柵の口の攻め）
    if (K.k0 == null) K.k0 = rt.stats?.kills || 0;
    // 11/28 10:45 UTC クラウド 忍城の一時間の持ち主（act bot --mobile 1107秒：①が255秒。本人が浅瀬の口（柵の二十五歩）で城から出た新手と百五十秒斬り合い、討1で寄せた事にならず退きの下知が出なかった）：
    //   新手が出て二十秒、柵の三十二歩内で斬り合っていれば寄せた事にする（新手を土手で受け止めるのも柵の口の攻め）
    if (!K.contact && P.alive && (C.near(P.pos, K.saku, 16) || C.near(P.pos, K.saku, 32) && ((rt.stats?.kills || 0) - K.k0 >= 2 || K.foe2 && rt.t - K.newT > 20))) {
      K.contact = rt.t; K.kc = rt.stats?.kills || 0;
      rt.say('石田勢の足軽', '泥が深い！　足が抜けぬ……', 2.8);
      rt.after(3, () => rt.say('石田勢の侍', '柵を越えよ！　木戸の口へ詰めよ！', 2.8));
    }
    // 柵の守りが半ば崩れると、城の口から新手が土手を来る（城は落ちない）
    // 11/18 夜50-42（描かずの通し 979秒＝15分の構成を越えた。①が153秒）：新手を待つ間を七十→五十秒、一斉射撃までを三十二→二十六秒に
    if (!K.foe2 && (down >= K.n0 * 0.5 || (K.contact && rt.t - K.contact > 50))) {
      K.newT = rt.t;
      const at = { x: K.saku.x + K.d.x * 16, z: K.saku.z + K.d.z * 16 };
      K.foe2 = enemyGroup(rt, { faction: 'narita', name: '城から出た新手', anchor: at, facing: Math.atan2(-K.d.x, -K.d.z), fleeDir: { x: K.d.x, z: K.d.z }, width: 5, noRout: true, formation: 'line', morale: 90,
        order: 'move', dest: { x: K.saku.x + K.d.x * 2, z: K.saku.z + K.d.z * 2 }, speed: 3.4, aggro: 6, dmgMult: 0.14 },
      C.dress([{ type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], C.HOJO));
      soften(K.foe2);
      K.foe2.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 12; q.aggro = 12; };
      rt.army.play('eshout', at, 1.2);
      rt.say('石田勢の足軽', '城から新手じゃ！　土手の先から次々来る！', 3);
      rt.after(5, () => rt.say('使番', '北の長野口も押し返されたぞ！', 2.8));
    }
    // 新手と揉み合って一息のち、佐間口の塀から一斉に撃たれ、先手が崩れる。使番が退けを伝える（11/9 三巡：五十秒待つ間に新手に囲まれて bot が倒れた（94〜119秒）。三十二秒に）
    const down2 = K.foe2 ? K.foe2.units.filter((u) => !u.alive || u.gone || u.fleeing).length : 0;
    // 最初の守りとの戦いで深手になった時も、新手を待たず使番が退けを伝える。
    // 柵へ寄せていない本人は、命や時刻だけで次の任務へ進めない。
    // 11/19 クラウド持ち主（act bot 44秒・討0で①が終わった）：柵に着いて数秒の深手だけで退きの下知を出さない。命は三割で止まる（hpFloor）ので、十八秒は斬り合わせる
    // 11/19 06:20 UTC クラウド持ち主（act bot 描かずの足跡：土手の上で矢玉に削られ命五割で柵の十二歩手前に着き、木戸の内の守りと刃を交えず十八秒で退きの下知・①討0）：
    //   柵に着いた本人の十二歩内なら木戸の口の守りの足軽が三人まで打って出る。深手の退きの下知は、柵で二人討つか着いて四十秒まで待つ（命は三割で止まる）
    if (K.contact && !K.volley && P.alive && C.near(P.pos, K.saku, 12)) { let n = K.foe.units.filter((u) => u.alive && u.target === P).length; for (const u of K.foe.units) if (n < 3 && u.alive && !u.gone && !u.fleeing && u.type === 'ashigaru' && u.target !== P && C.near(u.pos, K.saku, 10)) { u.target = P; u.aiT = 0; n++; } }
    if (!K.volley && K.contact && P.alive && (P.hp < P.maxHp * 0.4 && rt.t - K.contact > 18 && ((rt.stats?.kills || 0) - (K.kc || 0) >= 2 || rt.t - K.contact > 40) || K.foe2 && (rt.t - K.newT > 26 || down2 >= K.foe2.units.length * 0.6 || rt.t - F.stepT > LIMIT))) {
      K.volley = rt.t;
      sfx('volley', 1); rt.army.play('volley', C.GATE, 1.4);
      // 11/18 cloud-31：音だけの一斉射だった。佐間口の塀の鉄砲衆が先手へ本当に撃つ（火・硝煙・弾。倒れる四人は下の通り）
      for (const g of rt.army.groups) if (g.team === 1 && g.count && !g.routed && C.near(g.center(), C.GATE, 60)) rt.army.scriptSalvo?.(g, [K.ally], 4);
      // 土手の先手が何人も撃ち倒される（一つの城の口に寄るだけで、これだけ倒れる）
      let n = 0;
      for (const u of K.ally.units) if (u.alive && !u.gone && !u.name && n < 4 && C.near(u.pos, K.saku, 20)) { u.invuln = false; u.hp = 0; rt.army.kill(u, null); n++; }
      rt.say('石田勢の足軽', '塀の上から一斉に撃ってくる！　土手の両脇の竹束へ下がれ！', 3.2);
    }
    // 深手の本人を一斉射撃の台詞の四秒間、柵の際で待たせない。
    if (K.volley && (P.hp < P.maxHp * 0.4 || rt.t - K.volley > 4)) retreat(rt, C);
  } else if (F.step === 2) {
    // 柵の守りは柵の内から出ない
    // 11/9 三巡：柵の際で囲まれたまま退きが始まると、柵の守りが退く本人を突き続けて倒した（bot 119秒）。退く間は本人を狙わない
    // 11/18 クラウド act bot 64秒：退きの下知を聞かず柵の口（六歩内）に残る本人のそばで、柵の守りの足軽が六秒黙って立った。
    //   柵の口に残る本人には、三歩半の内の守りだけが突き返す（刃は一割・命の三割で止まる段。口を離れれば追わない）
    const atGate = P.alive && C.near(P.pos, K.saku, 6);
    for (const g of [K.foe, K.foe2]) if (C.live(g)) { g.order = 'retreat'; g.aggro = 0; for (const u of g.units) if (u.alive && !u.gone) {
      if (atGate && !u.fleeing && C.near(u.pos, K.saku, 9) && C.near(u.pos, P.pos, 3.5)) { if (!u.target) { u.target = P; u.aiT = 0; } continue; }
      if (u.target === P || !C.near(u.pos, K.saku, 9)) u.target = null;
      if (u.atk?.target === P) u.atk = null;
      if (u.swing?.target === P) u.swing = null;
      if (u.bind?.o === P) u.bind = null;
    } }
    // 11/18 cloud-46 の測り：退く段で本人の組の半分超が柵の際 (-45,-50) に残り、柵の守りと斬り合ったまま本人だけ堤へ戻った。
    //   本人が柵から十歩離れたら、組の兵と柵の守りの斬り合いを解き、組は本人について浅瀬を戻る
    if (P.alive && Math.hypot(P.pos.x - K.saku.x, P.pos.z - K.saku.z) > 10) {
      const foes = new Set([...(K.foe?.units || []), ...(K.foe2?.units || [])]);
      for (const g of rt.squadGroups || []) {
        if (g.order === 'hold' || g.order === 'attack') { g.order = 'follow'; g.dest = null; g._catchUp = true; }
        g.aggro = 0;
        for (const s of g.units) if (s.alive && !s.gone && (foes.has(s.target) || C.near(s.pos, K.saku, 14))) {
          s.target = null; s.watch = null; s.atk = null; s.swing = null; s.bind = null; s.charging = false; s.moveTo = null; s.aiT = 0;
        }
      }
      for (const o of foes) if (o.alive && !o.gone && o.target && o.target !== P) { o.target = null; o.atk = null; o.swing = null; o.bind = null; }
    }
    // 11/18 見回り（act bot：退く段が181秒＝八段で一番長い。浅瀬を抜けた後、堤の上を百十 m 歩くだけの間が続いた）：
    //   本人が浅瀬を抜けて石田堤の付け根（DIKE2 の初めの点）に着き、三十歩の内に敵がいなければ、暗転の間に丸墓山の下へ（軍議はそこで始まる）
    // 11/18 夜50-42（描かずの通し 1066秒の回：退く段が161秒。浅瀬の中で迷った）：段から九十秒、柵から二十歩離れ十五歩内に敵がいなければ、居所を問わず同じ暗転で丸墓山の下へ
    if (!K.council && !K.skipDike && P.alive && (C.near(P.pos, { x: C.DIKE2[0][0], z: C.DIKE2[0][1] }, 8) && !rt.army.nearestEnemy(P, 30) || rt.t - F.stepT > 90 && !C.near(P.pos, K.saku, 20) && !rt.army.nearestEnemy(P, 15))) {
      K.skipDike = true;
      C.warp(rt, C.MARU.x - 10, C.MARU.z - 9, Math.atan2(10, 9));
      rt.say('石田勢の足軽', '着いた……丸墓山じゃ。三成様が絵図を広げておられる', 2.8);
    }
    // 本陣の印まで戻ってから軍議へ。遠くに残ったまま時刻だけで済ませない。
    if (!K.council && P.alive && C.near(P.pos, C.MARU, 16)) council(rt, C);
  }
}

export function pin(rt, C) {
  const F = rt.flags, K = F.chi;
  // 始まりの下知を聞く間も、任務に書いた柵を指す。浅瀬の口は後の普請の持ち場。
  if (!F.step) {
    const { saku } = geom(C);
    return { x: saku.x, z: saku.z, r: 6, label: '城の外の柵' };
  }
  if (!K) return undefined;
  if (F.step === 1) return { x: K.saku.x, z: K.saku.z, r: 6, label: '城の外の柵' };
  if (F.step === 2) return { x: C.MARU.x, z: C.MARU.z, r: 16, label: '丸墓山' };   // 軍議の間も行き先を切らさない（関所 3）
  return undefined;
}

// bot：柵の前で近い敵を突く。退けが出たら浅瀬の口を経て丸墓山へ
export function bot(b, inp, T, C) {
  const p = b.player, u = p.u, F = b.flags, K = F.chi;
  if (!K || F.step > 2) return false;
  if (F.step === 1) {
    // 深手なら柵から下がって味方の後ろで息を継ぐ（11/9 見回り：柵の前で囲まれ百秒ほどで倒れる回があった）
    if (u.hp < u.maxHp * 0.4) b.chiRest = true;
    if (b.chiRest && u.hp > u.maxHp * 0.75) b.chiRest = false;
    // 11/19 06:30 UTC クラウド持ち主（act bot 描かずの足跡：柵の二十六歩手前の土手で城兵に四歩の内から斬られ続け、柵を狙う頭が相手にせず命三割まで削られ、
    //   息を継ぐ点がその城兵の脇だったので百秒そこに立ち①討0）：自分の五歩内の城兵は、息を継ぐ間も柵へ向かう間も先に斬る
    const near5 = b.army.nearestEnemy(u, 5, (o) => !o.fleeing && !o.invuln && !o.noTarget && Math.abs(o.pos.y - u.pos.y) < 2);
    if (b.chiRest && !near5) { inp.guardHold = false; T.goTo(p, inp, K.saku.x - K.d.x * 26, K.saku.z - K.d.z * 26, 2); return true; }
    const e = near5 || b.army.nearestEnemy(u, 14, (o) => !o.fleeing && !o.invuln && C.near(o.pos, K.saku, 12));
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
  // 浅瀬を戻った後も本陣へ直進せず、前衛と同じ乾いた堤の道を通る。
  const route = K.returnRoute || (K.returnRoute = [[C.FORD.x, C.FORD.z], [C.RAIDAT.x, C.RAIDAT.z], ...C.DIKE2, [C.MARU.x, C.MARU.z]]);
  let i = K.returnIdx || 0;
  while (i < route.length - 1 && Math.hypot(u.pos.x - route[i][0], u.pos.z - route[i][1]) < 5) i++;
  K.returnIdx = i;
  T.goTo(p, inp, route[i][0], route[i][1], i === route.length - 1 ? 6 : 3);
  return true;
}
