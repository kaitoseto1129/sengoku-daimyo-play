// ======================================================================
// 織田家編　田野の戦い・天目山（天正十年三月十一日）
// 高遠城が落ちると、武田の家臣は次々に離れていった。武田勝頼は新府城を焼いて、小山田信茂の岩殿城を頼ったが、
// 小山田にも背かれ、わずかな供と天目山のふもとの田野へ逃れた。滝川一益の手がこれを追いつめ、勝頼は自害した。
// 狭い崖道で土屋昌恒が一人で多くの敵を防いだ（片手千人斬り）という話は、のちの伝えである。
// 足軽は滝川一益の手。①日川の谷を上り、武田の殿を退ける ②崖道で、土屋昌恒の衆を破る ③田野の陣に踏み込む
// 向き：東（+x）へ谷を上る。谷の両側は崖。田野は谷の奥
// ======================================================================
import * as THREE from 'three';
import { nobori, hut, jinmaku, campfire, tawara } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos, wallLine } from './bhelp.js';
import { dress, gone, more } from './b_inabayama.js';
import { distToPolyline } from './world.js';
import { camp } from './b_mid.js';
// 足軽大将候補より上（信長で遊ぶ時は除く）：任務の文を「一手を預かる」者の役目に
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 谷の道（西から東へ上る）
const ROAD = [[-190, 6], [-120, -4], [-60, 4], [-10, -2], [30, 2], [70, -4], [120, 2], [180, -6]];
const NARROW = { x0: 20, x1: 60 };          // 崖道（道の幅が狭い所）
const TANO = { x: 120, z: 2 };              // 田野（勝頼の最後の陣）
const ODA = { flag: 'oda' };
const TAKEDA = { flag: 'takeda' };

function height(x, z) {
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  h += (x + 200) * 0.05;
  const d = distToPolyline(x, z, ROAD);
  // 崖道は谷がせまく、切り立つ
  const narrow = x > NARROW.x0 && x < NARROW.x1;
  const half = narrow ? 4.5 : 14;
  h += Math.min(narrow ? 40 : 30, Math.max(0, d - half) * (narrow ? 1.6 : 0.5));
  h += 40 * gauss(x, z, 160, -140, 9000) + 40 * gauss(x, z, 60, 160, 9000);
  return h;
}

// ---- 共通の小道具（組E の戦で使い回す） ----
// 味方の鉄砲の組に一斉射を任せる。込めたまま待たせ（holdFire）、敵の前線が near m まで寄せたら「放て」で撃たせ、敵の気勢を下げる。
// o：{ guns: () => [隊], foes: () => [隊], who: 話し手, near: 38, drop: 25, max: 60（この秒を過ぎたら待たずに撃つ）, line: 見出しの小さな字, say: 合図の台詞, onFire(rt) }
export function volleyAt(rt, o) {
  const gs = () => (o.guns() || []).filter((g) => g && g.count > 0);
  for (const g of gs()) { g.holdFire = true; g.fire = true; }
  const t0 = rt.t;
  const fire = (hit) => {
    for (const g of gs()) g.holdFire = false;
    rt.say(o.who || '鉄砲頭', o.say || '引きつけたぞ……放てぇっ！', 3);
    rt.banner('一斉射', o.line || '味方の鉄砲がそろって火を吹いた。敵の前が崩れる');
    sfx('volley', 1);
    for (const g of gs()) {
      const c = g.center();
      rt.army.play('gun', c, 1.4);
      for (let i = 0; i < 4; i++) rt.army.smoke(c.x - 4 + i * 2.6, rt.world.heightAt(c.x, c.z) + 1.4, c.z, 0, 0);
    }
    for (const f of hit) { f.morale = Math.max(0, f.morale - (o.drop || 25)); }
    if (o.onFire) o.onFire(rt, hit);
  };
  const tick = () => {
    if (rt.over || rt.flags.ending) return;
    const G = gs();
    if (!G.length) return;
    const foes = (o.foes() || []).filter((f) => f && f.count > 0 && !f.routed);
    const near = o.near || 38;
    const hit = foes.filter((f) => { const c = f.center(); return G.some((g) => { const d = g.center(); return Math.hypot(c.x - d.x, c.z - d.z) < near; }); });
    if (hit.length) return fire(hit);
    if (rt.t - t0 > (o.max || 60)) return fire(foes);
    rt.after(0.4, tick);
  };
  rt.after(0.4, tick);
}
// 武田の騎馬の大きな塊を遠くに見せる（軽い作り）。facing は向く先
export function horseHost(rt, x, z, w, d, count, facing, seed) {
  return rt.world.addDistantArmy({ x, z, w, d, count, facing, armor: 0x3a2622, flagTex: flagTexture('takeda'), mon: 'takeda', seed, kind: 'cavalry' });
}

const tano = {
  spawn: { x: -160, z: 4, heading: Math.PI / 2 },
  world: {
    seed: 15823,
    time: 'day',
    mist: true,
    muddy: 0.5,
    paths: [ROAD],
    height,
    tint(x, z, h, c) { if (distToPolyline(x, z, ROAD) > 12) c.setRGB(c.r * 0.8, c.g * 0.86, c.b * 0.8); else c.lerp({ r: 0.5, g: 0.46, b: 0.36 }, 0.25); },
    clear: (x, z) => distToPolyline(x, z, ROAD) < 12 || Math.hypot(x - TANO.x, z - TANO.z) < 24,
    trees: 700,
    tufts: 2400,
    treeDensity: (x, z) => (distToPolyline(x, z, ROAD) < 16 ? 0.1 : 1),
    groves: [{ x: -80, z: 30, r: 12, n: 16 }, { x: 90, z: -30, r: 12, n: 16 }],
    fleeOut: (x, z, team) => team === 1 && x > 175,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    // ---- 崖道の両側（通れない崖） ----
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    for (const sd of [-1, 1]) noT(wallLine(rt, [[NARROW.x0 - 4, sd * 7], [NARROW.x1 + 4, sd * 6.5]], { team: 1, hp: 1e9, name: '崖', segLen: 8, mesh: () => new THREE.Group() }));
    // ---- 田野の陣（陣幕と小屋） ----
    // 勝頼の最後の陣：陣幕の内に武田勝頼、口の前に馬廻（控えは谷の奥にわずか）
    F.ehon = camp(rt, { x: TANO.x + 14, z: TANO.z - 4, facing: -Math.PI / 2, team: 1, faction: 'takeda', mon: 'takeda', general: { name: '武田勝頼', hat: 'kabuto_m', haori: 0x7a2a1c }, guard: 15, reserve: 60, runTo: { x: NARROW.x1 + 10, z: 0 } });
    F.ehon.guard.name = '勝頼の馬廻'; F.ehon.guard.dmgMult = 0.58;
    rt.scene.add(hut(W, TANO.x + 6, TANO.z + 12, 7, 5, 0.2, { wall: 0x5a4a38 }), tawara(W, TANO.x - 6, TANO.z + 8, 0.2, 3));
    for (const [x, z] of [[TANO.x, TANO.z - 10], [TANO.x + 20, TANO.z + 8]]) rt.scene.add(nobori(W, x, z, 'takeda', 6));
    for (const [x, z] of [[-90, -8], [-40, 8], [NARROW.x0 - 6, 5]]) rt.scene.add(nobori(W, x, z, 'takeda', 5));
    // ---- 滝川一益の手（自分の持ち場）と、河尻秀隆の手 ----
    F.taki = allyGroup(rt, { name: '滝川一益の手', anchor: { x: -168, z: 2 }, facing: Math.PI / 2, width: 12, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '滝川一益', invuln: true, hat: 'kabuto_w', haori: 0x2a2a3a } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 6 }], ODA));
    F.takiU = F.taki.units[0];
    F.kawa = allyGroup(rt, { name: '河尻秀隆の手', anchor: { x: -178, z: -6 }, facing: Math.PI / 2, width: 12, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '河尻秀隆', invuln: true, hat: 'kabuto_m', haori: 0x3a2e24 } }, { type: 'ashigaru', n: 14 }], ODA));
    F.oda = [F.taki, F.kawa];
    for (const g of F.oda) { g.defMult = 1.2; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: -176, z: 8 }, Math.PI / 2, [{ kind: 'spear', n }]);
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    DA(-205, 0, 12, 30, 200, Math.PI / 2, 0x2b3140, 'oda', 15824);

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', HI(rt) ? '滝川一益の先手で足軽の一手を預かり、下知を待て' : '滝川一益のもとで、下知を待て', 'main');
    rt.say('滝川一益', `${nm(rt)}、勝頼殿は小山田にも背かれ、この谷の奥へ逃れたそうな。供は、もう数十人と聞く`, 5);
    rt.say('滝川一益', '……最後まで残った者たちじゃ。侮るな。じゃが、無駄に死なせるな', 4);
    rt.marker('taki', unitPos(F.takiU), '滝川一益', {});
    rt.after(15, () => this.valley(rt));
  },

  // ① 谷を上る
  valley(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('valley');
    rt.unmark('taki');
    sfx('horagai', 0.8);
    rt.obj('main', HI(rt) ? '先手の一手を率いて谷を上り、武田の殿を退けよ' : '谷を上り、武田の殿を退けよ', 'main');
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.4; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; q.anchor = { x, z }; }; };
    go(F.taki, -70, 2); go(F.kawa, -84, -4);
    F.r1 = enemyGroup(rt, { faction: 'takeda', name: '武田の殿', anchor: { x: -40, z: 2 }, facing: -Math.PI / 2, order: 'hold', aggro: 18, width: 12, morale: 95, fleeDir: { x: 1, z: 0 }, dmgMult: 0.6, formation: 'yari' },
      dress([{ type: 'samurai', n: 3 }, { type: 'cavalry', n: 3 }, { type: 'ashigaru', n: 10 + more(rt, 0.4) }, { type: 'gun', n: 2 }], TAKEDA));
    // 谷の奥に、まだ武田の騎馬が固まっている（軽い作り）
    horseHost(rt, 168, 4, 22, 12, 110, -Math.PI / 2, 15829);
    for (const u of F.r1.units) if (u.type === 'gun') u.dmg *= 0.45;
    rt.marker('r1', centerOf(F.r1), () => `武田の殿・${moraleWord(F.r1.morale)}`, { red: true, group: F.r1 });
    // 谷の入り口から武田の殿まで長く歩かせない：途中の藪に、足止めの物見が潜む
    F.scout = enemyGroup(rt, { faction: 'takeda', name: '藪の武田の物見', anchor: { x: -122, z: -8 }, facing: -Math.PI / 2, order: 'hold', aggro: 16, width: 6, morale: 70, fleeDir: { x: 1, z: 0 }, dmgMult: 0.55 },
      dress([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5 }], TAKEDA));
    rt.marker('scout', centerOf(F.scout), () => `武田の物見・${moraleWord(F.scout.morale)}`, { red: true, group: F.scout });
    rt.say('滝川一益', '藪に人影がおる。足止めの物見じゃ。蹴散らして進め', 3);
  },

  // ② 崖道：土屋昌恒
  narrow(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('narrow');
    rt.unmark('r1');
    if (!gone(F.r1)) F.r1.morale = Math.min(F.r1.morale, 15);
    rt.award((t) => t.side.push('武田の殿を退けた'), '武田の殿を退けた');
    rt.banner('崖道', '人がやっと二人並べるほどの道を、武田の侍がふさいでいる');
    rt.obj('main', '崖道で、土屋昌恒の衆を破れ', 'main');
    rt.say('土屋昌恒', 'ここより先へは一人も通さぬ。御屋形様（勝頼）の最期を、けがさせはせぬ！', 4.5);
    rt.say('滝川一益', '……見事な覚悟よ。じゃが、押し通る', 3);
    F.tsuchi = enemyGroup(rt, { faction: 'takeda', name: '土屋昌恒の衆', anchor: { x: NARROW.x0 + 14, z: 0 }, facing: -Math.PI / 2, order: 'hold', aggro: 14, width: 6, morale: 100, noRout: true, fleeDir: { x: 1, z: 0 }, dmgMult: 0.58, defMult: 1.25, formation: 'column' },
      dress([{ type: 'busho', n: 1, o: { name: '土屋昌恒', invuln: true, hat: 'kabuto_m', haori: 0x7a2a1c } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 8 + more(rt, 0.3) }], TAKEDA));
    F.tsuchi.units[0].dmg *= 0.5;
    rt.marker('tsuchi', centerOf(F.tsuchi), () => `土屋昌恒の衆・${moraleWord(F.tsuchi.morale)}`, { red: true, group: F.tsuchi });
    const go = (g, x, z) => { g.order = 'move'; g.dest = { x, z }; g.speed = 2.2; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; }; };
    go(F.taki, NARROW.x0 - 6, 0); go(F.kawa, NARROW.x0 - 18, 0);
    // 勝ち筋：狭い崖道は、鉄砲で前を崩してから槍で押し通る
    F.tgun = allyGroup(rt, { name: '滝川の鉄砲組', anchor: { x: NARROW.x0 - 26, z: 3 }, facing: Math.PI / 2, width: 8, aggro: 6, noRout: true, order: 'hold' },
      dress([{ type: 'gun', n: 8 }], ODA));
    rt.say('滝川一益', '道が狭い。槍で正面から当たれば、こちらが削られる。鉄砲組を前へ。寄せて来た所を撃ち崩せ', 4.5);
    volleyAt(rt, { guns: () => [F.tgun], foes: () => [F.tsuchi], who: '滝川一益', near: 30, drop: 30, max: 45, line: '崖道の武田勢が、硝煙の中でたじろいだ。今じゃ、押し通れ' });
    rt.after(10, () => { F.tsuchi.order = 'attack'; F.tsuchi.seekRange = 30; });
  },

  // ③ 田野
  tano(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('tano');
    rt.unmark('tsuchi');
    if (!gone(F.tsuchi)) { F.tsuchi.noRout = false; F.tsuchi.morale = 0; for (const u of F.tsuchi.units) u.invuln = false; }
    rt.award((t) => t.side.push('崖道を押し通った'), '崖道を押し通った');
    rt.obj('main', '田野の陣に踏み込み、残った武田の者を退けよ', 'main');
    rt.marker('tano', TANO, '田野', { h: 3 });
    F.last = enemyGroup(rt, { faction: 'takeda', name: '勝頼の旗本', anchor: { x: TANO.x - 6, z: TANO.z }, facing: -Math.PI / 2, order: 'attack', seekRange: 40, aggro: 16, width: 10, morale: 100, fleeDir: { x: 1, z: 0 }, dmgMult: 0.58 },
      dress([{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 8 + more(rt, 0.3) }], TAKEDA));
    rt.marker('last', centerOf(F.last), () => `勝頼の旗本・${moraleWord(F.last.morale)}`, { red: true, group: F.last });
    for (const g of F.oda) { g.order = 'path'; g.path = [[80, -2], [TANO.x - 12, TANO.z]]; g.pathIdx = 0; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 40; }; }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('last'); rt.unmark('tano');
    if (F.last && !gone(F.last)) { F.last.morale = 0; }
    // 勝頼は陣幕の内で自害する（馬廻は崩れる）
    if (F.ehon) { const k = F.ehon.general; if (k && k.alive) { k.invuln = false; rt.army.kill(k, null); } if (F.ehon.guard && !gone(F.ehon.guard)) F.ehon.guard.morale = 0; }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '田野まで武田勢を追いつめた', pts: 20 }; }, '任務達成・田野に踏み込んだ');
    sfx('kane', 0.5);
    rt.banner('武田勝頼、自害', '陣幕の内で、勝頼と嫡男の信勝は自ら命を絶った');
    rt.say('滝川一益', `……甲斐の武田が、ここで終わるか。${nm(rt)}、首は手厚く扱え。信玄公の家じゃ`, 5);
    rt.after(6, () => rt.say('', '――武田家は滅んだ。三か月後、京の本能寺で、信長もまた炎の中に消える', 5.5));
    rt.player.u.invuln = true;
    rt.finish({}, 12);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    const p = rt.player.u.pos;
    if (F.step === 1) {
      rt.objProgress('main', `武田の殿 ${F.r1.count}人`);
      if (F.scout && !F.scoutOn && p.x > -142) { F.scoutOn = true; F.scout.order = 'attack'; F.scout.seekRange = 30; rt.army.play('eshout', { x: -122, z: -8 }, 1.2); }
      if (F.scout && F.scout.count < 3 && !gone(F.scout)) F.scout.morale = 0;
      if (!F.r1On && p.x > -80) { F.r1On = true; F.r1.order = 'attack'; F.r1.seekRange = 40; }
      if (F.r1.count < 4 && !gone(F.r1)) F.r1.morale = Math.min(F.r1.morale, 20);
      if (gone(F.r1) || rt.t - F.stepT > 150) this.narrow(rt);
    }
    if (F.step === 2) {
      const g = F.tsuchi;
      rt.objProgress('main', `土屋の衆 ${g.count}人`);
      if (g.count < 5 && g.noRout) { g.noRout = false; g.morale = Math.min(g.morale, 25); g.units[0].invuln = false; }
      if (gone(g) || rt.t - F.stepT > 150) this.tano(rt);
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - TANO.x, p.z - TANO.z);
      rt.objProgress('main', gone(F.last) ? `田野まで ${Math.round(d)}m` : `旗本 ${F.last.count}人`);
      if (F.last.count < 4 && !gone(F.last)) F.last.morale = Math.min(F.last.morale, 20);
      if ((gone(F.last) && d < 14) || rt.t - F.stepT > 140) this.win(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が谷の奥へ退いた`, 2.5);
  },
};

// 両軍の総勢（滝川一益の手 数千、勝頼の供 数十人から数百。数には諸説ある）
tano.force = (rt) => {
  const F = rt.flags;
  return { a: Math.round(4000 - (F.ak || 0) * 10), a0: 4000, b: Math.max(0, 300 - (F.ek || 0) * 5), b0: 300 };
};
tano.sides = { a: { name: '織田軍（滝川一益）', mon: 'oda' }, b: { name: '武田軍', mon: 'takeda' } };
tano.date = () => '天正十年三月十一日　春・霞';
tano.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
tano.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
tano.history = '天正十年（1582）三月、高遠城が落ちると、武田の家臣や親類は次々に勝頼のもとを離れた。勝頼は築いたばかりの新府城に火を放って、郡内の小山田信茂の岩殿城を目指したが、小山田にも背かれ、わずかな供と天目山のふもとの田野へ逃れた。三月十一日、滝川一益の手がこれを追いつめ、勝頼は嫡男の信勝とともに自害し、武田家は滅んだ。供の土屋昌恒が、狭い崖道で片手で藤蔓をつかみながら多くの敵を斬り防いだ（片手千人斬り）という話は、のちの伝えである。三か月後の六月二日、信長は本能寺で討たれる。兵の数には諸説ある。';

// 素直な遊び手：谷を上って殿と戦い、崖道で土屋の衆と戦い、田野へ
tano.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const c = F.taki.center();
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, c.x - 6, c.z, 2); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    return;
  }
  inp.guardHold = false;
  const tgt = F.step === 1 ? F.r1 : F.step === 2 ? F.tsuchi : F.step === 3 ? (gone(F.last) ? null : F.last) : null;
  if (tgt && !gone(tgt)) { const t = tgt.center(); if (Math.hypot(c.x - t.x, c.z - t.z) > 22 && F.step === 1) { goTo(p, inp, c.x + 3, c.z, 3); return; } goTo(p, inp, t.x, t.z, 2); return; }
  if (F.step === 3) { goTo(p, inp, TANO.x, TANO.z, 3); return; }
  goTo(p, inp, c.x + 3, c.z + 3, 3);
};

export { tano };
