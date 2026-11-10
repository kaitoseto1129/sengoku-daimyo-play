// ======================================================================
// 鳥取城　渇え殺しの段（7:30〜15:00・docs/tottori_spec_1109.md「戦わない戦」）
// 柵の口を守った後、時が飛んで十月。
//   包囲線に穴＝「東の包囲線、突破されました！」。怖いのは敵でなく囲みが破れる事。抜けた者を止める（逃せば城が長く持つ）／
//   何も起きない時間＝西の柵の降人・柵の見張り台から自分で静かな城を見る・斥候の報告を聞く／
//   最後の出撃＝米を求めて打って出た城兵。米俵を抱えて城へ戻ろうとする者がいる。任務は「兵糧を守れ」／
//   明け方＝武器を持たない使者が白い布で来る。使者を本陣へ通す。
// 城の兵は段ごとに減っていく（坂の上に並ぶ城兵が少しずつ倒れ、旗が下りる）。終わると元の開城の段（envoy）へ。
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
import { tawara } from '../props.js';
import * as THREE from 'three';

// 到着する役目は、時間だけで果たしたことにしない。
const k15Go = (rt, id, pos, r, text, label, fn, o = {}) =>
  timedGo(rt, id, pos, r, text, label, (r2) => {
    // 着いた後の台詞の間もピンを切らさない（関所3）：着いた所に残し、次の行き先で置き換える
    const p = typeof pos === 'function' ? pos() : pos;
    if (p) { const at = { x: p.x, z: p.z }; rt.marker('k15', () => at, label, { h: o.h || 3, guideAlways: true }); }
    fn(r2);
  }, { ...o, limit: Infinity });

export function wrap(def, K) {
  const envoy = def.envoy;
  def.envoy = function (r) {
    const F = r.flags;
    if (k15Off(r) || F.hungerDone || F.step !== 2.5) return envoy.call(this, r);
    if (F.k15stage === 'hunger') return;
    start(r, K, () => { r.unmark('k15'); F.hungerDone = true; F.k15on = false; F.k15fight = false; F.stepT = r.t; envoy.call(this, r); });
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

// 抱えた米俵・白い布（使い回す形と材質）
let LOOK = null;
function looks() {
  if (LOOK) return LOOK;
  const bale = new THREE.CylinderGeometry(0.24, 0.24, 0.66, 8); bale.rotateZ(Math.PI / 2);
  const pole = new THREE.CylinderGeometry(0.02, 0.02, 2.2, 5); pole.translate(0, 1.1, 0);
  const cloth = new THREE.PlaneGeometry(0.55, 0.7); cloth.translate(0.29, 1.8, 0);
  LOOK = { bale, pole, cloth,
    straw: new THREE.MeshStandardMaterial({ color: 0xbfa66e, roughness: 0.95 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.9 }),
    white: new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.9, side: THREE.DoubleSide }) };
  return LOOK;
}
function holdBale(u) {
  if (!u?.mesh || u.ttBale) return;
  const L = looks(), m = new THREE.Mesh(L.bale, L.straw);
  m.position.set(0, 1.42, 0.28); u.mesh.add(m); u.ttBale = m;
}
function dropBale(u) { if (u?.ttBale) { u.ttBale.parent?.remove(u.ttBale); u.ttBale = null; } }
function whiteCloth(u) {
  if (!u?.mesh || u.ttWhite) return;
  const L = looks(), g = new THREE.Group();
  g.add(new THREE.Mesh(L.pole, L.wood), new THREE.Mesh(L.cloth, L.white));
  g.position.set(0.35, 0, 0.1); u.mesh.add(g); u.ttWhite = g;
}
const alive = (u) => u.alive && u.hp > 0 && !u.dying && !u.gone && !u.downed && !u.woundOut && !u.rearWound;

function start(rt, K, done) {
  const F = rt.flags, G = K.GATE, FZ = K.FENCE_Z;
  F.k15stage = 'hunger'; F.k15on = true; F.k15fight = false;
  F.ttSiege = F.ttSiege ?? 100;   // 包囲の保ち具合（内の値。画面に出さず、旗と城の静けさで見せる）
  const stop = () => F.k15stage !== 'hunger';
  let walls = null;
  // 城の旗を少しずつ下ろす（始め＝並ぶ／中＝減る／終わり＝ほとんど無い）
  const lowerFlags = (keep) => { const fl = F.castleFlags || []; fl.forEach((f, i) => { if (i >= Math.ceil(fl.length * keep)) f.visible = false; }); };
  // 城は見張り台から本人が見る。斥候の報告で視点を奪わず、旗と城兵の変化を残す。
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
  }, '十月　囲んで百日', '包囲は続く。待つことが、攻めになる');
  k15Scenes(rt, [
    [2.5, () => rt.say('斥候', '申し上げます。城内、兵糧尽きかけております', 4)],
    [4.5, () => rt.say('組頭', '急ぐな。囲みさえ破れねば、城は自ら弱る', 4)],
    [5, () => { sfx('messenger', 0.6); rt.say('使番', '申し上げます！　東の包囲線、突破されました！', 4); }],
  ], breach, stop);

  // 包囲線に穴：数人でも抜ければ、外から米を運び込める。敵より、囲みが破れる事が怖い
  function breach() {
    const from = { x: G.x + 42, z: FZ + 16 }, far = { x: G.x + 58, z: FZ + 62 };
    const run = enemyGroup(rt, { fixed: true, name: '囲みを抜けた城兵', faction: 'mori', anchor: from, facing: Math.PI, width: 3, aggro: 0, morale: 40 },
      dress([{ type: 'ashigaru', n: 6 }], K.HUNGRY));
    K.hungryLook?.(run); campWear(run, 50, 40);
    rt.banner('囲みに穴', '東の柵の間を、城の者が抜けた');
    rt.after(3, () => {
      if (stop() || run.routed) return;
      run.fixed = false; run.order = 'path'; run.formation = 'column'; run.path = [[far.x, far.z]]; run.pathIdx = 0;
      run.onArrive = () => {
        run.onArrive = null;
        if (stop() || F.k15at?.id !== 'hg-breach' && !F.ttBreachFight) return;
        // 抜けられた：一度のしくじりで負けにはしない。その分、城が長く持つ
        for (const u of run.units) if (u.alive) rt.army.despawn(u);
        F.ttLeak = (F.ttLeak || 0) + 1; F.ttSiege -= 30;
        if (F.k15at?.id === 'hg-breach') { F.k15at = null; rt.unmark('k15'); }
        rt.unmark('k15foe'); F.k15fight = false; F.ttBreachFight = false;
        rt.say('組頭', '抜けられた……　外の者が米を運び込むぞ。その分、城は長う持つ', 4.5);
        rt.after(5, quiet, true);
      };
    }, true);
    rt.marker('k15foe', centerOf(run), '囲みを抜けた城兵', { red: true, group: run });
    // 崩れた城兵を追わせず、抜けられた柵の穴へ戻って封鎖する。
    k15Go(rt, 'hg-breach', () => k15Live(run) ? run.center() : from, 12, '東の囲みの穴をふさげ', '囲みの穴', () => {
      F.k15fight = true; F.ttBreachFight = true; run.onArrive = null;
      if (k15Live(run)) k15Charge(rt, run, run.center());
      rt.say('足軽', '戻れ！　ここは通さぬ！', 3);
      const t0 = rt.t;
      const tick = () => {
        if (stop() || rt.over || !F.ttBreachFight) return;
        const left = k15Live(run), me = rt.player.u.pos, c = left ? run.center() : from;
        const near = Math.hypot(me.x - c.x, me.z - c.z) < 30;
        // 近くで待っただけでは穴をふさいだ扱いにしない。城兵が実際に減るまで守る。
        const sealed = near && repelled(rt, 0, 0, c) && (left <= 1 || left <= 3 && rt.t - t0 > 45);
        if (sealed || rt.t - t0 > 100) {
          F.ttBreachFight = false; F.k15fight = false; run.onArrive = null;
          k15Rout(rt, run, K.CASTLE); rt.unmark('k15foe');
          if (sealed) {
            F.ttSiege = Math.min(100, F.ttSiege + 10);
            rt.award((t) => t.side.push('包囲の穴をふさいだ'), '包囲の穴をふさいだ');
            rt.say('組頭', '穴はふさいだ。柵を立て直せ。城の者は山へ逃げ戻った', 4);
          } else {
            // 上限で段を終えても、離れた本人の守備成功にはしない。
            F.ttLeak = (F.ttLeak || 0) + 1; F.ttSiege -= 30;
            rt.say('組頭', '囲みの穴を守り切れなんだ。外から米が入れば、城は長う持つ', 4);
          }
          rt.after(5, quiet, true);
          return;
        }
        rt.after(0.5, tick, true);
      };
      tick();
    });
  }

  // 何も起きない時間が怖くなる：戦わず、城が静かになっていくのを見る
  function quiet() {
    if (stop()) return;
    lowerFlags(0.6); starve(rt, walls, 3);
    const west = { x: G.x - 24, z: FZ + 8 }, look = { x: G.x + 30, z: FZ + 12 };
    rt.banner('十月の半ば', '城から、炊ぐ煙が上がらなくなった');
    k15Scenes(rt, [
      [3, () => { sfx('kane', 0.2); rt.say('組頭', '西の柵に降人じゃ。話を聞け', 3.5); }],
    ], () => k15Go(rt, 'hg-west', west, 6, '西の柵で、城から来た者の話を聞け', '西の柵', () => {
      const man = evPerson(rt, 1, '吉川の足軽', { x: west.x, z: FZ - 4 }, 0, { calm: true });
      K.hungryLook?.(man);
      rt.banner('降人', '城から逃げて来た足軽が、槍を捨てて膝をつく');
      k15Scenes(rt, [
        [3, () => rt.say('吉川の足軽', 'お助けを……　城では、馬まで食い尽くし申した', 4.5)],
        [4.5, () => rt.say('吉川の足軽', '式部少輔様は、城の者を助けたいと、毎夜仰せで', 4.5)],
        [4.5, () => rt.say('組頭', '本陣へ送れ。粥は少しずつ与えよ。急に食わすと死ぬ', 4.5)],
        [4.5, () => { evRemove(rt, man); starve(rt, walls, 3); rt.award((t) => t.side.push('降人から城の様子を聞いた'), '降人から城の様子を聞いた'); }],
      ], () => k15Go(rt, 'hg-look', look, 6, '柵の見張り台から、城を見よ', '見張り台', () => {
        // 一番怖い場面：柵の上から城を見る。何も動いていない
        const extra = F.ttLeak ? [
          [5, () => rt.say('組頭', '抜けた者が運んだ米で、城はまだ持つ。待つしかない', 4.5)],
          [10, () => { lowerFlags(0.2); sfx('kane', 0.15); }],
        ] : [];
        k15Scenes(rt, [
          [1, () => rt.say('斥候', '申し上げます。城内、死人が出ております', 4)],
          [6, () => { starve(rt, walls, 4); lowerFlags(0.3); }],
          [2, () => rt.say('足軽', '静かになりましたな', 3.5)],
          [5.5, () => sfx('kane', 0.15)],
          [3, () => rt.say('斥候', '城内では、もう食うものがないそうです。', 4.5)],
          [5.5, () => rt.say('足軽', '……俺たちは、戦うておらぬ。それでも', 4)],
          ...extra,
          [4.5, () => { lowerFlags(0.15); rt.award((t) => t.side.push(F.ttLeak ? '囲みを保った（一度抜けられた）' : '囲みを破らせなかった'), '囲みを保った'); }],
        ], night, stop);
      }), stop);
    }), stop);
  }

  // その夜：最後の出撃。勝つためでなく、生き延びるための米を求めて
  function night() {
    if (stop()) return;
    const S = { x: G.x + 22, z: FZ + 22 };
    k15Fade(rt, () => {
      applyLook(rt, K.FENCE_NIGHT);
      rt.world.lookDark = true;
      rt.world.mountU.hazeCol.value.copy(rt.world.scene.fog.color);
      placePlayer(rt, S.x - 3, S.z + 4, Math.PI);
      if (!F.ttStore) {
        F.ttStore = [tawara(rt.world, S.x, S.z, 0.4, 6, { solid: false }), tawara(rt.world, S.x + 2.2, S.z + 1, 0.2, 5, { solid: false })];
        for (const m of F.ttStore) rt.scene.add(m);
      }
      if (F.hachi && !F.hachi.routed) placeGroup(rt, F.hachi, S.x - 6, S.z - 2);
      k15Squad(rt, S.x + 4, S.z + 4);
    }, 'その夜', '飢えた城兵が、米を求めて打って出た');
    const g = enemyGroup(rt, { fixed: true, name: '米を求める城兵', faction: 'mori', anchor: { x: G.x, z: FZ - 26 }, facing: 0, width: 5, aggro: 20, morale: 60 },
      dress([{ type: 'samurai', n: 1, o: { name: '城兵の組頭', flag: 'mori', flagScale: 0.6 } }, { type: 'ashigaru', n: 9 }], K.HUNGRY));
    // 米俵だけを狙う者：本人を相手にせず、俵を抱えて城へ戻ろうとする
    const thieves = enemyGroup(rt, { fixed: true, name: '米俵を狙う城兵', faction: 'mori', anchor: { x: G.x - 4, z: FZ - 30 }, facing: 0, width: 4, aggro: 0, morale: 30 },
      dress([{ type: 'ashigaru', n: 4 }], K.HUNGRY));
    K.hungryLook?.(g); K.hungryLook?.(thieves);
    // 動きが遅く、疲れ、士気が低い。それでも必死
    campWear(g, 80, 60); campWear(thieves, 80, 30); g.noRout = true;
    const N0 = k15Live(g);
    let stolen = 0;
    F.k15fight = true;
    rt.after(2, () => {
      if (stop()) return;
      rt.army.play?.('eshout', g.center(), 0.6);
      rt.say('足軽', '坂から城兵じゃ！　兵糧の俵へ向かうぞ！', 3.5);
      g.fixed = false; g.order = 'path'; g.formation = 'column'; g.followColumnRoad = true;
      g.path = [[G.x, FZ - 6], [G.x + 6, FZ + 10], [S.x, S.z - 2]]; g.pathIdx = 0;
      g.onArrive = () => { g.onArrive = null; k15Charge(rt, g, S); };
      thieves.fixed = false; thieves.order = 'path'; thieves.formation = 'column'; thieves.followColumnRoad = true; thieves.arriveNoncombat = true;
      thieves.path = [[G.x - 2, FZ - 6], [G.x + 4, FZ + 10], [S.x + 1, S.z]]; thieves.pathIdx = 0;
      thieves.onArrive = () => {
        thieves.onArrive = null;
        for (const u of thieves.units) if (alive(u)) holdBale(u);
        sfx('thud', 0.4);
        rt.say('足軽', '俵を抱えて逃げる気じゃ！', 3);
        thieves.order = 'path'; thieves.path = [[G.x + 4, FZ + 8], [G.x, FZ - 6], [G.x, FZ - 22]]; thieves.pathIdx = 0;
        rt.marker('k15foe2', centerOf(thieves), '米俵を抱えた城兵', { red: true, group: thieves });
        thieves.onArrive = () => {
          thieves.onArrive = null;
          for (const u of thieves.units) if (alive(u)) { stolen++; dropBale(u); rt.army.despawn(u); }
          rt.unmark('k15foe2');
          if (stolen) { F.ttLeak = (F.ttLeak || 0) + 1; rt.say('組頭', `${stolen > 2 ? '幾俵も' : '俵を'}持って行かれた……`, 3.5); }
        };
      };
      rt.marker('k15foe', centerOf(g), '米を求める城兵', { red: true, group: g });
      rt.obj('main', '柵の口の兵糧を守れ', 'main', true);
      // 行き先は兵糧の俵（追って山へ登らせない。bot もここへ戻る）
      F.k15at = { id: 'hg-store', at: () => S, r: 8, t0: rt.t, fight: true };
      rt.marker('k15', () => S, '兵糧の俵', { h: 3, guideAlways: true });
      rt.after(9, () => { if (!stop()) rt.say('足軽', 'まだ出てくるのか……', 3); }, true);
      const t0 = rt.t;
      let held = 0, lastT = rt.t;
      const tick = () => {
        if (stop() || rt.over) return;
        const left = k15Live(g), el = rt.t - t0;
        const me = rt.player.u;
        const guarding = repelled(rt, 0, 0, S) && Math.hypot(me.pos.x - S.x, me.pos.z - S.z) <= 26;
        let contact = false;
        for (const u of g.units) {
          if (!alive(u) || u.fleeing || u.noTarget) continue;
          if (Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) <= 18) contact = true;
        }
        if (!guarding) held = 0; else if (contact) held += rt.t - lastT;
        lastT = rt.t;
        // 俵を狙う者が討たれるか、城へ逃げ込むまで待つ（抱えて逃げる者を見逃して先へ進めない）
        const thievesDone = thieves.units.every((u) => !alive(u) || u.fleeing);
        // 斬り尽くすまで待たない。半ばが倒れて一分余り、本人が兵糧の所を守っていれば、残りは城へ引く。
        // 詰まらない決まり：三分近く経てば、本人が生きている限り城兵は力尽きて引く（倒しきるのを条件にしない）
        const defended = guarding && thievesDone &&
          (left <= 2 || el > 75 && left <= Math.ceil(N0 / 2) || held >= 90);
        if (defended || el > 170) {
          F.k15at = null;
          k15Rout(rt, g, K.CASTLE); k15Rout(rt, thieves, K.CASTLE);
          for (const u of thieves.units) dropBale(u);
          rt.unmark('k15foe'); rt.unmark('k15foe2'); rt.unmark('k15'); F.k15fight = false;
          starve(rt, walls, 4); lowerFlags(0.1);
          // 城兵が力尽きる時間上限は、本人が守り抜いた証にはしない。
          if (defended) rt.award((t) => t.side.push(stolen ? '兵糧庫を守った（幾俵か奪われた）' : '兵糧を一俵も渡さなかった'), '兵糧を守った');
          rt.say('組頭', '……もう城に、打って出る力は残っておらぬ', 4);
          rt.after(4.5, dawn, true);
          return;
        }
        rt.after(0.5, tick, true);
      };
      tick();
    }, true);
  }
  // 明け方：武器を持たない使者が、白い布を掲げて下りる。使者を本陣へ通す
  function dawn() {
    if (stop()) return;
    k15Fade(rt, () => {
      applyLook(rt, DAWN); rt.world.lookDark = false;
      if (F.farFires) F.farFires.visible = false;
      placePlayer(rt, G.x + 4, FZ + 12, Math.PI);
    }, '明け方', '城の坂を、白い布を掲げた使者が下りて来る');
    const man = evPerson(rt, 1, '吉川の使者', { x: G.x, z: FZ - 18 }, 0, { calm: true });
    const meeting = { x: G.x, z: FZ + 2 };
    // 本人だけ先に着いても、遠い使者の書状や返答を受け取ったことにしない。
    const envoyNear = (at, radius) => man.units.some((u) => u.alive && !u.gone && !u.dying &&
      !u.downed && !u.woundOut && !u.rearWound && u.hp > 0 &&
      Math.hypot(u.pos.x - at.x, u.pos.z - at.z) <= radius);
    whiteCloth(man.units[0]);
    man.order = 'path'; man.path = [[G.x, FZ - 4]]; man.pathIdx = 0; man.noAI = false;
    rt.after(2, () => { if (!stop()) rt.say('組頭', '槍を下ろせ。白い布じゃ。誰も手を出すな', 4); }, true);
    k15Go(rt, 'hg-envoy', meeting, 7, '柵の口で、城の使者を迎えよ', '柵の口', () => {
      k15Scenes(rt, [
        [1, () => rt.say('吉川の使者', '吉川式部少輔より、羽柴筑前守様へ。書状にござる', 4.5)],
        [4.5, () => rt.say('組頭', '本陣へお通しする。わしらが供をせよ', 4)],
      ], talks, stop);
    }, { limit: 50, canArrive: () => envoyNear(meeting, 10) });
    // 本陣の口で官兵衛が迎える。経家は、自分の命と引き換えに城の者を助けよと譲らない（『石見吉川家文書』の筋）
    function talks() {
      if (stop()) return;
      const camp = { x: G.x + 6, z: FZ + 34 };
      const kan = evPerson(rt, 0, '黒田官兵衛', camp, Math.PI, { calm: true });
      man.order = 'path'; man.path = [[G.x + 2, FZ + 10], [camp.x - 2, camp.z - 3]]; man.pathIdx = 0; man.noAI = false;
      k15Go(rt, 'hg-kanbei', () => kan.center(), 6, '使者を本陣へ通せ', '本陣', () => {
        k15Scenes(rt, [
          [0.5, () => rt.say('吉川の使者', '式部少輔様ら城将は腹を切る。残る城の者の命を、助けたまわれ', 5)],
          [5, () => rt.say('黒田官兵衛', '殿の返事じゃ。式部少輔殿は毛利から来た客将。腹を切るには及ばぬ、と', 5)],
          [5, () => rt.say('吉川の使者', '……式部少輔様は承知いたしますまい。城を預かった将が、腹を切らずに済むものかと', 5)],
          [5, () => { rt.banner('経家の申し入れ', '自分の命と引き換えに、城の者を助けよと'); rt.say('黒田官兵衛', '……義士じゃな。殿にそう申し上げる', 4); }],
          [4.5, () => { rt.award((t) => t.side.push('城の使者を本陣へ通した'), '城の使者を本陣へ通した'); evRemove(rt, man); evRemove(rt, kan); }],
        ], done, stop);
      }, { limit: 40, canArrive: () => envoyNear(camp, 6) });
    }
  }
}
