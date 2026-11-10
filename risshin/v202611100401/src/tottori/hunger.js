// ======================================================================
// 鳥取城　渇え殺しの段（9〜12分・docs/oda15_plan_1108.md 29「時間経過・城内飢餓の演出・兵が減る」）
// 柵の口を守った後、時が飛んで十月。柵を東・西と見回る（着いた所で必ず何かが起きる）：
//   東の柵＝城から迷い出た飢えた者が柵の外で倒れる／西の柵＝降人が城の内の様子を話す／
//   その夜＝死に物狂いの城兵が柵へ寄せる／明け方＝経家の使者が白い布を掲げて坂を下りる（降伏の申し入れ）。
// 城の兵は段ごとに減っていく（坂の上に並ぶ城兵が少しずつ倒れ、消える）。終わると元の開城の段（envoy）へ。
// 入れ方：b_tottori.js で定義の後に wrap(def, K) を一度。def.envoy を包む。
// ======================================================================
import { k15Off, k15Squad, k15Go as timedGo, k15Scenes, k15Fade, k15Rout, k15Charge } from '../oda15_kit.js';
import { fightingCount as k15Live, repelled } from './combat.js';
import { enemyGroup, centerOf } from '../bhelp.js';
import { evPerson, evRemove } from '../b_ev6.js';
import { applyLook, DAWN, dress } from '../b_inabayama.js';
import { placeGroup, placePlayer } from '../b_opening.js';
import { campWear } from '../kakoi.js';
import { sfx } from '../audio.js';

// 到着する役目は、時間だけで果たしたことにしない。
const k15Go = (rt, id, pos, r, text, label, fn, o = {}) =>
  timedGo(rt, id, pos, r, text, label, fn, { ...o, limit: Infinity });

export function wrap(def, K) {
  const envoy = def.envoy;
  def.envoy = function (r) {
    const F = r.flags;
    if (k15Off(r) || F.hungerDone || F.step !== 2.5) return envoy.call(this, r);
    if (F.k15stage === 'hunger') return;
    start(r, K, () => { F.hungerDone = true; F.k15on = false; F.k15fight = false; F.stepT = r.t; envoy.call(this, r); });
  };
}

// 坂の上に並ぶ城兵（遠くから見える、減っていく城の兵）
function wallMen(rt, K) {
  const G = K.GATE, list = [];
  for (let i = 0; i < 3; i++) {
    const g = enemyGroup(rt, { fixed: true, noAI: true, name: '木戸の上の城兵', faction: 'mori', anchor: { x: G.x - 10 + i * 10, z: G.z - 8 }, facing: 0, width: 5, aggro: 0, morale: 50 },
      dress([{ type: 'ashigaru', n: 6, o: { keep: true } }], K.HUNGRY));
    K.hungryLook?.(g);
    for (const u of g.units) { u.noTarget = true; u.invuln = true; }
    list.push(g);
  }
  return list;
}
// 城の兵を n 人倒す（飢えで倒れる）
function starve(rt, gs, n) {
  for (const g of gs) for (const u of g.units) {
    if (n <= 0) return;
    if (!u.alive || u.gone) continue;
    u.invuln = false; u.noTarget = false;
    try { rt.army.kill(u, null); } catch (e) { rt.army.despawn(u); }
    n--;
  }
}

// 月が変わる暗転で夜討ちの帰還を終える。柵で詰まった古い寄せを見回りへ持ち越さない。
export function settleSallies(rt, K) {
  for (const [i, g] of (rt.flags.sallies || []).entries()) {
    g.onArrive = null; g.path = null; g.pathIdx = 0; g.focus = null;
    g.noAI = true; g.order = 'hold'; g.fire = false;
    g.aggro = 0; g.seekRange = 0; g.retreatOnly = false;
    g.ttRetreat = false; g.ttReturned = true;
    g.formation = 'line'; g.width = 4;
    g.anchor.x = K.GATE.x + (i - 1) * 8; g.anchor.z = K.GATE.z - 18;
    g._face = g.facing = 0; g._slotFit = null; g._routeCols = 0;
    for (const u of g.units) {
      u.target = null; u.atk = null; u.swing = null; u.watch = null;
      u.noTarget = true;
      if (!u.alive || u.dying || u.downed || u.hp <= 0 || u.gone || u.woundOut || u.rearWound) continue;
      const at = g.slotPos(u.slot, g.initial);
      u.fleeing = false; u.moveTo = null; u.heading = 0;
      u.pos.x = at.x; u.pos.z = at.z; u.pos.y = rt.world.heightAt(at.x, at.z);
    }
  }
}

function start(rt, K, done) {
  const F = rt.flags, G = K.GATE, FZ = K.FENCE_Z;
  F.k15stage = 'hunger'; F.k15on = true; F.k15fight = false;
  const stop = () => F.k15stage !== 'hunger';
  let walls = null;
  k15Fade(rt, () => {
    settleSallies(rt, K);
    applyLook(rt, { ...DAWN, time: 'dusk', sun: 0xd8a070, sunI: 0.9, glow: 0.18 });
    rt.world.lookDark = false;
    if (F.farFires) F.farFires.visible = true;
    placePlayer(rt, G.x + 6, FZ + 14, Math.PI);
    if (F.hachi && !F.hachi.routed) placeGroup(rt, F.hachi, G.x, FZ + 10);
    k15Squad(rt, G.x + 10, FZ + 18);
    walls = wallMen(rt, K);
    F.k15walls = walls;
  }, '十月　囲んで百日', '城の米は尽きた。柵の外へ迷い出る者が増えた');
  const east = { x: G.x + 24, z: FZ + 8 }, west = { x: G.x - 24, z: FZ + 8 };
  k15Scenes(rt, [
    [2.5, () => rt.say('組頭', '城の内は、もう草の根も無いそうな。柵を見回るぞ', 4.5)],
    [4.5, () => rt.say('足軽', '木戸の上の城兵、昨日より少のうござる', 4)],
  ], () => k15Go(rt, 'hg-east', east, 6, '東の柵を見回れ', '東の柵', () => {
    // 東の柵：城から迷い出た飢えた者たちが、柵の外で食べ物を乞い、倒れる
    const beg = enemyGroup(rt, { fixed: true, noAI: true, name: '迷い出た城の者', faction: 'mori', anchor: { x: east.x - 2, z: FZ - 7 }, facing: 0, width: 5, aggro: 0, morale: 5 },
      dress([{ type: 'ashigaru', n: 7, o: { keep: true } }], K.HUNGRY));
    K.hungryLook?.(beg);
    for (const u of beg.units) { u.noTarget = true; u.fat = 1; }
    rt.banner('柵の外に、痩せた者たち', '食べ物を乞う声。槍は向けるなと下知が出ている');
    k15Scenes(rt, [
      [3, () => rt.say('城の者', '米を……　ひと口でよい、米を……', 4)],
      [4, () => { starve(rt, [beg], 3); sfx('thud', 0.5); rt.say('足軽', '倒れた……　息をしておらぬ', 3.5); }],
      [4, () => { starve(rt, walls, 4); rt.say('組頭', '見よ、木戸の上でも人が倒れた。城は限りじゃ', 4); }],
      [4, () => { k15Rout(rt, beg, K.CASTLE); rt.award((t) => t.side.push('東の柵を見回った'), '東の柵を見回った'); }],
    ], () => k15Go(rt, 'hg-west', west, 6, '西の柵を見回れ', '西の柵', () => {
      // 西の柵：降人が柵を越えて来る。城の内の様子を聞く
      const man = evPerson(rt, 1, '吉川の足軽', { x: west.x, z: FZ - 4 }, 0, { calm: true });
      K.hungryLook?.(man);
      rt.banner('降人', '城から逃げて来た足軽が、槍を捨てて膝をつく');
      k15Scenes(rt, [
        [3, () => rt.say('吉川の足軽', 'お助けを……　城では、牛も馬も食い尽くし申した', 4.5)],
        [4.5, () => rt.say('吉川の足軽', '式部少輔様は、城の者を助けたいと、毎夜仰せで', 4.5)],
        [4.5, () => rt.say('組頭', '縄をかけて本陣へ送れ。粥は少しずつ与えよ。急に食わすと死ぬ', 4.5)],
        [4.5, () => { evRemove(rt, man); starve(rt, walls, 4); rt.award((t) => t.side.push('降人から城の様子を聞いた'), '降人から城の様子を聞いた'); }],
      ], () => night(), stop);
    }), stop);
  }), stop);

  // その夜：死に物狂いの城兵が柵へ寄せる
  function night() {
    k15Fade(rt, () => {
      applyLook(rt, K.FENCE_NIGHT);
      rt.world.lookDark = true;
      rt.world.mountU.hazeCol.value.copy(rt.world.scene.fog.color);
      placePlayer(rt, G.x + 4, FZ + 12, Math.PI);
      if (F.hachi && !F.hachi.routed) placeGroup(rt, F.hachi, G.x, FZ + 12);
      k15Squad(rt, G.x + 10, FZ + 18);
    }, 'その夜', '飢えた城兵が、死に物狂いで柵へ寄せる');
    const g = enemyGroup(rt, { fixed: true, name: '死に物狂いの城兵', faction: 'mori', anchor: { x: G.x, z: FZ - 26 }, facing: 0, width: 5, aggro: 20, morale: 90 },
      dress([{ type: 'samurai', n: 1, o: { name: '城兵の組頭', flag: 'mori', flagScale: 0.6 } }, { type: 'ashigaru', n: 11 }], K.HUNGRY));
    K.hungryLook?.(g); campWear(g, 70, 90); g.noRout = true;
    const N0 = k15Live(g);
    const post = { x: G.x, z: FZ + 4 };
    F.k15fight = true;
    rt.after(2, () => {
      if (stop()) return;
      rt.army.play?.('eshout', g.center(), 0.8);
      rt.say('足軽', '坂から城兵じゃ！　死ぬ気で来るぞ！', 3.5);
      // 見回り先の本人へ直進すると、左右の柵に掛かる。開いた口を通ってから寄せる。
      g.fixed = false; g.order = 'path'; g.formation = 'column'; g.followColumnRoad = true;
      g.path = [[G.x, FZ - 6], [post.x, post.z]]; g.pathIdx = 0;
      g.onArrive = () => { g.onArrive = null; k15Charge(rt, g, post); };
      rt.marker('k15foe', centerOf(g), '死に物狂いの城兵', { red: true, group: g });
      rt.obj('main', '柵の口で、死に物狂いの城兵を止めよ', 'main', true);
      const t0 = rt.t;
      let held = 0, lastT = rt.t;
      const tick = () => {
        if (stop() || rt.over) return;
        const left = k15Live(g), el = rt.t - t0;
        const me = rt.player.u;
        const guarding = repelled(rt, 0, 0, post) && me.pos.z >= FZ &&
          Math.hypot(me.pos.x - G.x, me.pos.z - FZ) <= 24;
        let contact = false, inside = 0;
        for (const u of g.units) {
          if (!u.alive || u.hp <= 0 || u.dying || u.gone || u.downed || u.fleeing || u.woundOut || u.rearWound || u.noTarget) continue;
          if (u.pos.z > FZ + 22) inside++;
          if (Math.hypot(u.pos.x - post.x, u.pos.z - post.z) <= 18 &&
              Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) <= 18 &&
              !rt.army.wallBetween(u.pos, -1, me.pos)) contact = true;
        }
        // 残数だけを待つと、柵で押し合う寄せが終わらない。実際に迎え撃った刻も数える。
        // 離脱・四人以上の突破で数え直し、放置や行軍の時間は手柄にしない。
        if (!guarding || inside >= 4) held = 0;
        else if (contact) held += rt.t - lastT;
        lastT = rt.t;
        rt.objProgress('main', `城兵 ${left}／${N0}`);
        // 坂に残った城兵を待ち続けない。半ばを討って一分余り経ち、本人が柵を守っていれば残りは城へ引く。
        // 時間だけで、放置や持ち場からの離脱を成功にしない。
        if (guarding && inside < 4 && (left <= 2 || el > 75 && left <= Math.ceil(N0 / 2) || held >= 90 && left < N0)) {
          k15Rout(rt, g, K.CASTLE); rt.unmark('k15foe'); F.k15fight = false;
          starve(rt, walls, 4);
          rt.award((t) => t.side.push('夜の寄せを柵で止めた'), '夜の寄せを柵で止めた');
          rt.say('組頭', 'もう城に、打って出る力は残っておらぬ', 4);
          rt.after(4.5, dawn, true);
          return;
        }
        rt.after(0.5, tick, true);
      };
      tick();
    }, true);
  }
  // 明け方：経家の使者が白い布を掲げて下りる（降伏の申し入れ）
  function dawn() {
    if (stop()) return;
    k15Fade(rt, () => {
      applyLook(rt, DAWN); rt.world.lookDark = false;
      if (F.farFires) F.farFires.visible = false;
      placePlayer(rt, G.x + 4, FZ + 12, Math.PI);
    }, '明け方', '城の坂を、白い布を掲げた使者が下りて来る');
    const man = evPerson(rt, 1, '吉川の使者', { x: G.x, z: FZ - 18 }, 0, { calm: true });
    man.order = 'path'; man.path = [[G.x, FZ - 4]]; man.pathIdx = 0; man.noAI = false;
    k15Go(rt, 'hg-envoy', { x: G.x, z: FZ + 2 }, 7, '柵の口で、城の使者を迎えよ', '柵の口', () => {
      k15Scenes(rt, [
        [1, () => rt.say('吉川の使者', '吉川式部少輔より、羽柴筑前守様へ。書状にござる', 4.5)],
        [4.5, () => rt.say('吉川の使者', '式部少輔様ら城将は腹を切る。残る城の者の命を、助けたまわれ', 5)],
        [5, () => { rt.banner('経家の申し入れ', '城将の自害と引き換えに、城兵と民の助命を'); rt.say('組頭', 'しかと承った。本陣へお届けする', 4); }],
        [4.5, () => { rt.award((t) => t.side.push('経家の使者を迎えた'), '経家の使者を迎えた'); }],
      ], talks, stop);
    }, { limit: 50 });
    // 掛け合い：官兵衛が本陣の返事を持って来る。秀吉は経家を助け、責めを森下・中村に負わせよと言うが、経家は承知しない（『石見吉川家文書』の筋）
    function talks() {
      if (stop()) return;
      const kan = evPerson(rt, 0, '黒田官兵衛', { x: G.x + 6, z: FZ + 34 }, Math.PI, { calm: true });
      k15Go(rt, 'hg-kanbei', () => kan.center(), 6, '本陣から来た官兵衛のもとへ', '黒田官兵衛', () => {
        k15Scenes(rt, [
          [0.5, () => rt.say('黒田官兵衛', '殿の返事じゃ。式部少輔殿は毛利から来た客将。腹を切るには及ばぬ', 5)],
          [5, () => rt.say('黒田官兵衛', '責めは、城を毛利に渡した森下・中村の二人が負えばよい、と', 4.5)],
          [4.5, () => rt.say('吉川の使者', '……式部少輔様は承知いたしますまい。城を預かった将が、腹を切らずに済むものかと', 5)],
          [5, () => { rt.banner('経家、譲らず', '自分の命と引き換えに、城の者を助けよと'); rt.say('黒田官兵衛', '……義士じゃな。殿にそう申し上げる', 4); }],
          [4.5, () => { evRemove(rt, man); evRemove(rt, kan); }],
        ], done, stop);
      }, { limit: 40 });
    }
  }
}
