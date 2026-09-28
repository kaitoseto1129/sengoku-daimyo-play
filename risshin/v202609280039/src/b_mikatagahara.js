// ======================================================================
// 織田家編　三方ヶ原の戦い（元亀三年十二月二十二日）
// 西へ攻め上る武田信玄の二万五千が、遠江の三方ヶ原を通り過ぎようとした。徳川家康は浜松城から打って出て、
// 信長が送った援軍（佐久間信盛・平手汎秀・滝川一益ら三千ほど）とともに挑んだが、夕暮れの一刻ほどで大敗した。
// 織田の援軍の平手汎秀は討ち死にし、家康は浜松城へ逃げ帰った。
// 足軽は平手汎秀の手（織田の援軍）。①夕暮れの台地で武田の先手を受け止める ②赤備えの騎馬に崩される
// ③平手の討ち死に。浜松城へ退く（追ってくる武田勢を振り切る）
// 向き：北（-z）から武田勢が来る。南（+z）の台地の下に浜松城
// ======================================================================
import { nobori, hut, tawara, campfire } from './props.js';
import { flagTexture } from './textures.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { dress, gone, more, applyLook, NIGHT } from './b_inabayama.js';

const LINE_Z = -20;                        // 織田の援軍の陣
const HAMA = { x: 20, z: 170 };            // 浜松城の方（退く先）
const ODA = { flag: 'oda' };
const TAKEDA = { flag: 'takeda' };
const AKA = { flag: 'akazonae' };
const TOKU = { flag: 'tokugawa' };

function height(x, z) {
  let h = 0.5 * Math.sin(x * 0.02 + 0.3) * Math.cos(z * 0.018) + 0.35 * Math.sin(z * 0.05 + x * 0.03);
  // 三方ヶ原の台地（南の端で下がる）
  h += 8 / (1 + Math.exp((z - 110) / 10));
  // 北の山並み
  h += Math.max(0, -z - 170) * 0.25 + 30 * gauss(x, z, -160, -200, 9000);
  return h;
}


// 苦しい戦：生き延びた事そのものを手柄にする（残った体力と、生き残った組の者の割合で）
function survival(rt, label) {
  const u = rt.player.u, sq = rt.squad || [];
  const hpK = Math.max(0, u.hp / u.maxHp), sqK = sq.length ? sq.filter((x) => x.alive).length / sq.length : 1;
  const pts = Math.round(10 + hpK * 10 + sqK * 15);
  rt.award((t) => t.side.push(`${label}（組 ${sq.filter((x) => x.alive).length}/${sq.length}）`), `${label}・生き延びた手柄 +${pts}`);
  rt.award((t) => { t.special = { label, pts: Math.max(t.special ? t.special.pts : 0, pts) }; }, label);
}

const mikatagahara = {
  spawn: { x: 8, z: LINE_Z + 10, heading: Math.PI },
  world: {
    seed: 15722,
    time: 'dusk',
    autumn: true,
    muddy: 0.2,
    paths: [[[-10, -200], [0, -60], [6, LINE_Z], [14, 80], [HAMA.x, HAMA.z]]],
    height,
    tint(x, z, h, c) { c.lerp({ r: 0.55, g: 0.5, b: 0.38 }, 0.35); },
    clear: (x, z) => Math.abs(x) < 110 && z > -120 && z < 150,
    trees: 300,
    tufts: 5200,
    treeDensity: (x, z) => (Math.abs(x) < 120 && z > -130 && z < 160 ? 0.08 : 0.7),
    groves: [{ x: -80, z: 40, r: 14, n: 18 }, { x: 80, z: -40, r: 14, n: 18 }, { x: 60, z: 100, r: 12, n: 14 }],
    fleeOut: (x, z, team) => team === 1 && z < -160,
  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0;
    // ---- 織田の援軍：平手汎秀の手（自分の持ち場）、佐久間信盛の手 ----
    F.hirate = allyGroup(rt, { name: '平手汎秀の手', anchor: { x: 0, z: LINE_Z }, facing: Math.PI, width: 16, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '平手汎秀', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x3a2a2a } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'gun', n: 3 }], ODA));
    F.hiraU = F.hirate.units[0];
    F.saku = allyGroup(rt, { name: '佐久間信盛の手', anchor: { x: 30, z: LINE_Z + 20 }, facing: Math.PI, width: 14, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, horse: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 14 }], ODA));
    F.toku = allyGroup(rt, { faction: 'tokugawa', name: '徳川の手', anchor: { x: -40, z: LINE_Z - 4 }, facing: Math.PI, width: 18, aggro: 10, noRout: true, fleeDir: { x: -0.3, z: 1 } },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }], TOKU));
    F.oda = [F.hirate, F.saku, F.toku];
    // 苦しい戦：一万余りで二万五千に当たる。味方は並の強さ
    for (const g of F.oda) { g.defMult = 1.0; g.dmgMult = 0.75; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 10, z: LINE_Z + 8 }, Math.PI, [{ kind: 'spear', n }]);
    for (const [x, z, k] of [[-8, LINE_Z + 6, 'oda'], [8, LINE_Z + 6, 'oda'], [-44, LINE_Z + 4, 'tokugawa'], [34, LINE_Z + 26, 'oda']]) rt.scene.add(nobori(W, x, z, k, 6));
    // ---- 大軍（軽い作り）：鶴翼に開いた徳川勢、魚鱗に固めた武田の大軍 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed) => W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
    F.tokuDA = [DA(-90, LINE_Z - 10, 40, 10, 240, Math.PI, 0x24221f, 'tokugawa', 15721), DA(-150, LINE_Z - 30, 40, 10, 220, Math.PI * 0.9, 0x24221f, 'tokugawa', 15722), DA(80, LINE_Z - 6, 30, 10, 180, Math.PI, 0x2b3140, 'oda', 15723)];
    F.host = [DA(0, -150, 60, 20, 360, 0, 0x3a2622, 'takeda', 15724), DA(-80, -140, 40, 16, 260, 0.2, 0x3a2622, 'furin', 15725), DA(70, -150, 40, 16, 260, -0.2, 0x8e1f16, 'akazonae', 15726)];
    // 浜松城の方（遠く、南）
    rt.scene.add(hut(W, HAMA.x, HAMA.z + 14, 14, 9, 0.1, { h: 3.6, wall: 0x7a6a50, roof: 0x3a3430 }));
    for (const [x, z] of [[HAMA.x - 8, HAMA.z], [HAMA.x + 8, HAMA.z]]) { rt.scene.add(nobori(W, x, z, 'tokugawa', 6)); rt.scene.add(campfire(W, x, z + 4)); W.addFire(x, z + 4); }

    rt.world.setTime('dusk');
    rt.setPhase('brief');
    rt.obj('main', '平手汎秀のもとで、陣を固めよ', 'main');
    rt.say('平手汎秀', `${nm(rt)}、あれが武田信玄の軍勢じゃ。二万五千。……こちらは徳川と合わせて一万余り`, 5);
    rt.say('平手汎秀', '殿（信長公）の名代として来た以上、背を見せるわけにはゆかぬ。槍を揃えよ', 4);
    rt.marker('hira', unitPos(F.hiraU), '平手汎秀', {});
    rt.after(16, () => this.first(rt));
  },

  // ① 武田の先手を受け止める
  first(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t;
    rt.setPhase('first');
    rt.unmark('hira');
    sfx('taiko', 1); rt.after(1, () => sfx('horagai', 0.8));
    rt.banner('武田の先手', '石を投げつけ、そのあとから槍が来る');
    rt.obj('main', '武田の先手を受け止めよ', 'main');
    for (const h of F.host) h.advance(60, 50);
    F.w1 = enemyGroup(rt, { faction: 'takeda', name: '武田の先手', anchor: { x: 4, z: -66 }, facing: 0, order: 'attack', seekRange: 120, aggro: 16, width: 18, morale: 100, fleeDir: { x: 0, z: -1 }, dmgMult: 0.62, formation: 'yari' },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 + more(rt, 0.4) }, { type: 'bow', n: 4 }], TAKEDA));
    rt.marker('w1', centerOf(F.w1), () => `武田の先手・${moraleWord(F.w1.morale)}`, { red: true, group: F.w1 });
    rt.say('平手汎秀', '来るぞ！　動くな、槍先を下げよ！', 3);
  },

  // ② 赤備えの騎馬に崩される
  crash(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('crash');
    rt.unmark('w1');
    sfx('horagai', 1);
    rt.banner('赤備え', '山県昌景の赤い騎馬が、横から突っ込んでくる');
    rt.obj('main', '横から来る赤備えの騎馬を食い止めよ', 'main');
    for (const h of F.host) h.advance(40, 30, { charge: true });
    F.aka = enemyGroup(rt, { faction: 'akazonae', name: '山県の赤備え', anchor: { x: 70, z: -60 }, facing: -Math.PI * 0.8, order: 'attack', seekRange: 140, aggro: 18, width: 14, morale: 100, noRout: true, fleeDir: { x: 1, z: -1 }, dmgMult: 0.55 },
      dress([{ type: 'busho', n: 1, o: { name: '山県昌景', invuln: true, horse: true } }, { type: 'cavalry', n: 10 + more(rt, 0.2) }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], AKA));
    F.aka.units[0].dmg *= 0.4;
    rt.army.play('gallop', { x: 60, z: -50 }, 1.8);
    rt.marker('aka', centerOf(F.aka), () => `山県の赤備え・${moraleWord(F.aka.morale)}`, { red: true, group: F.aka });
    rt.say('足軽', '赤い騎馬じゃ！　右から来る！', 3);
    rt.after(10, () => { rt.say('足軽', '徳川の手が崩れた……！　鶴翼が破れておる！', 3.5); F.toku.noRout = false; F.toku.morale = 10; for (const t of F.tokuDA) t.rout({ hideAfter: 40 }); });
  },

  // ③ 平手の討ち死に、浜松城へ退く
  retreat(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.stepT = rt.t;
    rt.setPhase('retreat');
    rt.unmark('aka');
    if (F.hiraU.alive) { F.hiraU.invuln = false; rt.army.kill(F.hiraU, null); }
    sfx('kane', 0.4);
    rt.banner('平手汎秀、討ち死に', '織田の援軍は崩れ、浜松城へ退く');
    rt.say('佐久間信盛', '退けっ、退けい！　浜松の城まで走れ！　振り返るな！', 4);
    rt.obj('main', '追ってくる武田勢を振り切り、浜松城へ退け', 'main');
    rt.marker('hama', HAMA, '浜松城', { h: 3 });
    rt.zone('hama', HAMA.x, HAMA.z, 10);
    applyLook(rt, NIGHT);
    for (const g of [F.hirate, F.saku]) { g.order = 'path'; g.path = [[10, 60], [HAMA.x, HAMA.z - 6]]; g.pathIdx = 0; g.speed = 3; g.noRout = true; g.onArrive = (q) => { q.order = 'hold'; }; }
    // 追手
    F.chase = [];
    const mk = (x, z, name, list) => {
      const g = enemyGroup(rt, { faction: 'takeda', name, anchor: { x, z }, facing: 0, order: 'attack', seekRange: 60, aggro: 14, width: 10, morale: 90, fleeDir: { x: 0, z: -1 }, dmgMult: 0.55, speed: 3.2 }, dress(list, TAKEDA));
      F.chase.push(g);
      rt.marker('c' + F.chase.length, centerOf(g), () => `${name}・${moraleWord(g.morale)}`, { red: true, group: g });
    };
    // 追手は途切れない：足を止めれば、後ろから次々に追いつかれる（城へ入るまで 22 秒ごとに新手）
    rt.after(6, () => mk(-20, 0, '追ってくる武田の騎馬', [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 8 }]));
    rt.after(34, () => { if (!F.ending) mk(30, 40, '回り込んだ武田勢', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 + more(rt, 0.3) }]); });
    F.chaseT = rt.t + 56; F.chaseN = 0;
    if (F.aka && !gone(F.aka)) { F.aka.order = 'hold'; F.aka.noRout = false; }
    if (F.w1 && !gone(F.w1)) { F.w1.order = 'hold'; }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('hama'); rt.unzone('hama');
    for (let i = 1; i <= 2; i++) rt.unmark('c' + i);
    for (const q of F.chase || []) if (!gone(q)) { q.order = 'hold'; q.morale = Math.min(q.morale, 30); }
    rt.objDone('main');
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; }, '任務達成・浜松城へ退いた');
    survival(rt, '三方ヶ原から生きて浜松城へ退いた');
    sfx('horagai', 0.4);
    rt.banner('浜松城', '城の門は開け放たれ、篝火が焚かれていた');
    rt.say('佐久間信盛', `……生きておったか、${nm(rt)}。平手殿は戻らなんだ。殿（信長公）に、何と申し上げればよいか`, 5);
    rt.after(6, () => rt.say('', '――武田勢はそのまま西へ進んだが、翌年四月、信玄は陣中で病に倒れ、甲斐へ帰る途中で没した', 6));
    rt.player.u.invuln = true;
    rt.finish({}, 13);
  },

  // 取り残された：城門が閉じ、闇の原に取り残される
  lose(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.unmark('hama'); rt.unzone('hama');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('取り残された', '浜松城の門は閉じられ、武田の追手が原を埋めていく');
    rt.say('足軽', '門が……門が閉まった……！', 3);
    rt.finish({}, 9);
  },

  update(rt, dt) {
    const F = rt.flags;
    for (const m of rt.markers.slice()) if (m.group && gone(m.group)) rt.unmark(m.id);
    if (F.ending) return;
    const p = rt.player.u.pos;
    if (F.step === 1) {
      rt.objProgress('main', `武田の先手 ${F.w1.count}人`);
      if (F.w1.count < 6 && !gone(F.w1)) F.w1.morale = Math.min(F.w1.morale, 25);
      if ((gone(F.w1) && rt.t - F.stepT > 30) || rt.t - F.stepT > 90) this.crash(rt);
    }
    if (F.step === 2) {
      rt.objProgress('main', `赤備え ${F.aka.count}人`);
      if (rt.t - F.stepT > 70 || (F.aka.count < 8 && rt.t - F.stepT > 40)) this.retreat(rt);
    }
    if (F.step === 3) {
      const d = Math.hypot(p.x - HAMA.x, p.z - HAMA.z);
      rt.objProgress('main', `浜松城まで ${Math.max(0, Math.round(d))}m`);
      for (const q of F.chase || []) if (q.count < 3 && !gone(q)) q.morale = Math.min(q.morale, 20);
      // 後ろの者との間：一番近い追手までの遠さ
      const near = rt.army.nearestEnemy(rt.player.u, 60, (o) => !o.fleeing);
      rt.objProgress('main', `浜松城まで ${Math.max(0, Math.round(d))}m・${near ? `追手まで ${Math.round(Math.hypot(near.pos.x - p.x, near.pos.z - p.z))}m` : '追手は見えぬ'}・城門が閉じるまで ${Math.max(0, Math.ceil(170 - (rt.t - F.stepT)))}秒`);
      if (rt.t > F.chaseT && F.chaseN < 4) {
        F.chaseT = rt.t + 22; F.chaseN++;
        const pu = rt.player.u;
        mk(pu.pos.x + (Math.random() - 0.5) * 30, pu.pos.z - 45, ['追いすがる騎馬', '馬場の手', '追手の新手', '内藤の騎馬'][F.chaseN - 1], [{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'cavalry', n: 5 }, { type: 'ashigaru', n: 6 }]);
        rt.bark('後ろから新手の追手！　足を止めるな！', true);
      }
      if (d < 10) this.win(rt);
      else if (rt.t - F.stepT > 170) this.lose(rt);
    }
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
  },
  onRout(rt, g) {
    if (g.team !== 1) return;
    rt.say('足軽', `${g.name}が退いた！`, 2.5);
  },
};

// 両軍の総勢（徳川・織田 一万一千ほど、武田 二万五千ほど。数には諸説ある）
mikatagahara.force = (rt) => {
  const F = rt.flags;
  return { a: Math.max(0, 11000 - (F.ak || 0) * 20 - (F.step >= 2 ? 1500 : 0)), a0: 11000, b: Math.max(0, 25000 - (F.ek || 0) * 20), b0: 25000 };
};
mikatagahara.sides = { a: { name: '徳川・織田軍', mon: 'oda' }, b: { name: '武田軍', mon: 'takeda' } };
mikatagahara.date = (rt) => `元亀三年十二月二十二日　冬・${rt.flags.step >= 3 ? '夜' : '夕暮れ'}`;
mikatagahara.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
mikatagahara.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
mikatagahara.history = '元亀三年（1572）十月、甲斐の武田信玄は二万五千ほどの兵で西へ攻め上った。遠江の二俣城を落とした武田勢は、十二月二十二日、徳川家康の浜松城の前を通り過ぎて三方ヶ原の台地へ上った。家康は城から打って出て、信長が送った援軍（佐久間信盛・平手汎秀・滝川一益ら三千ほど）とともに鶴翼に開いて挑んだが、魚鱗に固めた武田勢に夕暮れの一刻ほどで大敗した。織田の援軍の平手汎秀は討ち死にし、家康はわずかな供と浜松城へ逃げ帰った。武田勢の先手が石を投げかけたという話が伝わる。信玄はそのまま西へ進んだが、翌年四月、陣中で病に倒れ、甲斐へ帰る途中で没した。兵の数には諸説ある。';

// 素直な遊び手：先手を受け、赤備えと戦い、浜松城へ走る
mikatagahara.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  if (F.step === 3) {
    const e3 = b.army.nearestEnemy(u, 4, (o) => !o.fleeing);
    if (e3 && u.hp > u.maxHp * 0.4) { p.yaw = Math.atan2(e3.pos.x - u.pos.x, e3.pos.z - u.pos.z); if (Math.random() < 0.5) inp.leftPressed = true; return; }
    goTo(p, inp, HAMA.x, HAMA.z, 3);
    return;
  }
  if (u.hp < u.maxHp * 0.5) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, 10, LINE_Z + 30, 2); return; }
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
  goTo(p, inp, 6, LINE_Z + 4, 2);
};

export { mikatagahara };
