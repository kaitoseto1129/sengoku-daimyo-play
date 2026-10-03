// 森部：雨中の渡河 → 先手 → 長い槍の押し合い → 両将の備を崩す → 集結。
import { gauss, centerOf, allyGroup, enemyGroup } from './bhelp.js';
import { distToPolyline } from './world.js';
import { RANKS } from './state.js';
import { nobori, hut } from './props.js';
import { nagashinojo } from './b_nagashinojo.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { gone, seasonOf } from './b_shared.js';
import { camp } from './b_mid.js';
import { demBlend } from './dem.js';
import { clash } from './b_sekigahara.js';
import { battleEvent, EVENT_COMMANDER_ADVANCE, EVENT_UNIT_BREAK, EVENT_COMMANDER_KILLED, EVENT_REINFORCEMENT, EVENT_RETREAT } from './battle_events.js';

// ======================================================================
// 第2戦　森部
// ======================================================================
const ROAD2 = [[-40, 176], [-28, 100], [-14, 40], [-6, -40], [4, -176]];
const POINT2 = { x: 40, z: 10 };
const FRONT2 = { x: -8, z: -18 };
const ASSEMBLY2 = { x: 24, z: 30 };
const LINE2 = -58;
// 国土地理院の標高（森部古戦場。束0 の asset_dem_moribe.js）を手書きの base（低い湿地）に混ぜる
let moribeDem = null;
import('./asset_dem_moribe.js').then((m) => { moribeDem = m.default; }).catch(() => {});
const moribeHeight = (x, z, b) => (moribeDem ? demBlend(moribeDem, x, z, b, { scale: 0.22, floor: b - 3, xyScale: 4 }) : b);

const moribe = {
  noWake: true,   // 控えは軽い軍勢のまま。戦う兵は増援込みでも約二百人。
  lordHata: { spear: 36 },   // 信長で遊ぶ時も槍の供にし、兵の枠を守る。
  noTaisho: true,   // 両将を討っても一瞬で終わらず、戦場を固める。
  spawn: { x: 46, z: 126, heading: Math.PI },
  world: {
    seed: 21,
    time: 'storm',
    muddy: 0.5,
    waterSlow: true,
    paths: [ROAD2],
    height(x, z) {
      const b = 1.4 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 0.9 * Math.sin(x * 0.07 + z * 0.05) + 1.2 * gauss(x, z, 130, 60, 3000) + 1 * gauss(x, z, -130, -90, 3200) + 2 * gauss(x, z, 58, -8, 300) + 0.9 * Math.exp(-((x - 96) ** 2) / 60) + 0.7 * Math.exp(-((x + 70) ** 2) / 50);   // 自然堤防（川筋の微高地）
      return moribeHeight(x, z, b);
    },
    tint(x, z, h, c) {
      // 田の畦
      if (Math.abs(x) < 120 && (Math.floor(x / 22) + Math.floor(z / 18)) % 3 === 0 && Math.abs(x - 50) > 18) c.setRGB(c.r * 0.9 + 0.03, c.g * 0.95 + 0.02, c.b * 0.8);
      if (z < LINE2 && z > LINE2 - 1.5 && Math.abs(x) < 110) c.setRGB(0.38, 0.33, 0.22);
    },
    clear: (x, z) => (Math.abs(x) < 42 && Math.abs(z) < 100) || Math.hypot(x - 45, z - 70) < 12 || Math.hypot(x + 126, z + 30) < 34,
    // 五月の田：水を張り、苗を植えたばかり（畦を残す）
    paddy(x, z) {
      if (Math.abs(x) > 120 || Math.abs(x - 50) < 18) return 0;
      if ((Math.floor(x / 22) + Math.floor(z / 18)) % 3 !== 0) return 0;
      const ex = Math.min(((x % 22) + 22) % 22, 22 - ((x % 22) + 22) % 22), ez = Math.min(((z % 18) + 18) % 18, 18 - ((z % 18) + 18) % 18);
      if (distToPolyline(x, z, ROAD2) < 5) return 0;
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.9) / 0.6));
    },
    // 長良川は東。楡俣川の位置と浅瀬の幅は遊びのための復元（川の特定には諸説）。
    streams: [{ pts: [[104, -176], [100, -90], [98, -20], [104, 60], [110, 176]], w: 12, depth: 1.4 },
      { pts: [[-176, 90], [-70, 88], [46, 88], [100, 94]], w: 3.8, depth: 0.55 },
      { pts: [[-70, -176], [-66, -40], [-74, 60], [-70, 176]], w: 1.2, depth: 0.7 }],
    mist: true,
    trees: 140,
    treeDensity: (x, z) => (Math.abs(x) > 90 ? 1 : 0.35),
    groves: [{ x: 60, z: -8, r: 12, n: 18 }, { x: 70, z: 20, r: 10, n: 8 }],
  },
  setup(rt) {
    const W = rt.world;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    rt.flags.hist = { rain: 'HIST_A', crossing: 'HIST_A', spearBattle: 'HIST_A', commanders: 'HIST_A', nagara: 'HIST_B', paddy: 'HIST_B', formation: 'GAME_C', reserveWaves: 'GAME_C', ford: 'GAME_C' };
    // 開戦の引きの後、斎藤勢の横陣を正面の低い所から 3 秒見せる（向こうに構える大軍の圧）
    rt.after(4.6, () => {
      const M = rt.flags.M;
      if (!M) return;
      const c = M.center();
      rt.player.showShot({ x: c.x - 6, z: c.z + 22 }, centerOf(M), 3, { h: 0.8, lookH: 2.2, ang: 0, drift: 1.2 });
    });
    // 倒れる寸前に仲間が割って入る手当ては、最初の桶狭間だけ（森部からは構えと回避で凌ぐ）。
    //   組頭見習いの戦なので、同時に本人へ打ちかかる敵は二人まで
    rt.firstFights = false;
    if (!rt.G.lord && (rt.G.rank || 0) <= 1) { rt.army.maxAttackers = Math.min(rt.army.maxAttackers || 3, 2); rt.army.mobCapMax = 2; }   // 囲まれても同時に打ちかかるのは二人まで（背の側の一人は別）
    const n = Math.min(24, RANKS[rt.G.rank].squad || 5);
    rt.makeSquad({ x: 46, z: 130 }, Math.PI, [{ kind: 'spear', n }]);
    rt.flags.A = allyGroup(rt, { name: '柴田の前備', anchor: { x: 8, z: 12 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true, dmgMult: 0.55 }, [{ type: 'samurai', n: 1, o: { name: '柴田勝家', invuln: true } }, { type: 'ashigaru', n: 16 }]);
    rt.flags.B = allyGroup(rt, { name: '本備', anchor: { x: -22, z: 34 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 24 }, { type: 'gun', n: 2 }]);
    // 小勢が横に広がりすぎず、槍の前線へ合流する（細かな隊の位置は復元）。
    rt.flags.R3 = allyGroup(rt, { name: '右手の備', anchor: { x: 62, z: 40 }, facing: Math.PI, aggro: 10, morale: 100, noRout: true }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }]);
    rt.flags.Y = allyGroup(rt, { name: '森の横備え', anchor: { x: -52, z: 22 }, facing: Math.PI, aggro: 10, morale: 100, noRout: true }, [{ type: 'samurai', n: 1, o: { name: '森可成', invuln: true } }, { type: 'ashigaru', n: 14 }]);
    rt.flags.V = enemyGroup(rt, { faction: 'saito', name: '斎藤の先手', fixed: true, anchor: { x: 16, z: -62 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, speed: 2.1, aggro: 5, noRout: true }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }]);
    rt.flags.M = enemyGroup(rt, { faction: 'saito', name: '日比野の備', fixed: true, anchor: { x: -14, z: -76 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 8, width: 8, noRout: true },
      [{ type: 'busho', n: 1, o: { name: '日比野下野守' } }, { type: 'samurai', n: 1, o: { name: '足立六兵衛' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 18 }, { type: 'bow', n: 3 }]);
    // 長井甲斐守の備え：日比野の西に並ぶ
    rt.flags.N = enemyGroup(rt, { faction: 'saito', name: '長井の備', fixed: true, anchor: { x: -54, z: -78 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, aggro: 8, width: 7, morale: 90, noRout: true },
      [{ type: 'busho', n: 1, o: { name: '長井甲斐守' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 2 }]);
    for (const [x, z] of [[30, 64], [-30, 44], [0, 24]]) rt.scene.add(nobori(W, x, z, 'oda', 5));
    for (const [x, z] of [[-20, -92], [0, -96], [-34, -90], [-60, -100], [-46, -100]]) rt.scene.add(nobori(W, x, z, 'saito', 5.5));
    rt.scene.add(hut(W, -60, 60, 6, 4, 0.3, { roof: 0x6a5c44 }));
    rt.scene.add(hut(W, -70, 70, 5, 4, -0.2, { roof: 0x6a5c44 }));

    W.setTime('storm'); W.setRainTarget(0.65);
    rt.setPhase('brief');
    rt.obj('point', '浅瀬を渡り、組を連れて東の畦へ', 'main');
    rt.obj('wait', '法螺貝が鳴るまで備えをそろえよ', 'order');
    rt.marker('point', POINT2, '渡った先の畦');
    rt.zone('point', POINT2.x, POINT2.z, 10);
    rt.say('足軽大将', '墨俣から長井と日比野の軍が出た。雨でも川を越え、向かい合うぞ', 5);
    rt.say('足軽大将', '組を連れて浅瀬を渡れ。東の畦で槍をそろえ、法螺貝を待て', 5);
    rt.say('足軽大将', '鉄砲の者、火薬と火縄を濡らすな。川を渡る前に包みを確かめよ', 4.5);
    rt.after(24, () => rt.bark('「ついて来い」で組を連れ、「待て」で畦に並べる'));
    rt.flags.point = POINT2;
    rt.flags.friends = [rt.flags.A, rt.flags.B, rt.flags.Y, rt.flags.R3];
    rt.flags.reserves = [];
    rt.flags.opposition = [rt.flags.V, rt.flags.M, rt.flags.N];
    rt.flags.taskTick = 0;
    rt.tutStart('組への号令', [['cmd_follow', 'ついて来い'], ['cmd_hold', '待て'], ['cmd_retreat', '退け'], ['radial', '号令の輪']]);
    // 配置資料の南北の並びを約五分の一に縮める。東に長良川、南に織田、北に墨俣側の斎藤。
    const F = rt.flags;
    const KT = nagashinojo.kit;
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    const KS = ['spear', 'bow', 'spear', 'spear', 'cavalry', 'spear', 'bow', 'honjin', 'spear'];
    // 墨俣側の控え。龍興本人の出陣を確かな事として描かない。
    F.farS = [[-112, -116], [-70, -128], [-24, -134], [22, -130], [68, -120], [-90, -98], [50, -104], null, [-50, -148]]
      .map((q, i) => q && DA(q[0], q[1], 26, KS[i] === 'bow' ? 6 : (KS[i] === 'honjin' ? 22 : 12), KS[i] === 'cavalry' ? 100 : 150, 0, i % 2 ? 0x3a3a30 : 0x35382c, 'saito', 5 + i, KS[i])).filter(Boolean);
    const KO = ['spear', 'bow', 'cavalry', 'spear', 'mixed'];
    F.farO = [[-96, 120], [-50, 130], [0, 130], [-20, 104], [-110, 88]]
      .map(([x, z], i) => DA(x, z, 22, KO[i] === 'bow' ? 6 : 12, KO[i] === 'cavalry' ? 90 : 120, Math.PI, KT.ARMOR.oda, i === 2 ? 'eiraku' : 'oda', 20 + i, KO[i]));
    // 信長の本陣：陣幕の内に床几の大将と諸将、後ろに馬印と旗本
    F.odaCamp = camp(rt, { x: 0, z: 150, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長', haori: 0x7a1d14 }, guard: 15, reserve: 260, runTo: { x: -20, z: 60 } });
    rt.scene.add(nobori(W, -12, 156, 'eiraku', 6));
    // 遠景の村（西の在所）
    KT.farVillage(rt, -126, -30, { rot: -Math.PI / 2, n: 6, fields: 8, seed: 4 });
    // 両翼の槍の前線。音・旗・煙の仕組みは共通の呼び口を使う。
    F.fronts = [-92, 68].map((x, i) => clash(rt, { x, z: -16, facing: Math.PI, w: 26, gap0: 24, seed: 231 + i,
      noWake: true, noRout: true, killRate: 0, nearHide: 50,
      A: { flag: 'oda', armor: KT.ARMOR.oda, count: 260, kind: 'spear', team: 0, faction: 'oda' },
      B: { flag: 'saito', armor: KT.ARMOR.saito, count: 650, kind: 'spear', team: 1, faction: 'saito' } }));
    // 名のある備の後ろに、同じ旗の控え（斎藤の日比野・長井の備と、織田の本備）
    // 控えは戦う場所（北の畦 z -70 から織田の陣 z 28 の間）へは入らず、その手前で止まって待つ（戦う兵が軽い兵の中に埋もれないように）
    const beyond = (g, z, north) => () => { const c = g.center(); return north ? c.z > z : c.z < z; };
    KT.backOf(rt, F.M, { flag: 'saito', armor: 0x35382c, kind: 'spear', w: 16, depth: 10, count: 110, seed: 33, stop: beyond(F.M, -72, true) });
    KT.backOf(rt, F.N, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 14, depth: 8, count: 80, seed: 34, stop: beyond(F.N, -76, true) });
    KT.backOf(rt, F.B, { flag: 'oda', armor: KT.ARMOR.oda, kind: 'spear', w: 18, depth: 10, count: 110, seed: 35, stop: beyond(F.B, 30, false) });
    KT.backOf(rt, F.V, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 14, depth: 8, count: 70, seed: 36, stop: beyond(F.V, -86, true) });
    rt.after(18, () => {
      const V = rt.flags.V;
      V.speed = 2.6;   // 雨の畦を先手が寄せてくる。
      V.order = 'move'; V.dest = { x: 14, z: -4 };
      V.onArrive = (g) => { rt.flags.vArrived = rt.t; g.order = 'attack'; g.seekRange = 18; g.anchor = { x: 14, z: -4 }; };
      rt.say('足軽', '敵の先手が出てきたぞ！', 3);
    });
  },

  update(rt, dt) {
    const F = rt.flags, p = rt.player.u.pos;
    nagashinojo.kit.backTick(rt);
    if (F.ending) return;
    // 任務と隊の見直しは一秒ごと。毎コマ配列や行き先を作らない。
    F.taskTick -= dt;
    if (F.taskTick > 0) return;
    const elapsed = F.lastTask === undefined ? 1 : rt.t - F.lastTask;
    F.lastTask = rt.t; F.taskTick = 1;
    if (!F.signal) {
      let alive = 0, near = 0;
      for (const u of rt.squad) if (u.alive) { alive++; if (Math.hypot(u.pos.x - POINT2.x, u.pos.z - POINT2.z) < 16) near++; }
      const d = Math.hypot(p.x - POINT2.x, p.z - POINT2.z);
      if (d < 10 && near >= Math.ceil(alive * 0.6)) F.holdT = (F.holdT || 0) + elapsed;
      if (!F.pointDone) rt.objProgress('point', d < 10 ? `組をそろえる ${Math.min(8, Math.floor(F.holdT || 0))}/8秒` : `畦まで あと${Math.round(d)}歩ほど`);
      if (!F.pointDone && F.holdT >= 8) {
        F.pointDone = true; rt.objDone('point'); rt.objRemove('point'); rt.unmark('point'); rt.unzone('point');
        rt.award((t) => { t.c.point = 1; }, '渡河して組をそろえた');
        rt.say('足軽大将', 'よし、槍をそろえたな。敵の先手を引きつけるぞ', 4);
      }
      if (!F.fordNudge && rt.t > 40 && !F.pointDone) { F.fordNudge = true; rt.say('足軽大将', '川の浅い所をまっすぐ渡れ。印の畦で組を待つのじゃ', 4); }
      rt.objProgress('wait', rt.t < 55 ? `合図まで あと${Math.ceil(55 - rt.t)}秒ほど` : '組をそろえ次第、合図が鳴る');
      if ((rt.t >= 55 && F.pointDone) || rt.t >= 85) this.signal(rt);
      return;
    }
    if (F.stage === 'contact') {
      rt.objProgress('break', `先手を押す・あと${Math.max(0, Math.ceil(55 - (rt.t - F.signal)))}秒で本備が進む`);
      if (!F.vBroken && gone(F.V)) this.onRout(rt, F.V);
      if (rt.t - F.signal >= 55) {
        if (!F.vBroken) { if (gone(F.V)) this.onRout(rt, F.V); else rt.objFail('break'); }
        rt.objRemove('break'); rt.unmark('V');
        F.stage = 'hold'; F.holdStart = rt.t; F.lineT = 0;
        rt.setPhase('hold'); rt.banner('槍を打ち合わせる', '雨の中、両軍が押し合う');
        rt.obj('line', '本備の横で、組と槍をそろえて押し返せ', 'main');
        rt.marker('line', FRONT2, '本備の横'); rt.zone('line', FRONT2.x, FRONT2.z, 24);
        rt.say('足軽大将', '長井と日比野が寄せてきた。組を離すな。本備の横で押し返せ！', 5);
        for (const g of [F.M, F.N]) if (!gone(g)) { g.noRout = false; g.order = 'attack'; g.seekRange = 50; }
      }
    } else if (F.stage === 'hold') {
      const el = rt.t - F.holdStart;
      if (Math.hypot(p.x - FRONT2.x, p.z - FRONT2.z) < 38) F.lineT += elapsed;
      rt.objProgress('line', `押し合い・あと${Math.max(0, Math.ceil(100 - el))}秒`);
      if (!F.wave1 && el >= 18) { F.wave1 = true; this.reserve(rt, -44, -96, '長井の控え'); }
      if (!F.gunSmoke && el >= 45) {
        F.gunSmoke = true;
        const q = F.B.center();
        if (F.B.units.some((u) => u.alive && u.type === 'gun')) {
          rt.army.smoke(q.x - 5, rt.world.heightAt(q.x - 5, q.z) + 1.4, q.z, 0, -1);
          rt.army.play('volley', q, 0.5);
        }
      }
      if (!F.wave2 && el >= 60) { F.wave2 = true; this.reserve(rt, 12, -106, '日比野の控え'); }
      if (el >= 100) {
        if (F.lineT >= 40) { rt.objDone('line'); rt.award((t) => t.side.push('槍の押し合いを支えた'), '槍の押し合いを支えた'); }
        else rt.objFail('line');
        rt.objRemove('line'); rt.unmark('line'); rt.unzone('line');
        F.stage = 'press'; F.pressStart = rt.t; rt.setPhase('press');
        rt.banner('敵の備を崩せ', '長井と日比野の旗へ');
        rt.obj('commanders', '味方と進み、長井と日比野の備を崩せ', 'main');
        rt.say('足軽大将', '槍の押し合いで敵の列が乱れた。味方と並び、残る備を崩せ！', 5);
        for (const g of F.friends) if (!gone(g)) { g.calm = false; g.order = 'attack'; g.seekRange = 70; g.anchor = { x: -22, z: -40 }; }
        F.fronts.forEach((c) => { c.push('A', 0.5); c.shake('B', 0.25); });
      }
    } else if (F.stage === 'press') {
      // 総大将の討死・側面攻撃・逃亡の連鎖は共通の士気の仕組みに任せる。
      let left = 0, target = null;
      for (const g of F.opposition) if (!gone(g)) { left++; if (!target) target = g; }
      rt.objProgress('commanders', `残る備 ${left}隊`);
      if (target !== F.marked) {
        F.marked = target;
        if (target) rt.marker('commanders', centerOf(target), () => `${target.name}・${moraleWord(target.morale)}`, { red: true, group: target });
        else rt.unmark('commanders');
      }
      // 二人以下の残兵を追い回させない。長引いた備も実際に半数を失った時だけ揺らぐ。
      for (const g of F.opposition) if (!gone(g) && (g.count <= 2 || rt.t - F.pressStart > 75 && g.count < g.initial * 0.5)) g.morale = Math.min(g.morale, 18);
      if (!left && rt.t - F.pressStart >= 35) {
        F.sBack = true; F.stage = 'assemble'; F.assembleStart = rt.t; F.assembleT = 0;
        rt.objDone('commanders'); rt.objRemove('commanders'); rt.unmark('commanders');
        rt.banner('斎藤勢、崩れる', '旗が倒れ、北へ退いていく');
        battleEvent(rt, EVENT_RETREAT, FRONT2, null, 1, true, '斎藤勢が墨俣の方へ退き始めた');
        F.farS.forEach((m, i) => rt.after(i * 1.2, () => m.rout({ hideAfter: 45 })));
        F.fronts.forEach((c) => c.rout('B', { hideAfter: 40 }));
        rt.obj('assemble', '深追いせず、組を集結の旗へ戻せ', 'main');
        rt.marker('assemble', ASSEMBLY2, '集結の旗'); rt.zone('assemble', ASSEMBLY2.x, ASSEMBLY2.z, 12);
        rt.say('足軽大将', '敵の備は崩れた！　追い散らすな。組を集め、川への道を固めよ', 5);
        for (const g of F.friends) if (!gone(g)) { g.order = 'move'; g.dest = { x: ASSEMBLY2.x - 8, z: ASSEMBLY2.z }; }
      }
    } else if (F.stage === 'assemble') {
      let alive = 0, near = 0;
      for (const u of rt.squad) if (u.alive) { alive++; if (Math.hypot(u.pos.x - ASSEMBLY2.x, u.pos.z - ASSEMBLY2.z) < 18) near++; }
      if (Math.hypot(p.x - ASSEMBLY2.x, p.z - ASSEMBLY2.z) < 12 && near >= Math.ceil(alive * 0.6)) F.assembleT += elapsed;
      rt.objProgress('assemble', `組を集める ${Math.min(8, Math.floor(F.assembleT))}/8秒`);
      if (rt.t >= 240 && rt.t - F.assembleStart >= 30 && (F.assembleT >= 8 || rt.t - F.assembleStart >= 60)) this.endBattle(rt, true);
    }
    if (!F.ending && rt.t >= 420) this.endBattle(rt, F.stage === 'assemble');
  },

  signal(rt) {
    const F = rt.flags;
    F.signal = rt.t; F.stage = 'contact'; rt.setPhase('contact');
    if (!F.pointDone) rt.objFail('point');
    rt.objRemove('point'); rt.unmark('point'); rt.unzone('point'); rt.objRemove('wait'); rt.tutEnd();
    sfx('horagai', 1); rt.banner('川を越え、敵へ向かう', '槍の列に続け');
    rt.obj('break', '味方の前備と共に、斎藤の先手を押せ', 'main');
    rt.marker('V', centerOf(F.V), '斎藤の先手', { red: true, group: F.V });
    rt.say('足軽大将', '合図じゃ！　前備に続け。槍の列を切らすな！', 4);
    for (const g of F.friends) { g.order = 'attack'; g.seekRange = 40; }
    F.V.noRout = false;
    for (const g of [F.M, F.N]) {
      g.order = 'move'; g.dest = { x: g === F.M ? -12 : -44, z: -20 }; g.speed = 1.8;
      g.onArrive = (u) => { u.order = 'attack'; u.seekRange = 40; };
    }
    F.fronts.forEach((c) => c.go());
    F.farO.forEach((m, i) => rt.after(i * 1.3, () => m.advance(24, 18)));
    battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.A.anchor, F.A, 0, true, '織田の槍の列が前へ出た');
  },

  reserve(rt, x, z, name) {
    let count = 0;
    for (const u of rt.army.units) if (u.alive && u.type !== 'dummy') count++;
    // ほかの共通仕掛けが兵を加えた場合にも、二百五十人の枠を守る。
    if (count > 232) { rt.say('足軽', '敵の控えも前へ出てくるぞ！', 3); return; }
    const g = enemyGroup(rt, { faction: 'saito', name, fixed: true, anchor: { x, z }, facing: 0, order: 'attack', seekRange: 65,
      morale: 85, width: 10, fleeDir: { x: 0, z: -1 }, dmgMult: 0.6 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }]);
    g.anchor = { x: FRONT2.x, z: FRONT2.z - 8 }; rt.flags.reserves.push(g); rt.flags.opposition.push(g);
    nagashinojo.kit.backOf(rt, g, { flag: 'saito', armor: 0x33302a, kind: 'spear', w: 18, depth: 10, count: 180, seed: 430 + rt.flags.reserves.length });
    battleEvent(rt, EVENT_REINFORCEMENT, g.anchor, g, 1, false, `${name}が槍の列へ加わる`);
    rt.say('足軽大将', '敵の控えが来た！　組をそろえ、前の味方と押し返せ！', 4);
  },

  endBattle(rt, won) {
    const F = rt.flags;
    F.ending = true; rt.tracker.main = won;
    if (F.stage === 'assemble') {
      if (F.assembleT >= 8) { rt.objDone('assemble'); rt.award((t) => t.side.push('勝った後も組をまとめた'), '勝った後も組をまとめた'); }
      else rt.objFail('assemble');
    } else { rt.objFail(F.stage === 'hold' ? 'line' : F.stage === 'contact' ? 'break' : 'commanders'); }
    rt.unmark('assemble'); rt.unzone('assemble'); rt.unmark('commanders'); rt.unmark('line'); rt.unzone('line'); rt.unmark('V');
    rt.banner(won ? '森部の勝ち戦' : '攻めを止め、備えを立て直す');
    rt.say('足軽大将', won ? 'よく押し切った。組を離さず、戦場を固めよ' : 'まだ敵の備が残る。いったん組を下げ、槍をそろえ直せ', 4);
    sfx('horagai', 0.7); rt.finish({}, 8);
  },

  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.V && !F.vBroken) {
      F.vBroken = true; rt.unmark('V'); rt.objDone('break');
      rt.award((t) => t.side.push('斎藤の先手を押し返した'), '斎藤の先手を押し返した');
      rt.say('足軽大将', '先手は退いた。まだ長井と日比野の備があるぞ！', 4);
    }
    if (g === F.M || g === F.N) battleEvent(rt, EVENT_UNIT_BREAK, g.anchor, g, 1, true, `${g.name}が崩れた`);
  },

  onKill(rt, v) {
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1; else rt.flags.ak = (rt.flags.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (v.type === 'busho' && (v.group === rt.flags.M || v.group === rt.flags.N)) {
      battleEvent(rt, EVENT_COMMANDER_KILLED, v.pos, v.group, 1, true, `${v.name}、討ち取られたり`);
      rt.say('伝令', `${v.name}が討たれた！　敵の槍の列が乱れております！`, 4);
    }
  },
  onPlayerHit(rt, t) {
    if (!rt.flags.signal && !rt.flags.early && t.team === 1 && t.target !== rt.player.u) {
      rt.flags.early = true; rt.violation('合図の前に仕掛けた', ['足軽大将', '槍をそろえるまで待て！']);
    }
  },
  onSquadCommand(rt, id) {
    if (!rt.flags.signal && !rt.flags.early && (id === 'attack' || id === 'focus')) {
      rt.flags.early = true; rt.violation('合図の前に突撃を命じた', ['足軽大将', 'まだじゃ！　組をそろえよ！']);
    }
  },
};

// 遊び手の代わりに動かす時も、同じ段と札に従う。
moribe.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE'); inp.guardHold = false;
  if (!u.alive || F.ending) return;
  const sq = b.squadGroups[0];
  const gathering = !F.signal || F.stage === 'assemble';
  if (sq && gathering && sq.order !== 'follow' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 3; }
  if (gathering) { const q = F.stage === 'assemble' ? ASSEMBLY2 : POINT2; goTo(p, inp, q.x, q.z, 5); return; }
  if (u.hp < u.maxHp * 0.4) F.botBack = true;
  if (F.botBack && u.hp > u.maxHp * 0.75) F.botBack = false;
  if (F.botBack) { goTo(p, inp, FRONT2.x + 12, FRONT2.z + 20, 4); inp.guardHold = !!b.army.nearestEnemy(u, 4); return; }
  const e = b.army.nearestEnemy(u, 14, (o) => !o.noTarget && !o.fleeing);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6;
    if (sq && sq.order !== 'attack' && !(b.botCmdT > b.t)) { inp.e.add('KeyC'); b.botCmdT = b.t + 3; }
    return;
  }
  let q = FRONT2;
  if (F.stage === 'contact' && !gone(F.V)) q = F.V.center();
  if (F.stage === 'press') { const g = F.opposition.find((g) => !gone(g)); if (g) q = g.center(); }
  goTo(p, inp, q.x, q.z, 4);
};
moribe.canSkip = () => '';   // 雨中の布陣から槍の会戦まで、同じ時計で進める。
moribe.rts = true;
moribe.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '斎藤軍', mon: 'saito' } };
moribe.famous = [
  { name: '前田利家', team: 0, g: /森の横備え|柴田の前備/, loose: 1, line: '槍の列に続け！' },
];
moribe.date = () => `永禄四年五月十四日　${seasonOf('五月')}・雨`;
// 千五百対六千は伝承上の目安。公記の森部の記事自体には総兵数の記載がない。
moribe.force = (rt) => ({ a: Math.max(0, 1500 - (rt.flags.ak || 0) * 6), a0: 1500,
  b: Math.max(0, 6000 - (rt.flags.ek || 0) * 20 - (rt.flags.sBack ? 800 : 0)), b0: 6000 });
moribe.history = '信長公記の森部の記事は、五月十四日の雨、墨俣から長井甲斐守・日比野下野守が出たこと、信長が楡俣川を越え、長く槍を合わせたことを記す。両将を含む百七十余人が討たれた。前田利家が足立六兵衛を討ったとも記す。永禄四年とするのが通説だが、この記事そのものには年の記載がない。織田約千五百、斎藤約六千は伝承上の目安。川の位置や細かな布陣には諸説があり、浅瀬・畦の持ち場・控えの押し出す順は遊びのための復元である。';
export { moribe };
