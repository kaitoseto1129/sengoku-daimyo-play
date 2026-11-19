// ======================================================================
// 鳥取城　渇え殺しの段（7:30〜15:00・docs/tottori_spec_1109.md「戦わない戦」）
// 柵の口を守った後、時が飛んで十月。
//   包囲線に穴＝「東の包囲線、突破されました！」。怖いのは敵でなく囲みが破れる事。抜けた者を止める（逃せば城が長く持つ）／
//   何も起きない時間＝東の柵の降人・柵の見張り台から自分で静かな城を見る・斥候の報告を聞く／
//   最後の出撃＝米を求めて打って出た城兵。米俵を抱えて城へ戻ろうとする者がいる。任務は「兵糧を守れ」／
//   明け方＝武器を持たない使者が白い布で来る。使者を本陣へ通す。
// 城の兵は段ごとに減っていく（坂の上に並ぶ城兵が少しずつ倒れ、旗が下りる）。終わると元の開城の段（envoy）へ。
// 入れ方：b_tottori.js で定義の後に wrap(def, K) を一度。def.envoy を包む。
// ======================================================================
import { k15Off, k15Squad, k15Go as timedGo, k15Scenes, k15Fade, k15Rout, k15Charge } from '../oda15_kit.js';
import { fightingCount as k15Live, repelled } from './combat.js';
import { enemyGroup, allyGroup, centerOf } from '../bhelp.js';
import { evPerson, evRemove } from '../b_ev6.js';
import { applyLook, DAWN, dress } from '../b_inabayama.js';
import { placeGroup, placePlayer } from '../b_opening.js';
import { campWear } from '../kakoi.js';
import { sfx } from '../audio.js';
import { tawara } from '../props.js';
import * as THREE from 'three';

// 最後の寄せの刻限は、予約の連鎖だけでなく戦の更新から確かめる。
// 半秒ごとに調べ、途中再開で時刻が戻った時も次の点検を待ち越さない。

// 到着する役目は、時間だけで果たしたことにしない。
// 11/19 クラウド持ち主 02:45（中学生の bot：段5「東の柵で、城から来た者の話を聞け」が448→1081秒と六百秒止まり、
//   本人は印「東の柵」に着いたまま。0.5秒ごとの予約の連鎖が途切れていた）：行き先を F.ttGo に覚え、下の wrap の update からも
//   着きを確かめる（一度しか呼ばない）。印の十二m 内で九十秒、または二百秒経っても着かなければ着いた事にして先へ送る（K175）。
const k15Go = (rt, id, pos, r, text, label, fn, o = {}) => {
  let fired = false;
  const go = (r2) => {
    if (fired) return;
    fired = true;
    if (rt.flags.ttGo?.id === id) rt.flags.ttGo = null;
    // 着いた後の台詞の間もピンを切らさない（関所3）：着いた所に残し、次の行き先で置き換える
    const p = typeof pos === 'function' ? pos() : pos;
    if (p) { const at = { x: p.x, z: p.z }; rt.marker('k15', () => at, label, { h: o.h || 3, guideAlways: true }); }
    fn(r2);
  };
  rt.flags.ttGo = { id, pos, r, t0: rt.t, near: null, go };
  timedGo(rt, id, pos, r, text, label, go, { ...o, limit: Infinity });
};

export function wrap(def, K) {
  const update = def.update;
  def.update = function (r, dt) {
    update.call(this, r, dt);
    // 11/18 クラウド持ち主 05:05（act bot 0451 の回：明け方の使者の段が430→1229秒と八百秒止まり、本人は本陣の印の5m 前に立ったまま）：
    //   段の見張り（0.5秒ごとの予約）が途切れても、明け方から百秒で使者の段を閉じて開城の段へ送る（K175）
    const D = r.flags.ttDawn;
    if (D && !D.closed && !r.flags.hungerDone && r.flags.k15stage === 'hunger' && !r.over && !r.flags.ending && r.t - D.t > 100) {
      D.closed = true; r.flags.k15at = null; D.finish();
    }
    const TG = r.flags.ttGo;
    if (TG && r.flags.k15stage === 'hunger' && !r.over && !r.flags.ending && r.player?.u?.alive !== false) {
      const p = typeof TG.pos === 'function' ? TG.pos() : TG.pos, me = r.player.u.pos;
      const d = p ? Math.hypot(me.x - p.x, me.z - p.z) : 0;
      if (d < 12) { if (TG.near == null) TG.near = r.t; } else TG.near = null;
      if (!p || d < TG.r || (TG.near != null && r.t - TG.near > 90) || r.t - TG.t0 > 200) {
        if (r.flags.k15at?.id === TG.id || !r.flags.k15at) { r.flags.k15at = null; r.unmark('k15'); }
        TG.go(r);
      }
    }
    const BG = r.flags.ttBreachGo;
    if (BG && !BG.done && r.flags.k15stage === 'hunger' && !r.over && !r.flags.ending && r.t - BG.t0 > 70) {
      BG.done = true;
      if (r.flags.k15at?.id === 'hg-breach') { r.flags.k15at = null; r.unmark('k15'); BG.arrived(); }
    }
    // 穴の斬り合いの見張りも、予約が二秒途切れたらここから回す
    if (BG && BG.tick && r.flags.ttBreachFight && r.flags.k15stage === 'hunger' && !r.over && r.t - BG.tickT > 2) BG.tick();
    const check = r.flags.ttStoreCheck;
    if (!check) return;
    if (r.over || r.flags.ending || r.flags.k15stage !== 'hunger') {
      r.flags.ttStoreCheck = null; return;
    }
    // 11/18 K358：前の段の遅れた予約が行き先（k15at）を書き換えても、兵糧の段の見張りを外さない
    //   （act bot が「柵の口の兵糧を守れ」のまま十五分止まった）。行き先を兵糧の俵へ戻して見張りを続ける。
    if (r.flags.k15at?.id !== 'hg-store' && check.store) r.flags.k15at = check.store;
    if (r.t < check.last) check.next = r.t;
    check.last = r.t;
    if (r.t >= check.next) { check.next = r.t + 0.5; check.tick(); }
  };
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
    // 救助待ちの者も alive は真。すでに倒れた兵を再び選んで人数を減らさない。
    if (!alive(u)) continue;
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
// 白旗を迎えた朝から停戦する。退却の到着処理や古い狙いを交渉へ持ち越さない。
function ceasefire(rt) {
  for (const g of rt.army.groups) {
    g.order = 'hold'; g.path = null; g.pathIdx = 0; g.onArrive = null;
    g.focus = null; g.fire = false; g.aggro = 0; g.seekRange = 0; g.noRout = true;
    g.routed = false; g.ttRetreat = false; g.retreatOnly = false;
    for (const u of g.units) {
      u.noTarget = true; u.target = null; u.atk = null; u.swing = null; u.watch = null; u.dmg = 0;
      if (alive(u)) { u.fleeing = false; u.moveTo = null; }
    }
  }
}
const alive = (u) => u.alive && u.hp > 0 && !u.dying && !u.gone && !u.downed && !u.woundOut && !u.rearWound;

function start(rt, K, done) {
  const F = rt.flags, G = K.GATE, FZ = K.FENCE_Z;
  F.k15stage = 'hunger'; F.k15on = true; F.k15fight = false;
  // 11/19 クラウド持ち主（中学生の bot：段5の四分の間、夜討ちの「柵の内の守り場」の輪が残り、囲みの穴・東の柵・俵の印と並んで、
  //   本人が守り場（10,20）と穴の間を行き来した）：段4の守り場の案内はここで消す（段6の始めで消すのと同じ）
  rt.unmark('return');
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
    F.ttBreachEscaped = false;
    const from = { x: G.x + 42, z: FZ + 16 }, far = { x: G.x + 58, z: FZ + 62 };
    // 11/19 クラウド持ち主（中学生の bot：印「囲みの穴」が柵の外（68,74）へ動き、本人が百m 迷って百十秒この段が続いた）：
    //   隊の anchor に印と同じ物を渡していたので、隊が抜けて行くとピンも動いた。写しを渡す（俵の列の nida.js と同じ根）
    // 11/19 クラウド持ち主（act bot：穴の六人は士気四十で、着く前に味方の組に崩され、本人の前は逃げる二人だけ。
    //   段5の見回り百秒で斬り合いが一度も無かった）：抜ける者を組頭の侍と八人にし、士気を柵の口の城兵と同じ五十五へ。
    //   飢えた城兵は米のために死に物狂いで抜ける（史料の渇え殺しの記事）。数は柵の口の一組（十一）より少なく保つ
    const run = enemyGroup(rt, { fixed: true, name: '囲みを抜けた城兵', faction: 'mori', anchor: { ...from }, facing: Math.PI, width: 3, aggro: 0, morale: 55 },
      dress([{ type: 'samurai', n: 1, o: { name: '城兵の組頭', flag: 'mori', flagScale: 0.6 } }, { type: 'ashigaru', n: 8 }], K.HUNGRY));
    // 士気は campWear の上限で四十へ下がっていた（11/19 act bot：着いて十秒・一人討たれて崩れた）。疲れだけ残し、士気は五十五のまま
    K.hungryLook?.(run); campWear(run, 50, 55);
    rt.banner('囲みに穴', '東の柵の間を、城の者が抜けた');
    rt.after(3, () => {
      if (stop() || run.routed) return;
      run.fixed = false; run.order = 'path'; run.formation = 'column'; run.path = [[far.x, far.z]]; run.pathIdx = 0;
      run.onArrive = () => {
        run.onArrive = null;
        if (stop() || F.k15at?.id !== 'hg-breach' && !F.ttBreachFight) return;
        // 討死・深手・敗走・停戦の後の到着通知では、補給を通したことにしない。
        // 柵の穴の役目は残し、本人が戻って封鎖したことを確かめる。
        if (rt.over || !k15Live(run)) return;
        // 抜けられた：一度のしくじりで負けにはしない。その分、城が長く持つ
        for (const u of run.units) if (alive(u) && !u.fleeing && !u.noTarget) rt.army.despawn(u);
        F.ttLeak = (F.ttLeak || 0) + 1; F.ttSiege -= 30;
        F.ttBreachEscaped = true;
        rt.unmark('k15foe'); F.k15fight = false; F.ttBreachFight = false;
        rt.say('組頭', '抜けられた……　外の者が米を運び込むぞ。その分、城は長う持つ', 4.5);
      };
    }, true);
    rt.marker('k15foe', centerOf(run), '囲みを抜けた城兵', { red: true, group: run });
    // 崩れた城兵を追わせず、抜けられた柵の穴へ戻って封鎖する。
    const arrived = () => {
      if (F.ttBreachGo) F.ttBreachGo.done = true;
      // 抜けられても穴へ戻る役目と印を残す。戻った後に封鎖し、撃退の手柄にはしない。
      if (F.ttBreachEscaped) {
        rt.say('組頭', '柵を立て直せ。抜けた者は追うな。これ以上、米を通すな', 4);
        rt.after(5, quiet, true);
        return;
      }
      F.k15fight = true; F.ttBreachFight = true; run.onArrive = null;
      // 本人が穴に着いたら、退き道の無い城兵は斬り合う。崩すのは下の見張り（減ったか百秒）の k15Rout に任せる
      if (k15Live(run)) { k15Charge(rt, run, run.center()); run.noRout = true; }
      rt.say('足軽', '戻れ！　ここは通さぬ！', 3);
      const t0 = rt.t;
      const tick = () => {
        if (stop() || rt.over) return;
        if (F.ttBreachGo) { F.ttBreachGo.tick = tick; F.ttBreachGo.tickT = rt.t; }
        // 11/18 クラウド持ち主 05:10：斬り合いの最中に城兵が穴を抜けきると（run.onArrive が ttBreachFight を下ろす）、
        //   この見張りが黙って終わり、次の段（静かな見張り台）へ進まなかった。抜けられた時も柵を立て直して次へ送る
        if (!F.ttBreachFight) {
          if (F.ttBreachEscaped) { rt.say('組頭', '柵を立て直せ。抜けた者は追うな。これ以上、米を通すな', 4); rt.after(5, quiet, true); }
          return;
        }
        const left = k15Live(run), me = rt.player.u.pos;
        const near = Math.hypot(me.x - from.x, me.z - from.z) < 30;
        // 近くで待っただけでは穴をふさいだ扱いにしない。城兵が実際に減るまで守る。
        const sealed = near && repelled(rt, 0, 0, from) && (left <= 1 || left <= 3 && rt.t - t0 > 45);
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
    };
    // 11/19 クラウド持ち主（中学生の bot：印「囲みの穴」の段が400→1260秒と八百秒止まり時間切れ。本人は柵の内（z15）で印の13m 手前）：
    //   ①印は柵の外の穴（z28）なので、柵の内から届く十五m で着いた事に②段の見張り（0.5秒ごとの予約）が途切れても、
    //   七十秒で着いた事にして先へ送る（使者の段の ttDawn と同じ見張り・下の wrap の update）
    F.ttBreachGo = { t0: rt.t, arrived, done: false };
    k15Go(rt, 'hg-breach', from, 15, '東の囲みの穴をふさげ', '囲みの穴', arrived);
  }

  // 何も起きない時間が怖くなる：戦わず、城が静かになっていくのを見る
  function quiet() {
    if (stop()) return;
    lowerFlags(0.6); starve(rt, walls, 3);
    // 11/18 クラウド持ち主 08:40：通しが500〜540秒（4〜7分を越える）。穴（G.x+42）→西の柵（G.x-24）→見張り台（G.x+30）と
    //   柵沿いを百二十m 往復していたので、降人は見張り台の手前の柵へ来させる（歩きの二十秒余りを削る）
    const west = { x: G.x + 22, z: FZ + 8 }, look = { x: G.x + 30, z: FZ + 12 };
    // 11/18 夜50-34（300秒の写真・初めての人の目）：西の柵から見張り台へ歩く間、二万の囲みの柵に番の兵が一人もおらず、本人ひとりが夜の野を歩いた。
    //   柵の内に槍の番を二組（本物・戦わない）立てて城を向かせ、その夜の出撃の暗転で下げる。
    if (!F.ttFenceWatch) F.ttFenceWatch = [[G.x - 8, FZ + 3], [G.x + 42, FZ + 8]].map(([x, z]) => allyGroup(rt,
      { fixed: true, fullStrength: true, stay: true, noAI: true, name: '柵の番', anchor: { x, z }, facing: Math.PI, order: 'hold', width: 9, aggro: 0 },
      [{ type: 'ashigaru', n: 6, o: { keep: true } }]));
    for (const g of F.ttFenceWatch) for (const u of g.units) u.noTarget = true;
    rt.banner('十月の半ば', '城から、炊ぐ煙が上がらなくなった');
    k15Scenes(rt, [
      [3, () => { sfx('kane', 0.2); rt.say('組頭', '柵に降人じゃ。話を聞け', 3.5); }],
    ], () => k15Go(rt, 'hg-west', west, 6, '東の柵で、城から来た者の話を聞け', '東の柵', () => {
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
          // 静かな間は残し、台詞が重ならない幅まで詰める（11/18 クラウド持ち主：通しで8分半＝4〜7分を越えるため 27.5→20秒）
          [1, () => rt.say('斥候', '申し上げます。城内、死人が出ております', 4)],
          [4, () => { starve(rt, walls, 4); lowerFlags(0.3); }],
          [2, () => rt.say('足軽', '静かになりましたな', 3.5)],
          [3.5, () => sfx('kane', 0.15)],
          [1, () => rt.say('斥候', '城内では、もう食うものがないそうです。', 4.5)],
          [4.5, () => rt.say('足軽', '……俺たちは、戦うておらぬ。それでも', 4)],
          ...extra,
          [4, () => { lowerFlags(0.15); rt.award((t) => t.side.push(F.ttLeak ? '囲みを保った（一度抜けられた）' : '囲みを破らせなかった'), '囲みを保った'); }],
        ], night, stop);
      }), stop);
    }), stop);
  }

  // その夜：最後の出撃。勝つためでなく、生き延びるための米を求めて
  function night() {
    if (stop()) return;
    const S = { x: G.x + 22, z: FZ + 22 };
    k15Fade(rt, () => {
      for (const g of F.ttFenceWatch || []) evRemove(rt, g);
      F.ttFenceWatch = null;
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
    // 暗転中に城道へ置く。近くの新手を隠す処理で、柵の外の山腹へ移さない。
    const g = enemyGroup(rt, { noGuard: true, fixed: true, name: '米を求める城兵', faction: 'mori', anchor: { x: G.x, z: FZ - 12 }, facing: 0, width: 5, aggro: 20, morale: 60 },
      dress([{ type: 'samurai', n: 1, o: { name: '城兵の組頭', flag: 'mori', flagScale: 0.6 } }, { type: 'ashigaru', n: 9 }], K.HUNGRY));
    // 米俵だけを狙う者：本人を相手にせず、俵を抱えて城へ戻ろうとする
    const thieves = enemyGroup(rt, { noGuard: true, fixed: true, name: '米俵を狙う城兵', faction: 'mori', anchor: { x: G.x - 2, z: FZ - 15 }, facing: 0, width: 4, aggro: 0, morale: 30 },
      dress([{ type: 'ashigaru', n: 4 }], K.HUNGRY));
    K.hungryLook?.(g); K.hungryLook?.(thieves);
    // 動きが遅く、疲れ、士気が低い。それでも必死
    campWear(g, 80, 60); campWear(thieves, 80, 30); g.noRout = true;
    const N0 = k15Live(g);
    let stolen = 0, g2 = null;
    F.k15fight = true;
    rt.after(2, () => {
      if (stop()) return;
      rt.army.play?.('eshout', g.center(), 0.6);
      rt.say('足軽', '坂から城兵じゃ！　兵糧の俵へ向かうぞ！', 3.5);
      g.fixed = false; g.order = 'path'; g.formation = 'column'; g.colW = 2; g.roadColumn = true; g.followColumnRoad = true;
      g.path = [[G.x, FZ - 6], [G.x + 6, FZ + 10], [S.x, S.z - 2]]; g.pathIdx = 0;
      g.onArrive = () => {
        g.onArrive = null;
        // 夜襲を終えた後や、寄せ手が崩れた後の到着で攻撃を再開しない。
        if (stop() || rt.over || F.k15at?.id !== 'hg-store' || !k15Live(g)) return;
        k15Charge(rt, g, S);
        // 兵糧の持ち場を襲う。本人を追って俵から遠くへ離れない。
        g.focus = null; g.path = null; g.pathIdx = 0;
      };
      thieves.fixed = false; thieves.order = 'path'; thieves.formation = 'column'; thieves.colW = 2; thieves.roadColumn = true; thieves.followColumnRoad = true; thieves.arriveNoncombat = true;
      thieves.path = [[G.x - 2, FZ - 6], [G.x + 4, FZ + 10], [S.x + 1, S.z]]; thieves.pathIdx = 0;
      thieves.onArrive = () => {
        thieves.onArrive = null;
        if (stop() || rt.over || F.k15at?.id !== 'hg-store' || !k15Live(thieves)) return;
        for (const u of thieves.units) if (alive(u) && !u.fleeing && !u.noTarget) holdBale(u);
        sfx('thud', 0.4);
        rt.say('足軽', '俵を抱えて逃げる気じゃ！', 3);
        thieves.order = 'path'; thieves.path = [[G.x + 4, FZ + 8], [G.x, FZ - 6], [G.x, FZ - 22]]; thieves.pathIdx = 0;
        rt.marker('k15foe2', centerOf(thieves), '米俵を抱えた城兵', { red: true, group: thieves });
        thieves.onArrive = () => {
          thieves.onArrive = null;
          if (stop() || rt.over || F.k15at?.id !== 'hg-store' || !k15Live(thieves)) return;
          // 敗走や離脱へ移った者を、遅れた到着通知で補給成功に数えない。
          for (const u of thieves.units) if (alive(u) && !u.fleeing && !u.noTarget) { stolen++; dropBale(u); rt.army.despawn(u); }
          rt.unmark('k15foe2');
          if (stolen) { F.ttLeak = (F.ttLeak || 0) + 1; rt.say('組頭', `${stolen > 2 ? '幾俵も' : '俵を'}持って行かれた……`, 3.5); }
        };
      };
      rt.marker('k15foe', centerOf(g), '米を求める城兵', { red: true, group: g });
      rt.obj('main', '柵の口の兵糧を守れ', 'main', true);
      // 行き先は兵糧の俵（追って山へ登らせない。bot もここへ戻る）
      F.k15at = { id: 'hg-store', at: () => S, r: 8, t0: rt.t, fight: true };
      rt.marker('k15', () => S, '兵糧の俵', { h: 3, guideAlways: true });
      // 11/18 クラウド（見回り「相手少なく退屈」）：「まだ出てくるのか」の通り、少し遅れて二の手が東の坂から出る。
      //   俵へ寄せるだけで本人を山へ誘わない。撃退の判定は一の手のまま、終わりで一緒に城へ引かせる。
      rt.after(8, () => {
        if (stop() || rt.over || F.k15at?.id !== 'hg-store') return;
        g2 = enemyGroup(rt, { noGuard: true, fixed: true, name: '続いて打って出た城兵', faction: 'mori', anchor: { x: G.x + 6, z: FZ - 14 }, facing: 0, width: 4, aggro: 18, morale: 50 },
          dress([{ type: 'ashigaru', n: 7 }], K.HUNGRY));
        K.hungryLook?.(g2); campWear(g2, 85, 50); g2.noRout = true;
        g2.fixed = false; g2.order = 'path'; g2.formation = 'column'; g2.colW = 2; g2.roadColumn = true; g2.followColumnRoad = true;
        g2.path = [[G.x + 8, FZ - 6], [G.x + 12, FZ + 10], [S.x + 3, S.z - 1]]; g2.pathIdx = 0;
        g2.onArrive = () => {
          g2.onArrive = null;
          if (stop() || rt.over || F.k15at?.id !== 'hg-store' || !k15Live(g2)) return;
          k15Charge(rt, g2, S); g2.focus = null; g2.path = null; g2.pathIdx = 0;
        };
        rt.army.play?.('eshout', g2.center(), 0.5);
      }, true);
      rt.after(9, () => { if (!stop()) rt.say('足軽', 'まだ出てくるのか……', 3); }, true);
      // 守った刻も写しへ入れる。途中再開で閉包の刻だけ先へ残さない。
      const check = { t0: rt.t, held: 0, lastT: rt.t, next: rt.t + 0.5, last: rt.t, tick: null, store: F.k15at };
      const tick = () => {
        if (stop() || rt.over) return;
        const left = k15Live(g), el = rt.t - check.t0;
        const me = rt.player.u;
        // 11/18 クラウド持ち主（bot の数え：一の手は城の道を西へ大回りし、二の手は坂の上で百秒止まり、俵の本人へ一人も来なかった）：
        //   一の手は二十秒、二の手は（出て）二十秒で道を捨てて俵へ寄せる。
        // 11/19 クラウド持ち主（中学生の bot 431秒：俵に着いても城兵は坂の上で、6秒なにも起きない）：
        //   本人が俵の前（十m 内）に着いたら、二十秒待たずに一の手を俵へ寄せ、二の手も出て三秒で寄せる
        const atStore = Math.hypot(me.pos.x - S.x, me.pos.z - S.z) <= 10;
        if ((el > 20 || atStore && el > 3) && g.onArrive) {
          if (el <= 20 && !check.called) { check.called = true; rt.say('組頭', '来るぞ！　俵の前で槍を揃えよ', 3); }
          g.onArrive(g);
        }
        if ((el > 28 || atStore && el > 11) && g2?.onArrive) g2.onArrive(g2);
        const guarding = repelled(rt, 0, 0, S) && Math.hypot(me.pos.x - S.x, me.pos.z - S.z) <= 26;
        let contact = false;
        for (const u of g.units) {
          if (!alive(u) || u.fleeing || u.noTarget) continue;
          if (Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) <= 18) contact = true;
        }
        if (!guarding) check.held = 0; else if (contact) check.held += Math.max(0, rt.t - check.lastT);
        check.lastT = rt.t;
        // 俵を抱えた者の帰還は待つ。荷を取れず道に残った者だけで、撃退後も待ち続けない。
        let carrying = false;
        for (const u of thieves.units) if (alive(u) && !u.fleeing && !u.noTarget && u.ttBale) carrying = true;
        // 護衛を半ばまで押し返した条件は、下の撃退判定とそろえる。
        // 三〜五人が道に残った時も、俵を持つ者がいなければ荷の決着を待ち続けない。
        // 11/18 クラウド持ち主（act bot 7回のうち5回が上限110秒で終わり「兵糧を守った」が出ない）：
        //   二の手（7人）も同じ俵へ寄せるのに、撃退は一の手だけで数えていた。二つの手を合わせて半ばが倒れれば押し返した事にする。
        const both = left + (g2 ? k15Live(g2) : 0), N = N0 + (g2 ? g2.units.length : 0);
        const repulsed = left <= 2 && both <= 4 || el > 50 && both <= Math.ceil(N / 2) || check.held >= 75;
        const thievesDone = k15Live(thieves) === 0 || el > 70 && repulsed && !carrying;
        // 斬り尽くすまで待たない。半ばが倒れて一分余り、本人が兵糧の所を守っていれば、残りは城へ引く。
        // 詰まらない決まり：三分近く経てば、本人が生きている限り城兵は力尽きて引く（倒しきるのを条件にしない）
        // 寄せた城兵が一人も残らなければ、本人が俵から離れていても守り切った事にする（追って戻る間を待たない）。
        const defended = thievesDone && (guarding && repulsed || both === 0 && el > 20);
        // 11/18 クラウド持ち主（act bot 560秒・この段だけで165秒＝4〜7分を越えた）：上限を170→110秒、押し返しの見なしを75→60秒・俵の決着を90→70秒に縮めた
        if (defended || el > 110) {
          F.ttStoreCheck = null;
          F.k15at = null;
          // 夜襲を終えた後に、古い到着処理で俵を拾ったり損失を知らせたりしない。
          g.onArrive = thieves.onArrive = null;
          if (g2) { g2.onArrive = null; k15Rout(rt, g2, K.CASTLE); }
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
      };
      check.tick = tick; F.ttStoreCheck = check;
      tick();
    }, true);
  }
  // 明け方：武器を持たない使者が、白い布を掲げて下りる。使者を本陣へ通す
  function dawn() {
    if (stop()) return;
    ceasefire(rt);
    k15Fade(rt, () => {
      applyLook(rt, DAWN); rt.world.lookDark = false;
      if (F.farFires) F.farFires.visible = false;
      placePlayer(rt, G.x + 4, FZ + 12, Math.PI);
    }, '明け方', '城の坂を、白い布を掲げた使者が下りて来る');
    const man = evPerson(rt, 1, '吉川の使者', { x: G.x, z: FZ - 18 }, 0,
      { calm: true, g: { noGuard: true, arriveNoncombat: true, noRout: true, fixed: false,
        formation: 'column', colW: 1, roadColumn: true, followColumnRoad: true } });
    // 迎える官兵衛も同じ暗転中に置く。後から別の場所へ隠されると、
    // 本人の行き先と使者の到着先が離れ、双方が着いても交渉が始まらない。
    const camp = { x: G.x + 6, z: FZ + 28 };   // 11/18 クラウド持ち主：口から本陣の官兵衛まで32→26m（使者の歩きを詰める）
    const kan = evPerson(rt, 0, '黒田官兵衛', camp, Math.PI,
      { calm: true, g: { noGuard: true, noRout: true } });
    const meeting = { x: G.x, z: FZ + 2 };
    // 本人だけ先に着いても、遠い使者の書状や返答を受け取ったことにしない。
    const envoyNear = (at, radius) => man.units.some((u) => u.alive && !u.gone && !u.dying &&
      !u.downed && !u.woundOut && !u.rearWound && u.hp > 0 &&
      Math.hypot(u.pos.x - at.x, u.pos.z - at.z) <= radius);
    whiteCloth(man.units[0]);
    // 11/18 クラウド持ち主 07:50：白い布の使者を本人の槍が突けて、手傷で退いていた（act bot の数え「吉川の使者」を本人が討つ）。
    //   手傷で退いた使者は envoyNear に数えられず、迎える段が止まる元にもなる。使者は刃を受けない（本陣の幕の内と同じ扱い）。
    for (const u of man.units) u.campProtected = true;
    F.ttDawn = { t: rt.t, closed: false, finish: () => {
      rt.unmark('k15');
      rt.award((t) => t.side.push('城の使者を本陣へ通した'), '城の使者を本陣へ通した');
      evRemove(rt, man); evRemove(rt, kan); done();
    } };
    man.order = 'path'; man.path = [[G.x, FZ - 4], [meeting.x, meeting.z]]; man.pathIdx = 0; man.noAI = false;
    // 11/18 クラウド持ち主 09:00：使者の段が41〜59秒（通しが7分を越える元の一つ）。坂を下る歩みを並の歩きの速い方へ（走らせない）
    man.speed = Math.max(man.speed || 0, 2.0);
    rt.after(2, () => { if (!stop()) rt.say('組頭', '槍を下ろせ。白い布じゃ。誰も手を出すな', 4); }, true);
    // 使者が口の手前で足を止めても、本人が迎えに行って書状を受け取れる。
    // 空の集合地点で、一人の歩みだけを無期限に待たせない。
    // 11/18 クラウド持ち主（act bot：459〜463秒にピン「吉川の使者」が城の坂の歩けない所に立った）：
    //   使者が坂の上にいる間は柵の口にピンを立てて待たせ、口の近く（16m 内）まで下りてから使者へ移す。
    // 11/18 クラウド持ち主 04:40（act bot 695秒の回：この段が417→618秒と二百秒続き、ピン「吉川の使者」が三度歩けない所に立った）：
    //   使者が歩けない所（柵・俵の際）にいる時はピンを柵の口に残す。本人が口で待って十秒経てば使者を本人へまっすぐ歩かせ、
    //   二十秒経てば二十五m 内の使者を迎えた事にする（K175）。
    // 11/19 クラウド持ち主 04:20（写真⑥ 352秒：本人が口で待つ間、ピン「吉川の使者」が本人の頭の真上に立ち、本人の体が隠れた）：
    //   本人が口（印の四m 内）に着いて使者がまだ遠い間は、ピンを使者が下りて来る側（口の外の道・四m 先）へ出す
    const ahead = { x: G.x, z: FZ - 2 };
    const welcome = () => {
      if (!envoyNear(meeting, 16)) {
        const me = rt.player.u.pos;
        const d = Math.hypot(me.x - meeting.x, me.z - meeting.z);
        // 一度出したら、本人が口から八m 離れるまで戻さない（ピンが二つの点を行き来しない）
        if (d < 4 && rt.world.walkable(ahead.x, ahead.z)) man.ttAhead = true; else if (d > 8) man.ttAhead = false;
        return man.ttAhead ? ahead : meeting;
      }
      const c = man.center();
      return c && rt.world.walkable(c.x, c.z) ? c : meeting;
    };
    let waitT = null;
    const envoyMet = () => {
      const me = rt.player.u.pos;
      if (envoyNear(me, 10)) return true;
      if (Math.hypot(me.x - meeting.x, me.z - meeting.z) > 12 && !envoyNear(me, 14)) { waitT = null; return false; }
      if (waitT == null) waitT = rt.t;
      const w = rt.t - waitT;
      if (w > 10 && !man.ttCall) {
        man.ttCall = true;
        rt.say('組頭', '使者殿、こちらへ。誰も手は出さぬ', 3);
        man.order = 'path'; man.path = [[me.x, me.z]]; man.pathIdx = 0; man.noAI = false; man.noRun = false;
        man.speed = Math.max(man.speed || 0, 2.4);
      }
      return w > 20 && envoyNear(me, 25);
    };
    k15Go(rt, 'hg-envoy', welcome, 7, '柵の口で、城の使者を迎えよ', '吉川の使者', () => {
      k15Scenes(rt, [
        [1, () => rt.say('吉川の使者', '吉川式部少輔より、羽柴筑前守様へ。書状にござる', 4.5)],
        [4.5, () => rt.say('組頭', '本陣へお通しする。わしらが供をせよ', 4)],
      ], talks, stop);
    }, { canArrive: envoyMet });
    // 本陣の口で官兵衛が迎える。経家は、自分の命と引き換えに城の者を助けよと譲らない（『石見吉川家文書』の筋）
    function talks() {
      if (stop()) return;
      // 柵の外で迎えた場合も、開いた口を通ってから本陣へ向かう。
      man.order = 'path'; man.path = [[G.x, FZ + 2], [G.x + 2, FZ + 10], [camp.x, camp.z]]; man.pathIdx = 0; man.noAI = false;
      k15Go(rt, 'hg-kanbei', camp, 12, '使者を本陣へ通せ', '本陣', () => {
        k15Scenes(rt, [
          [0.5, () => rt.say('吉川の使者', '式部少輔様ら城将は腹を切る。残る城の者の命を、助けたまわれ', 5)],
          [5, () => rt.say('黒田官兵衛', '殿の返事じゃ。式部少輔殿は毛利から来た客将。腹を切るには及ばぬ、と', 5)],
          [5, () => rt.say('吉川の使者', '……式部少輔様は承知いたしますまい。城を預かった将が、腹を切らずに済むものかと', 5)],
          [5, () => { rt.banner('経家の申し入れ', '自分の命と引き換えに、城の者を助けよと'); rt.say('黒田官兵衛', '……義士じゃな。殿にそう申し上げる', 4); }],
          [4.5, () => { rt.award((t) => t.side.push('城の使者を本陣へ通した'), '城の使者を本陣へ通した'); evRemove(rt, man); evRemove(rt, kan); }],
        ], done, stop);
      }, { limit: 40, canArrive: () => {
        if (envoyNear(camp, 6)) return true;
        // 11/18 K358：使者が本陣の手前（7m ほど）で幕・俵に詰まり、着いた判定に入らず act bot が十五分止まった。
        // 11/18 クラウド持ち主（見回り k365-cloud-09：印「本陣」に着いても6秒なにも起きない）：
        //   本人が先に着いたら、官兵衛がすぐ使者を呼び、使者は歩みを速める。八秒経てば近く（20m 内）の使者を着いた事にする。
        if (rt.flags.ttKanbeiT == null) {
          rt.flags.ttKanbeiT = rt.t;
          rt.say('黒田官兵衛', '使者殿をこれへ。急がずともよい、通されよ', 3.5);
          man.noRun = false; man.speed = Math.max(man.speed || 0, 2.4);
        }
        // 11/18 クラウド持ち主（act bot：本陣に着いて6秒なにも起きない）：四秒で官兵衛が迎えに出て、二十五m 内の使者を着いた事にする。
        //   使者が遠くで詰まっても、十二秒で本陣の話へ進める（K175）。
        const w = rt.t - rt.flags.ttKanbeiT;
        if (w > 2.5 && !rt.flags.ttKanbeiSaid) { rt.flags.ttKanbeiSaid = true; rt.say('黒田官兵衛', '経家殿の使いか。よう参られた', 3); }
        // 11/18 クラウド持ち主 03:58（act bot 469秒：本陣の印に着いて6秒なにも起きない）：本人が本陣の脇を通った時に呼びの台詞が先に済み、
        //   着いてから十二秒の待ちに入っていた。遠い使者を待つのは八秒までに縮める
        // 11/18 クラウド持ち主 04:50（act bot 0437 の回：457秒に本陣の印で6秒なにも起きない＝r12m で呼びの台詞が先に出て、10m に入ってから八秒待った）：
        //   待ちを五秒までに縮め、本陣の話（0.5秒で使者の台詞）が着いて6秒内に必ず始まるようにする
        return envoyNear(camp, 25) && w > 2.5 || w > 5;
      } });
    }
  }
}
