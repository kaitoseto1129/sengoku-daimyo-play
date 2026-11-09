// ======================================================================
// 天王寺・岡山の戦い　岡山口の段（四天王寺の南の段と、真田の突撃の段の間に入る）
// 史実：岡山口では大野治房の勢が前田利常の加賀勢とぶつかり、押し込んだ一手が将軍秀忠の本陣へ斬り込み、本陣が一時乱れた。
//   秀忠の旗本が立て直し、前田・井伊・藤堂の手が押し返して、治房の勢は城へ退いた（治房は討たれず落ちのびる）。
// 遊び：毛利の先手を食い止めた後、使番の知らせで東の岡山口へ走り、乱れた秀忠の本陣の脇（西）を固める。
//   前の前田勢と治房の本隊は軽い大軍（clash・addDistantArmy）で見せ、本陣へ斬り込む治房の一手だけを本物の兵にする。
//   治房は馬廻に守られて討てない（守りを散らすと退く）。主人公が脇で踏み止まると、秀忠から声が掛かる（手柄の場面）。
// 入れ方：b_k15_tennoji_okayama.js の setup で install(rt, this) を一度呼ぶ。stage2 を包み、岡山口を挟んでから元の stage2 へ渡す。
// 向き：北が -z、東が +x。岡山口は天王寺口の東（実の一キロ半ほど）を遊びのため縮めて置く。
// ======================================================================
import { allyGroup, enemyGroup, centerOf, nm } from '../bhelp.js';
import { jinmaku, nobori, kagaribi, umajirushi } from '../props.js';
import { clash } from '../b_sekigahara.js';
import { flagTexture } from '../textures.js';
import { isTouch } from '../touch.js';
import { sfx } from '../audio.js';
import { KILLS, cut } from '../stages.js';
import { revealName } from '../battle_intel.js';

const OKA_HON = { x: 30, z: 86 };      // 将軍秀忠の本陣（陣幕の内）
const OKA_SIDE = { x: 14, z: 72 };     // 本陣の脇（西の口）。主人公の持ち場
const OKA_FRONT = { x: 44, z: 40 };    // 前田勢と大野治房の本隊が押し合う前線
const OKA_LIMIT = 150;   // 11/9 一戦十五〜十八分に収める。             // 段の長さの限り（秒）。過ぎたら天王寺口へ戻る（負けにはしない）。11/8 kaito「天王寺は一戦20〜30分」で75から延ばす
const S = Math.PI;

const TOKU = { armor: 0x1f1e1c, flag: 'tokugawa' };
const ONO = { armor: 0x221f1c, flag: 'toyotomi' };
const kit = (side, o = {}) => ({ flag: side.flag, armor: side.armor, ...o });
const sq = (side, type, n, o) => ({ type, n, o: kit(side, o) });
// 本物の兵の枠（二百五十）に収める：天王寺口の兵が残る間は、治房の先手を削って出す（半分まで）
const fit = (rt, sqs, cap = 246) => {
  let n = 0; for (const u of rt.army.units) if (u.alive) n++;
  const room = cap - n, tot = sqs.reduce((a, q) => a + q.n, 0);
  if (tot <= room) return sqs;
  const f = Math.max(0.35, room / tot);
  return sqs.map((q) => ({ ...q, n: Math.max(1, Math.round(q.n * f)) }));
};
const alive = (g) => g && !g.routed && g.count > 0;
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
const sum = (gs) => (gs || []).reduce((s, g) => s + (alive(g) ? g.count : 0), 0);
const hold = (g, x, z) => { if (!g || g.routed) return; g.anchor = { x, z }; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null; };
const flee = (gs) => { for (const g of gs) if (alive(g)) { g.noRout = false; g.routed = true; g.order = 'flee'; } };

// 陣幕・幟・篝火と、遠くの前田勢・治房の本隊（軽い作り）。戦の初めに置く
function scenery(rt) {
  const W = rt.world;
  rt.scene.add(jinmaku(W, OKA_HON.x, OKA_HON.z + 4, 14, 10, 5, { mon: 'tokugawa', noUma: true }));
  // 将軍秀忠の金扇。既存形を一基だけ共用する（docs/generals_look_1108/徳川秀忠.md）。
  rt.scene.add(umajirushi(W, OKA_HON.x + 0.6, OKA_HON.z + 10, S, 'ogi'));
  for (let i = 0; i < 8; i++) { const a = -1.1 + (i / 7) * 2.2; rt.scene.add(nobori(W, OKA_HON.x + Math.sin(a) * 13, OKA_HON.z + 2 - Math.cos(a) * 11, 'tokugawa', 6)); }
  for (const [x, z] of [[OKA_HON.x - 4, OKA_HON.z - 5], [OKA_HON.x + 5, OKA_HON.z - 5]]) rt.scene.add(kagaribi(W, x, z));
  for (const [x, z] of [[OKA_FRONT.x - 8, OKA_FRONT.z + 14], [OKA_FRONT.x + 6, OKA_FRONT.z + 15], [OKA_FRONT.x + 18, OKA_FRONT.z + 13]]) rt.scene.add(nobori(W, x, z, 'maeda', 6));
  for (const [x, z] of [[OKA_FRONT.x - 6, OKA_FRONT.z - 14], [OKA_FRONT.x + 10, OKA_FRONT.z - 15]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
  if (W.addDistantArmy) {
    // 前田利常の加賀勢の後ろ備え（前線の南東）と、大野治房の本隊の後ろ（前線の北）
    W.addDistantArmy({ x: OKA_FRONT.x + 26, z: OKA_FRONT.z + 30, w: 30, d: 12, count: isTouch ? 60 : 140, facing: S, armor: 0x2a2622, flagTex: flagTexture('maeda'), kind: 'mixed', host: false, seed: 16151 });
    W.addDistantArmy({ x: OKA_FRONT.x + 4, z: OKA_FRONT.z - 30, w: 32, d: 12, count: isTouch ? 60 : 140, facing: 0, team: 1, armor: 0x221f1c, flagTex: flagTexture('toyotomi'), kind: 'mixed', host: false, seed: 16152 });
  }
}

const stage = {
  // 岡山口の段：毛利の先手を食い止めた後に入る
  start(rt, def, next) {
    const F = rt.flags;
    F.step = 'oka'; F.tS = rt.t; F.oka = { next, t0: rt.t };
    const O = F.oka;
    rt.unmark('k15');
    // 天王寺口の毛利の手は、本多を破った所でひと息つく（主人公のいない間に先手を押し潰さない）
    for (const g of [F.mori, F.katsu, F.kimura]) if (alive(g)) { const c = centerOf(g)(); hold(g, c.x, c.z); g.aggro = 6; g.seekRange = 8; }
    // 前線：前田勢（A・北を向く）と治房の本隊（B）が組み合う
    O.clash = clash(rt, { x: OKA_FRONT.x, z: OKA_FRONT.z, facing: S, w: 28, gap0: 0, seed: 16153, host: false, noRout: true, killRate: 0.02, maxDrift: 3,
      A: { flag: 'maeda', armor: 0x2a2622, count: isTouch ? 40 : 70, flagRate: 0.25 }, B: { flag: 'toyotomi', armor: 0x221f1c, count: isTouch ? 40 : 70, flagRate: 0.25, guns: true } });
    O.clash?.go?.();
    O.clash?.push?.('B', 0.5);   // 初めは治房が押す
    // 将軍の本陣：秀忠（討てない）と旗本
    O.hon = allyGroup(rt, { faction: 'tokugawa', name: '将軍の旗本', anchor: { x: OKA_HON.x, z: OKA_HON.z - 4 }, facing: S, width: 10, aggro: 8, seekRange: 12, order: 'hold', fixed: true, noRout: true, fullStrength: true, formation: 'yari' },
      [sq(TOKU, 'busho', 1, { name: '徳川秀忠', invuln: true, horse: true }), sq(TOKU, 'samurai', 8), sq(TOKU, 'ashigaru', 6)]);
    O.hon.dmgMult = 0.6; O.hon.defMult = 1.6; O.hon.directOrders = true;
    O.hide = O.hon.units.find((u) => u.name === '徳川秀忠');
    // 11/8 kaito：秀忠が討たれたら負け（b_k15_tennoji_okayama.js の onKill）。旗本に守られ、厚い具足で討たれにくい
    if (O.hide) { O.hide.invuln = false; O.hide.hp = O.hide.maxHp = Math.round((O.hide.maxHp || 190) * 9); }
    // 前線の後ろに前田利常（加賀勢）と、東に井伊直孝（赤備え）の大将を置く。持ち場を守るだけ
    O.maeda = allyGroup(rt, { faction: 'tokugawa', name: '前田利常の備', anchor: { x: OKA_FRONT.x + 4, z: OKA_FRONT.z + 14 }, facing: S, width: 6, aggro: 4, seekRange: 6, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      [sq({ armor: 0x2a2622, flag: 'maeda' }, 'busho', 1, { name: '前田利常', invuln: true, horse: true }), sq({ armor: 0x2a2622, flag: 'maeda' }, 'samurai', 4)]);
    O.ii = allyGroup(rt, { faction: 'tokugawa', name: '井伊直孝の備', anchor: { x: OKA_FRONT.x + 26, z: OKA_FRONT.z + 16 }, facing: S, width: 6, aggro: 4, seekRange: 6, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      [sq({ armor: 0xa52b1c, flag: 'ii' }, 'busho', 1, { name: '井伊直孝', invuln: true, horse: true }), sq({ armor: 0xa52b1c, flag: 'ii' }, 'samurai', 4)]);
    // 本陣へ斬り込む治房の一手（本物の兵）。治房は馬廻に守られる
    O.ono = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '大野治房の先手', anchor: { x: OKA_SIDE.x - 4, z: OKA_SIDE.z - 30 }, facing: 0, width: 10, aggro: 4, seekRange: 6, order: 'hold', morale: 100, noRout: true, formation: 'yari' },
      fit(rt, [sq(ONO, 'samurai', 6), sq(ONO, 'ashigaru', 14), sq(ONO, 'gun', 4)], 237));
    O.onoB = enemyGroup(rt, { fixed: true, faction: 'toyotomi', name: '大野治房の馬廻', anchor: { x: OKA_SIDE.x + 6, z: OKA_SIDE.z - 40 }, facing: 0, width: 6, aggro: 4, seekRange: 6, order: 'hold', morale: 100, noRout: true },
      [sq(ONO, 'busho', 1, { name: '大野治房', invuln: true, horse: true, hat: 'kabuto_g' }), sq(ONO, 'samurai', 8)]);
    O.onoU = O.onoB.units.find((u) => u.name === '大野治房');
    // 岡山口の大将は自分の隊が輪になる。大将の旗本の輪（taisho_guard.js）を別に足さない（本物の兵の枠を食わない）
    for (const g of [O.hon, O.maeda, O.ii, O.onoB]) for (const u of g.units) if (u.type === 'busho' && u.name) u.keep = true;
    revealName(rt, '大野治房');
    O.s = [O.ono, O.onoB]; O.n = sum(O.s);
    rt.obj('main', '将軍の本陣の脇を固める', 'main');
    rt.marker('k15', { x: OKA_SIDE.x, z: OKA_SIDE.z }, '将軍の本陣の脇');
    rt.banner('岡山口', '大野治房の勢が将軍の本陣へ');
    rt.say('使番', '岡山口の将軍様の本陣へ、大野治房の手が斬り込んだ！　東へ走り、本陣の脇を固めよ！', 3.8);
    rt.after(4.2, () => rt.say('大野治房', '前田の備えは割れた。狙うは秀忠の首じゃ！', 3.2));
    // 治房の先手が本陣の脇（西の口）へ走る
    rt.after(6, () => { for (const g of [O.ono, O.onoB]) if (alive(g)) { g.order = 'move'; g.stay = true; g.dest = { x: OKA_SIDE.x, z: OKA_SIDE.z }; g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.aggro = 18; q.seekRange = 30; q.anchor = { x: OKA_SIDE.x, z: OKA_SIDE.z }; }; } });
    // 本陣が一時乱れる：旗本の一部が浮き足立って南へ逃げる（史実）
    rt.after(10, () => this.waver(rt));
  },
  waver(rt) {
    const O = rt.flags.oka;
    if (!O || O.done || O.wavered) return;
    O.wavered = true;
    rt.banner('将軍の本陣が乱れる', '旗本が浮き足立つ');
    sfx('taiko', 0.6);
    O.clash?.shake?.('A', 0.15);
    let k = 0;
    for (const u of O.hon?.units || []) if (u.alive && u !== O.hide && k < 4) { u.moraleFleeDir = { x: 0.2, z: 1 }; u.fleeing = true; u.fleeT = rt.army.time; u.target = null; k++; }
    rt.say('徳川秀忠', '退くな！　旗本が背を見せて何とする！', 3.2);
  },
  // 主人公が脇で踏み止まった：本陣が立て直る（手柄の場面）
  rally(rt) {
    const O = rt.flags.oka;
    if (O.rallied) return;
    O.rallied = true;
    if (alive(O.hon)) { O.hon.defMult = 2.2; O.hon.morale = 100; for (const u of O.hon.units) if (u.alive && u.fleeing) { u.fleeing = false; } }
    rt.say(nm(rt), '本陣の脇はこの手で固める！　一人も通すな！', 3);
    rt.after(3.4, () => rt.say('徳川秀忠', '旗本、立て直せ！　あの者に続け！', 3));
  },
  update(rt, dt) {
    const F = rt.flags, O = F.oka;
    if (!O || O.done || F.ending) return;
    const P = rt.player.u.pos, el = rt.t - O.t0;
    const atSide = near(P, OKA_SIDE, 14);
    if (atSide) O.sideT = (O.sideT || 0) + dt;
    if (!O.rallied && (O.sideT || 0) > 2) this.rally(rt);
    // 治房の手は本陣の脇を目がけ、主人公や逃げる者を追って外へ流れない
    if (!(O.reT > rt.t)) {
      O.reT = rt.t + 2;
      for (const g of O.s) if (alive(g) && g.order === 'attack') { g.anchor = { x: OKA_SIDE.x, z: OKA_SIDE.z }; }
      // 治房は先手が減ると馬廻と退く（討たせない）
      if (alive(O.onoB) && sum([O.ono]) <= (O.n - 9) * 0.4 && !O.onoBack) { O.onoBack = true; flee([O.onoB]); rt.say('大野治房', '前田が盛り返した……退け、城へ退け！', 3); O.clash?.push?.('A', 0.7); }
    }
    // 守りの崩れ：先手が三割まで減るか、時が過ぎたら天王寺口へ戻る
    const left = sum(O.s);
    if (left <= O.n * 0.3 || (el > 140 && left <= O.n * 0.5) || el > OKA_LIMIT) this.end(rt);
  },
  end(rt) {
    const F = rt.flags, O = F.oka;
    if (O.done) return;
    O.done = true;
    rt.unmark('k15');
    flee([O.ono, O.onoB]);
    O.clash?.push?.('A', 1);
    O.clash?.rout?.('B', { from: 0, hideAfter: 20 });
    if (alive(O.hon)) hold(O.hon, OKA_HON.x, OKA_HON.z - 4);
    if (O.hide) O.hide.invuln = true;   // 岡山口が収まった後は、秀忠の身は危うくない（天王寺口の戦の間に逃げる兵に討たれて負けにしない）
    const mine = !!O.rallied;
    if (mine) rt.award((t) => t.side.push('岡山口で将軍の本陣の脇を固めた'), '将軍の本陣の脇を固めた');
    rt.banner('岡山口、持ち直す', '前田・井伊・藤堂の手が治房を押し返す');
    rt.say('徳川秀忠', mine ? 'その方、よう脇を支えた。名は覚えたぞ' : '本陣は持ち直した。天王寺口へ急げ', 3.4);
    // 段を天王寺口の真田の突撃へ渡す（元の stage2）
    rt.after(3.6, () => { F.oka.passed = true; O.next(rt); });
  },
};

// bot：近い敵を突き、本陣の脇へ
function botOka(b, inp, { goTo }) {
  const F = b.flags, p = b.player, u = p.u, O = F.oka;
  inp.quickCmd = null; inp.leftPressed = false; inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  // 命が半ばを切ったら本陣の後ろ（南）で息を整え、八割で戻る（11/8：岡山口へ傷を負ったまま入り、そのまま討たれた）
  const R = b._k15 || (b._k15 = { rest: false });
  if (!R.rest && u.hp < u.maxHp * 0.5) R.rest = true;
  if (R.rest && u.hp > u.maxHp * 0.8) R.rest = false;
  if (R.rest) { goTo(p, inp, OKA_HON.x + 10, OKA_HON.z + 34, 2); return; }
  const e = b.army.nearestEnemy(u, 12, (o) => !o.noTarget && !o.isStruct && !o.fleeing && !o.invuln && o.type !== 'dummy');
  if (e && near(u.pos, OKA_SIDE, 30)) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    return;
  }
  const g = O && O.s.find(alive);
  const to = g && near(g.center(), OKA_SIDE, 16) ? g.center() : OKA_SIDE;
  goTo(p, inp, to.x, to.z, 3);
}

// 一度だけ def を包む（戦の初めごとに呼ばれても二重に包まない）
export function install(rt, ctx) {
  scenery(rt);
  if (ctx._okaInstalled) return;
  ctx._okaInstalled = true;
  const stage2 = ctx.stage2, update = ctx.update;
  ctx.stage2 = function (r, ...a) {
    const F = r.flags;
    if (F.oka?.passed || F.ending) return stage2.call(this, r, ...a);
    if (F.oka) return;   // 岡山口の最中に重ねて呼ばれても入らない
    stage.start(r, this, (q) => stage2.call(this, q, ...a));
  };
  ctx.update = function (r, dt) {
    const out = update.call(this, r, dt);
    if (r.flags.step === 'oka') stage.update(r, dt);
    return out;
  };
  const brain = ctx.botBrain;
  ctx.botBrain = function (b, inp, h) {
    if (b.flags.step === 'oka' && !b.flags.oka?.done) return botOka(b, inp, h);
    return brain ? brain.call(this, b, inp, h) : false;
  };
  const kills = KILLS[ctx.id || 'k15_tennoji_okayama'];
  KILLS[ctx.id || 'k15_tennoji_okayama'] = (r) => {
    const O = r.flags.oka;
    if (r.flags.step === 'oka' && O && !O.done) return cut(O.n, sum(O.s), O.n * 0.4);
    return kills ? kills(r) : null;
  };
}
