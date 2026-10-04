// ======================================================================
// 試しの戦（隠しの筋書き system_mvp の四つ目）：53 章 籠城中の3Dイベントの MVP（docs/battle-system-plan.md 第4段・束17）
// rojo.js の R（window.__mvpRojo。無ければ MVP の数で新しく作る）と出来事の種類（window.__mvpEvent。
// 既定 '夜襲'。'門攻撃'・'援軍の挟撃'・'火事' も選べる）で中身を分ける。どれも 2〜4 分。
// 兵の名目・門の hp・士気は R から入り、終わりに損と出来事の勝ち負けを R.applyBattle へ返す。
// 確かめ：NORENDER=1 node prototype/tools/snap.mjs - prototype/tools/mvp/rojo3d.js（5 日目の夜襲）
// 向き：南（+z）に寄せ手（北向き）、北（-z）に城方の木戸
// ======================================================================
import { kabukimon, yagura, campfire, hut } from './props.js';
import { enemyGroup, allyGroup, wallLine, centerOf, gauss } from './bhelp.js';
import { applyLook, NIGHT, DAWN, dress } from './b_inabayama.js';
import { makeRojo } from './rojo.js';
import { nightAccuracyMult } from './siege_vis.js';
import { attachFireSpread } from './siege_fire.js';

const ODA = { flag: 'oda' };
const FOE = { flag: 'saito' };
const GATE = { x: 0, z: -30 };

const EVENT_TITLE = { 夜襲: '夜襲', 門攻撃: '門攻撃', 援軍の挟撃: '援軍の挟撃', 火事: '城内火災' };
const EVENT_OBJ = {
  夜襲: '敵の陣へ火をかけ、竹束と兵糧の小屋を焼け',
  門攻撃: '木戸を守りきれ',
  援軍の挟撃: '城から出て、寄せ手を外の援軍と挟め',
  火事: '火を消すか、門の守りを保つか',
};

function height(x, z) { return 0.3 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 6 * gauss(x, z, GATE.x, GATE.z - 4, 900); }

const b_mvp_rojo = {
  spawn: { x: 6, z: GATE.z + 18, heading: Math.PI },
  world: {
    seed: 7001, time: 'dusk',
    height,
    clear: (x, z) => Math.abs(x) < 120 && Math.abs(z) < 130,
    trees: 150, tufts: 2200,
    treeDensity: (x, z) => (Math.abs(x) < 120 && Math.abs(z) < 130 ? 0.15 : 1),
    fleeOut: (x, z, team) => (team === 1 ? z < -150 : z > 150),
  },
  sides: { a: { name: '寄せ手（織田方）', mon: 'oda' }, b: { name: '城方', mon: 'saito' } },
  taisho: { a: { name: '寄せ手の大将', def: true }, b: { name: '城方の大将', def: true } },
  date: () => '籠城の出来事（試し）',

  setup(rt) {
    const F = rt.flags;
    const W = rt.world;
    F.ending = false; F.ek = 0; F.ak = 0;
    rt.player.u.invuln = true;
    F.R = window.__mvpRojo || makeRojo({ castle: { men: 1000, food: 20, morale: 60 }, siege: { men: 3000, food: 30 } });
    F.kind = window.__mvpEvent || '夜襲';
    const st0 = F.R.stat();

    // ---- 木戸と柵（門の hp は R の城方の士気に応じて少し動く） ----
    rt.scene.add(kabukimon(W, GATE.x, GATE.z, 7, 0));
    const noT = (segs) => { for (const s of segs) { s.noTarget = true; s.wall = true; } return segs; };
    const gateHp = Math.round(200 * Math.max(0.4, st0.castle.morale / 100));
    F.gateWall = [
      ...noT(wallLine(rt, [[GATE.x - 40, GATE.z + 2], [GATE.x - 4, GATE.z]], { team: 1, hp: gateHp, name: '柵', segLen: 6 })),
      ...noT(wallLine(rt, [[GATE.x + 4, GATE.z], [GATE.x + 40, GATE.z + 2]], { team: 1, hp: gateHp, name: '柵', segLen: 6 })),
    ];
    for (const [x, z] of [[GATE.x - 20, GATE.z + 6], [GATE.x + 20, GATE.z + 6]]) rt.scene.add(yagura(W, x, z));

    // ---- 兵糧の小屋（竹束・破城の道具もここに積んである体。燃える＝火事・夜襲の的） ----
    rt.scene.add(hut(W, GATE.x - 14, GATE.z + 20, 7, 5, 0.1, { h: 3, wall: 0x6a5a44, roof: 0x3a3430 }));
    F.granary = rt.army.addStruct({ x: GATE.x - 14, z: GATE.z + 20, hp: 70, maxHp: 70, team: 1, name: '兵糧庫', moraleOnBurn: 'big' });
    F.granary.mesh = hut(W, F.granary.x, F.granary.z, 7, 5, 0.1, { h: 3, wall: 0x6a5a44, roof: 0x3a3430 });
    rt.scene.add(F.granary.mesh);
    rt.army.addStruct && (F.camp = rt.army.addStruct({ x: GATE.x, z: GATE.z - 70, hp: 60, maxHp: 60, team: 0, name: '竹束', moraleOnBurn: 'small' }));
    if (F.camp) { F.camp.mesh = campfire(W, F.camp.x, F.camp.z); rt.scene.add(F.camp.mesh); }
    F.fs = attachFireSpread(rt, { onGranary: () => { F.granaryBurnt = true; } });

    // ---- 両軍（名目の兵数は R から縮めて出す。実の兵は 250 の枠に収める） ----
    const defN = Math.max(10, Math.min(60, Math.round(st0.castle.men / 50)));
    const atkN = Math.max(14, Math.min(70, Math.round(st0.siege.men / 100)));
    F.def = allyGroup(rt, { faction: 'saito', team: 1, name: '城方の守り', anchor: { x: GATE.x, z: GATE.z + 10 }, facing: Math.PI, width: 16, aggro: 10, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '城方の大将', invuln: true } }, { type: 'samurai', n: Math.round(defN * 0.2) }, { type: 'ashigaru', n: Math.round(defN * 0.6) }, { type: 'gun', n: Math.round(defN * 0.2) }], FOE));
    F.def.team = 1; F.def.faction = 'saito';
    F.atk = enemyGroup(rt, { faction: 'oda', name: '寄せ手', anchor: { x: GATE.x, z: GATE.z - 50 }, facing: 0, aggro: 14, width: 20, morale: 85 },
      dress([{ type: 'busho', n: 1, o: { name: '寄せ手の大将' } }, { type: 'samurai', n: Math.round(atkN * 0.2) }, { type: 'ashigaru', n: Math.round(atkN * 0.6) }, { type: 'gun', n: Math.round(atkN * 0.2) }], ODA));

    applyLook(rt, F.kind === '門攻撃' ? DAWN : NIGHT);
    if (F.kind === '夜襲') {
      // 夜討ちは闇の中（siege_vis.js の nightAccuracyMult）：撃つ側も討つ側も当たりが鈍る
      const nmul = nightAccuracyMult(rt.world);
      for (const g of [F.def, F.atk]) for (const u of g.units) if (u.type === 'gun' || u.type === 'bow') u.dmg *= nmul;
    }
    rt.setPhase('event');
    rt.obj('main', EVENT_OBJ[F.kind] || '出来事に備えよ', 'main');
    rt.banner(EVENT_TITLE[F.kind] || '籠城の出来事', `${st0.day} 日目・${st0.stage}`);
    F.t0 = rt.t;
    F.maxT = 170;   // 2〜4 分（試しは短めに固定、__speed で縮めて回す）
    this.begin(rt);
  },

  begin(rt) {
    const F = rt.flags;
    if (F.kind === '夜襲') {
      // 守り（城方）が打って出て、寄せ手の陣（竹束）に火をかける
      F.def.order = 'move'; F.def.dest = F.camp ? { x: F.camp.x, z: F.camp.z } : { x: GATE.x, z: GATE.z - 60 };
      F.def.onArrive = (g) => { g.order = 'attack'; g.seekRange = 40; if (F.camp && F.camp.alive) rt.army.igniteStruct(F.camp, { x: F.camp.x, z: F.camp.z }); };
      F.atk.order = 'hold';
    } else if (F.kind === '門攻撃') {
      F.atk.order = 'attack'; F.atk.dest = { x: GATE.x, z: GATE.z }; F.atk.seekRange = 90;
      F.def.order = 'hold'; F.def.aggro = 16;
    } else if (F.kind === '援軍の挟撃') {
      F.relief = enemyGroup(rt, { faction: 'saito', name: '援軍', anchor: { x: GATE.x + 50, z: GATE.z - 90 }, facing: Math.PI / 2, order: 'attack', seekRange: 90, aggro: 14, width: 14, morale: 90 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }], FOE));
      F.def.order = 'move'; F.def.dest = { x: GATE.x, z: GATE.z - 50 }; F.def.onArrive = (g) => { g.order = 'attack'; g.seekRange = 60; };
      F.atk.order = 'hold'; F.atk.aggro = 16;
    } else if (F.kind === '火事') {
      rt.army.igniteStruct(F.granary, { x: F.granary.x, z: F.granary.z });
      rt.bark('兵糧庫が燃えている！', true);
      rt.addInteract('fire', { x: F.granary.x, z: F.granary.z }, '消火にあたる', () => this.fight(rt), { r: 3, hold: 2 });
      F.atk.order = 'attack'; F.atk.dest = { x: GATE.x, z: GATE.z }; F.atk.seekRange = 90;
      F.def.order = 'hold'; F.def.aggro = 16;
    }
  },

  // 火事：消火に回す（門を守る兵が減る）
  fight(rt) {
    const F = rt.flags;
    if (F.fought) return;
    F.fought = true;
    rt.uninteract('fire');
    F.granary.hp = Math.min(F.granary.maxHp, F.granary.hp + F.granary.maxHp * 0.6);
    F.granary.burn = 0;
    // 消火に回した分、門を守る兵が減る（守りの隊を少し弱める）
    F.def.defMult = (F.def.defMult || 1) * 0.75;
    for (const s of F.gateWall) s.hp = Math.max(1, s.hp - 20);
    rt.award((t) => t.side.push('火を消し止めた'), '消火にあたった');
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.fs) F.fs.tick(dt);
    if (F.ending) return;
    const t = rt.t - F.t0;
    const gateDown = F.gateWall.every((s) => !s.alive);
    if (F.kind === '門攻撃' && gateDown) { this.end(rt, { outcome: 'lose' }); return; }
    const atkGone = !F.atk || !F.atk.count;
    const defGone = !F.def || !F.def.count;
    if (F.kind === '夜襲' && (atkGone || (F.camp && !F.camp.alive))) { this.end(rt, { outcome: 'win' }); return; }
    if (F.kind === '援軍の挟撃' && atkGone) { this.end(rt, { outcome: 'win' }); return; }
    if (F.kind === '火事' && (gateDown || !F.granary.alive)) { this.end(rt, { outcome: !F.granary.alive ? 'lose' : 'win' }); return; }
    if (defGone && F.kind !== '門攻撃') { this.end(rt, { outcome: 'lose' }); return; }
    if (t > F.maxT) this.end(rt, { outcome: 'draw' });
  },

  end(rt, { outcome }) {
    if (outcome !== 'win' && !rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    const loss = F.ak || 0, enemyLoss = F.ek || 0;
    rt.banner('出来事、終わる', outcome === 'win' ? '我らの勝ち' : outcome === 'lose' ? '敵の勝ち' : '痛み分け');
    rt.award((t) => { t.main = true; }, '籠城の出来事・終わり');
    rt.player.u.invuln = true;
    const applied = F.R.applyBattle({ outcome, loss, enemyLoss, note: F.kind });
    window.__mvpRojoResult = applied;   // 確かめ（rojo3d.js）が読む
    rt.finish({}, 4);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 0) F.ak = (F.ak || 0) + 1; else F.ek = (F.ek || 0) + 1;
  },
};

export { b_mvp_rojo };
