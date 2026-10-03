// 森部の戦の定義（battles.js から分けた。中身は元のまま）
import { gauss, centerOf, allyGroup, enemyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { RANKS } from './state.js';
import { nobori, hut } from './props.js';
import { isTouch } from './touch.js';
import { K } from './settings.js';
import { nagashinojo } from './b_nagashinojo.js';
import { sfx } from './audio.js';
import { moraleWord } from './hud.js';
import { volleyAt } from './b_okehazama.js';
import * as DP from './b_depth.js';
import { depthTick, depthOn, depthStart, depthBot } from './b_depth.js';
import { gone, seasonOf, sky, uS, uG, uA, uC, uBu } from './b_shared.js';
import { camp } from './b_mid.js';
import { demBlend } from './dem.js';

// ======================================================================
// 第2戦　森部
// ======================================================================
const ROAD2 = [[-40, 176], [-28, 100], [-14, 40], [-6, -40], [4, -176]];
const POINT2 = { x: 50, z: -6 };
const LINE2 = -58;
// 国土地理院の標高（森部古戦場。束0 の asset_dem_moribe.js）を手書きの base（低い湿地）に混ぜる
let moribeDem = null;
import('./asset_dem_moribe.js').then((m) => { moribeDem = m.default; }).catch(() => {});
const moribeHeight = (x, z, b) => (moribeDem ? demBlend(moribeDem, x, z, b, { scale: 0.22, floor: b - 3, xyScale: 4 }) : b);

const moribe = {
  spawn: { x: 46, z: 74, heading: Math.PI },
  world: {
    seed: 21,
    muddy: 0.3,
    waterSlow: true,
    paths: [ROAD2],
    height(x, z) {
      const b = 1.4 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 0.9 * Math.sin(x * 0.07 + z * 0.05) + 10 * gauss(x, z, 130, 60, 3000) + 8 * gauss(x, z, -130, -90, 3200) + 2 * gauss(x, z, 58, -8, 300) + 0.9 * Math.exp(-((x - 96) ** 2) / 60) + 0.7 * Math.exp(-((x + 70) ** 2) / 50);   // 自然堤防（川筋の微高地）
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
    // 東の林の脇を流れる小川
    // 東の小川・細い水路・東の端の長良川（織田はこれを越えて出てきた）
    streams: [{ pts: [[96, -176], [88, -90], [80, -20], [92, 60], [104, 176]], w: 2.2, depth: 1.3 }, { pts: [[-70, -176], [-66, -40], [-74, 60], [-70, 176]], w: 1.2, depth: 0.7 }, { pts: [[168, -176], [160, -60], [166, 40], [172, 176]], w: 14, depth: 1.4 }],
    mist: true,
    trees: 320,
    treeDensity: (x, z) => (Math.abs(x) > 90 ? 1 : 0.35),
    groves: [{ x: 60, z: -8, r: 12, n: 34 }, { x: 70, z: 20, r: 10, n: 14 }],
  },
  setup(rt) {
    const W = rt.world;
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    rt.flags.hist = { honjinOda: 'HIST_B', honjinSaito: 'HIST_B', riverLowland: 'HIST_A', paddy: 'HIST_B', yakushido: 'HIST_B', farHosts: 'GAME_C', nagara: 'HIST_B', honGo: 'HIST_B', shimojuku: 'HIST_B', threeHands: 'GAME_C', naturalLevee: 'HIST_B' };
    // 開戦の引きの後、斎藤勢の横陣を正面の低い所から 3 秒見せる（向こうに構える大軍の圧）
    rt.after(4.6, () => {
      const M = rt.flags.M;
      if (!M) return;
      const c = centerOf(M);
      rt.player.showShot({ x: c.x - 6, z: c.z + 22 }, () => centerOf(M), 3, { h: 0.8, lookH: 2.2, ang: 0, drift: 1.2 });
    });
    // 倒れる寸前に仲間が割って入る手当ては、最初の桶狭間だけ（森部からは構えと回避で凌ぐ）。
    //   組頭見習いの戦なので、同時に本人へ打ちかかる敵は二人まで
    rt.firstFights = false;
    if (!rt.G.lord && (rt.G.rank || 0) <= 1) { rt.army.maxAttackers = Math.min(rt.army.maxAttackers || 3, 2); rt.army.mobCapMax = 2; }   // 囲まれても同時に打ちかかるのは二人まで（背の側の一人は別）
    const n = RANKS[rt.G.rank].squad || 5;
    rt.makeSquad({ x: 46, z: 77 }, Math.PI, [{ kind: 'spear', n }]);
    const oz = allyGroup(rt, { name: '大沢組', anchor: { x: 38, z: 70 }, facing: Math.PI, noRout: true }, [{ type: 'samurai', n: 1, o: { name: '足軽大将 大沢勘兵衛', invuln: true, horse: true } }, { type: 'ashigaru', n: 3, o: { invuln: true } }]);
    rt.flags.osawa = oz.units[0];
    rt.flags.A = allyGroup(rt, { name: '前備', anchor: { x: 8, z: 12 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true, dmgMult: 0.55 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 16 }]);
    rt.flags.B = allyGroup(rt, { name: '本備', anchor: { x: -22, z: 34 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 26 }]);
    // 味方の鉄砲（永禄の頃はまだ少ない）：日比野の備が寄せた所で一斉に放つ
    rt.flags.G = allyGroup(rt, { name: '織田の鉄砲', anchor: { x: -6, z: 4 }, facing: Math.PI, order: 'hold', aggro: 4, width: 6, morale: 100, noRout: true }, [{ type: 'samurai', n: 1 }, { type: 'gun', n: 5 }]);
    // 西の横備え：合図で長井の備えに当たる
    // 右手の備：合図で、敵の東の側面（先手の反対の側）へ回る（中央が拘束・左が横腹・右が反対の側面の三手）
    rt.flags.R3 = allyGroup(rt, { name: '右手の備', anchor: { x: 62, z: 40 }, facing: Math.PI, aggro: 10, morale: 100, noRout: true }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }]);
    rt.flags.Y = allyGroup(rt, { name: '横備え', anchor: { x: -52, z: 22 }, facing: Math.PI, aggro: 10, morale: 100, noRout: true }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 14 }]);
    rt.flags.V = enemyGroup(rt, { faction: 'saito', anchor: { x: 16, z: -104 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, speed: 2.1, aggro: 5, noRout: true }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 16 }]);
    rt.flags.M = enemyGroup(rt, { faction: 'saito', anchor: { x: -14, z: -82 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 8, width: 8, noRout: true },
      [{ type: 'busho', n: 1, o: { name: '日比野下野守' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 18 }, { type: 'bow', n: 3 }, { type: 'gun', n: 2 }]);
    // 長井甲斐守の備え：日比野の西に並ぶ
    rt.flags.N = enemyGroup(rt, { faction: 'saito', anchor: { x: -54, z: -92 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, aggro: 8, width: 7, morale: 90 },
      [{ type: 'busho', n: 1, o: { name: '長井甲斐守' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 14 }, { type: 'bow', n: 2 }]);
    for (const [x, z] of [[30, 64], [-30, 44], [0, 24]]) rt.scene.add(nobori(W, x, z, 'oda', 5));
    for (const [x, z] of [[-20, -92], [0, -96], [-34, -90], [-60, -100], [-46, -100]]) rt.scene.add(nobori(W, x, z, 'saito', 5.5));
    rt.scene.add(hut(W, -60, 60, 6, 4, 0.3, { roof: 0x6a5c44 }));
    rt.scene.add(hut(W, -70, 70, 5, 4, -0.2, { roof: 0x6a5c44 }));

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('point', '組を連れて林の端を押さえよ', 'main');
    rt.obj('wait', '法螺貝の合図まで仕掛けるな', 'side');   // 守る決まりは副に（「今すること」の一行は、林の端へ行く方を出す）
    rt.marker('point', POINT2, '持ち場（林の端）');
    rt.zone('point', POINT2.x, POINT2.z, 10);
    rt.say('大沢勘兵衛', `${nm(rt)}、源八から五人を預かったそうじゃな。今日は組頭の見習いとして、わしの手で働け`, 4.5);
    rt.say('大沢勘兵衛', 'あの林の端を押さえよ。敵の先手が来ても、法螺貝が鳴るまで動くでない', 5);
    rt.say('大沢勘兵衛', '合図があれば、横合いから先手を突き崩せ。よいな', 4);
    // 号令の手ほどきは下の札に。字幕は戦の中の声だけにする（鼓舞と地図は、台詞の後に短い知らせで）
    rt.after(26, () => rt.bark(isTouch ? '「鼓舞」で組の士気を上げる。左上の「地図」で戦術地図' : `${K('rally')} で鼓舞（組の士気を上げる）。${K('map')} で戦術地図`));
    rt.flags.point = POINT2;
    // 大沢の手（足軽大将の手らしく二十人ほど。見た目だけ）
    nagashinojo.kit.farHost(rt, 32, 80, 10, 5, 20, Math.PI, nagashinojo.kit.ARMOR.oda, 'oda', 29, 'spear');
    // 攻め口を選ぶ（大沢の台詞が済んでから。選ばなければ林の端のまま＝印を勝手に動かさない）
    rt.after(15, () => rt.choose('大沢「どこから攻めるか、その方に任せる」', [
      { label: '林の端から、敵の先手の横腹を突く', note: '今の印のまま。持ち場は遠いが、敵の横腹を突ける' },
      { label: '前備の横に並び、正面から当たる', note: '印が近くへ移る。味方の近くで戦える。横腹は突きにくい' },
    ], (i) => {   // 0 = 林の端、1 = 前備の横
      // もう林の端を押さえ終えていれば、持ち場は変えない（済んだ任務を「まだ」に戻さない）
      if (i === 1 && rt.flags.pointDone) { rt.say('大沢勘兵衛', 'もう林の端を押さえたか。ならば、そのまま待て', 3); rt.G.rel.osawa.trust += 1; return; }
      if (i === 1) {
        rt.flags.point = { x: 26, z: 12 };
        rt.marker('point', rt.flags.point, '持ち場（前備の横）');
        rt.zone('point', rt.flags.point.x, rt.flags.point.z, 10);
        rt.obj('point', '組を連れて前備の横を押さえよ', 'main');
        rt.say('大沢勘兵衛', '手堅いのう。よかろう、前備の横で待て', 3);
      } else rt.say('大沢勘兵衛', 'よし、林の端じゃ。横腹を突け', 3);
      rt.G.rel.osawa.trust += i === 0 ? 3 : 1;
    }, 30));
    // 号令の手ほどき
    rt.tutStart('号令の手ほどき', [['cmd_follow', `ついて来い（${K('follow')}）`], ['cmd_hold', `待て（${K('hold')}）`], ['cmd_retreat', `退け（${K('retreat')}）`], ['radial', '号令の輪（Tab 長押し）']]);
    // 大軍：北に斎藤の本隊（隊ごとに並ぶ。崩れたら北へ退いていく）、南に織田の本隊
    const F = rt.flags;
    const KT = nagashinojo.kit;
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    const KS = ['spear', 'gun', 'mixed', 'spear', 'cavalry', 'spear', 'gun', 'honjin', 'spear'];
    // 斎藤の本陣（z -150）は下の camp で、大将と旗本を本物の兵で置く（遠景の本陣の形は重ねない）
    F.farS = [[-112, -116], [-70, -128], [-24, -134], [22, -130], [68, -120], [-90, -98], [50, -104], null, [-50, -148]]
      .map((q, i) => q && DA(q[0], q[1], 26, KS[i] === 'gun' ? 6 : (KS[i] === 'honjin' ? 22 : 12), KS[i] === 'cavalry' ? 100 : 150, 0, i % 2 ? 0x3a3a30 : 0x35382c, 'saito', 5 + i, KS[i])).filter(Boolean);
    const KO = ['spear', 'gun', 'cavalry', 'spear', 'mixed'];
    F.farO = [[-96, 120], [-50, 130], [0, 130], [-20, 104], [-110, 88]]
      .map(([x, z], i) => DA(x, z, 22, KO[i] === 'gun' ? 6 : 12, KO[i] === 'cavalry' ? 90 : 120, Math.PI, KT.ARMOR.oda, i === 2 ? 'eiraku' : 'oda', 20 + i, KO[i]));
    // 信長の本陣：陣幕の内に床几の大将と諸将、後ろに馬印と旗本
    F.odaCamp = camp(rt, { x: 0, z: 150, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長', haori: 0x7a1d14 }, guard: 15, reserve: 260, runTo: { x: -20, z: 60 } });
    // 斎藤の本陣：大将と旗本（北の奥。崩れた後も見に行けば陣に大将がいる）
    F.saitoCamp = camp(rt, { x: -2, z: -148, facing: 0, team: 1, faction: 'saito', mon: 'saito', general: { name: '斎藤龍興' }, depth: true, guard: 15, reserve: 300, runTo: { x: -14, z: -96 } });
    rt.scene.add(nobori(W, -12, 156, 'eiraku', 6));
    // 遠景の村（西の在所）
    KT.farVillage(rt, -126, -30, { rot: -Math.PI / 2, n: 6, fields: 8, seed: 4 });
    // 西の端では、合図とともに両軍の隊がぶつかり合う（見た目だけ）
    F.clash = [DA(-84, 40, 14, 8, 70, Math.PI, KT.ARMOR.oda, 'oda', 31, 'spear'), DA(-84, -60, 14, 8, 70, 0, 0x35382c, 'saito', 32, 'spear')];
    // 名のある備の後ろに、同じ旗の控え（斎藤の日比野・長井の備と、織田の本備）
    // 控えは戦う場所（北の畦 z -70 から織田の陣 z 28 の間）へは入らず、その手前で止まって待つ（戦う兵が軽い兵の中に埋もれないように）
    const beyond = (g, z, north) => () => { const c = g.center(); return north ? c.z > z : c.z < z; };
    KT.backOf(rt, F.M, { flag: 'saito', armor: 0x35382c, kind: 'spear', w: 16, depth: 10, count: 110, seed: 33, stop: beyond(F.M, -72, true) });
    KT.backOf(rt, F.N, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 14, depth: 8, count: 80, seed: 34, stop: beyond(F.N, -76, true) });
    KT.backOf(rt, F.B, { flag: 'oda', armor: KT.ARMOR.oda, kind: 'spear', w: 18, depth: 10, count: 110, seed: 35, stop: beyond(F.B, 30, false) });
    KT.backOf(rt, F.V, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 14, depth: 8, count: 70, seed: 36, stop: beyond(F.V, -86, true) });
    rt.after(4, () => {
      const V = rt.flags.V;
      V.speed = 4.8;   // 畦を渡る先手を待つ間を短く（出会うまで長すぎるとの声で、さらに詰めた）
      V.order = 'move'; V.dest = { x: 14, z: -4 };
      V.onArrive = (g) => { rt.flags.vArrived = rt.t; g.order = 'attack'; g.seekRange = 18; g.anchor = { x: 14, z: -4 }; };
      rt.say('足軽', '敵の先手が出てきたぞ！', 3);
    });
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    this.moveFar(rt, dt);
    // 指示地点の確保（合図が鳴った後は、落とした任務の進み具合を動かさない）
    if (!F.pointDone && !F.signal) {
      const alive = rt.squad.filter((s) => s.alive);
      const near = alive.filter((s) => Math.hypot(s.pos.x - (F.point || POINT2).x, s.pos.z - (F.point || POINT2).z) < 14).length;
      const pt = F.point || POINT2;
      const pd = Math.hypot(p.x - pt.x, p.z - pt.z);
      if (pd < 10 && near >= Math.ceil(alive.length * 0.6)) F.holdT = (F.holdT || 0) + dt;
      rt.objProgress('point', F.holdT ? `持ち場を守る ${Math.min(8, Math.floor(F.holdT))}/8秒` : pd < 10 ? `組 ${near}/${alive.length} 着いた` : `持ち場まで ${Math.max(10, Math.round(pd / 5) * 5)}m`);
      // 着かないまま長い時は、大沢が行き方を言う（一度だけ）
      if (!F.pointNudge && rt.t > 70 && pd >= 10) { F.pointNudge = true; rt.say('大沢勘兵衛', `${nm(rt)}、持ち場はあちらじゃ。組を連れて旗の印の所へ行き、輪の中で待て`, 4); }
      if ((F.holdT || 0) >= 8) {
        F.pointDone = true;
        rt.objDone('point'); rt.objProgress('point', ''); rt.unmark('point'); rt.unzone('point');
        rt.award((t) => { t.c.point = 1; }, '持ち場を押さえた');
        rt.say('伝令', '大沢様より「よし、そのまま待て」とのこと！', 3);
      }
    }
    // 合図を待つ間：敵の先手が畦を渡って来る残りの遠さと、合図までの見通し
    if (F.pointDone && !F.signal) {
      const vc = F.V.center(), pt = F.point || POINT2;
      rt.objProgress('wait', F.vArrived ? `まもなく合図（あと ${Math.max(0, Math.ceil(6 - (rt.t - F.vArrived)))}秒）` : `敵の先手まで ${Math.round(Math.hypot(vc.x - pt.x, vc.z - pt.z))}m`);
    }
    // 待つ間も戦は動く：先手の足音、西の端の小競り合い（出会うまでが長すぎるとの声で、間合いを詰めた分、見せ場も短く濃く）
    if (F.pointDone && !F.signal) {
      F.waitT = (F.waitT || 0) + dt;
      if (!F.wt1 && F.waitT > 2) { F.wt1 = true; rt.say('組の足軽', '（小声で）先手の槍の穂先が、畦の向こうで光っておる……', 3); }
      if (!F.wt2 && F.waitT > 5) { F.wt2 = true; rt.army.play('eshout', { x: -84, z: -20 }, 1.2); rt.bark('西の端で、物見どうしが槍を合わせた'); }
    }
    // 合図
    if (!F.signal && ((F.pointDone && F.vArrived && rt.t - F.vArrived > 6) || rt.t > 120)) {
      F.signal = rt.t;
      sfx('horagai', 1);
      rt.banner('法螺貝の合図');
      rt.say('大沢勘兵衛', '今ぞ！　横合いから先手を突き崩せ！', 3.5);
      rt.after(5, () => rt.say('大沢勘兵衛', '日比野が寄せたら、中の鉄砲が放つ。揺れた所を横から突け', 3.5));
      rt.after(9, () => rt.say('伝令', '前備が敵を引きつけておる。西の横備えが横腹へ、東の右手の備が反対の側面へ回る三手じゃ。長良川の向こう、下宿の方からも新手が見える', 5));
      rt.objDone('wait'); rt.objRemove('wait');
      rt.tutEnd();
      if (!F.pointDone) { rt.objFail('point'); rt.objProgress('point', ''); rt.unmark('point'); rt.unzone('point'); }
      rt.obj('break', '敵の先手を崩せ', 'main');
      rt.marker('V', centerOf(F.V), () => `敵の先手・${moraleWord(F.V.morale)}`, { red: true, group: F.V });
      F.M.order = 'move'; F.M.dest = { x: -12, z: -14 }; F.M.speed = 2.2;
      F.M.onArrive = (g) => { g.order = 'attack'; g.seekRange = 30; rt.army.play('eshout', g.center(), 2); };
      F.B.order = 'attack'; F.B.seekRange = 40; F.B.anchor = { x: -12, z: -8 };
      F.A.order = 'attack'; F.A.seekRange = 30;
      F.N.order = 'move'; F.N.dest = { x: -44, z: -24 }; F.N.speed = 2.2;
      F.N.onArrive = (g) => { g.order = 'attack'; g.seekRange = 30; };
      F.Y.order = 'attack'; F.Y.seekRange = 40; F.Y.anchor = { x: -44, z: -18 };
      // 右手の備：中央の前備が敵を拘束する間に、東から反対の側面へ回る
      F.R3.order = 'move'; F.R3.dest = { x: 40, z: -34 }; F.R3.speed = 2.4;
      F.R3.onArrive = (g) => { g.order = 'attack'; g.seekRange = 34; };
      rt.obj('right', '右手の備と共に、敵の東の側面を突け', 'side');
      rt.obj('nagai', '横備えと共に、長井の備を横から突け', 'side');
      // 軍議（def.gungi）で「川上から渡る」を選んだ時：横備えが瀬を渡って長井の備の後ろへ先に回り込んだとし、
      // 気取られた分だけ長井の士気を早く崩す（史実の既定「正面」はこれまで通り）
      if (F.strategy === 'river') {
        F.N.morale = Math.min(F.N.morale, 70);
        rt.say('大沢勘兵衛', '横備えは瀬を渡って、もう長井の背へ回っておる。今じゃ！', 3.5);
      }
    }
    if (F.signal && F.M && volleyAt(rt, 'moriM', F.G, [F.M, F.V], { r: 30, until: F.signal + 50, hit: 26, then: ['大沢勘兵衛', '日比野の備が揺れたぞ！　横から突け！'] })) rt.objProgress('break', '鉄砲で敵が揺れた');
    if (F.signal && !F.rightDone && F.R3 && (F.vBroken || F.R3.routed || F.R3.count === 0)) { F.rightDone = true; rt.objDone('right'); }
    if (F.signal && !F.nagaiDone && F.N && (F.N.routed || F.N.count === 0)) { F.nagaiDone = true; rt.objDone('nagai'); }
    // 合図から 40 秒たっても先手を一度も突けていない時（深手で下がっていた等）も、前備に押されて先手は崩れうる（任務が止まらないように）
    if (F.signal && !F.vBroken && F.V.noRout && rt.t - F.signal > 30) { F.V.noRout = false; F.V.morale = Math.min(F.V.morale, 45); }
    // 合図の後、近くに討つ敵のいなくなった味方の備は、持ち場で構えて待つ（「かかれ」のまま立ち尽くさない）。敵が寄れば、またかかる
    if (F.signal) {
      F.calmT = (F.calmT || 0) - dt;
      if (F.calmT <= 0) {
        F.calmT = 1;
        for (const g of [F.A, F.B, F.Y]) {
          if (!g || !g.count || g.routed || (g.order !== 'attack' && !g.calm)) continue;
          const foe = rt.army.nearestEnemy({ pos: g.center(), team: g.team }, (g.seekRange || 30) + 6);
          if (g.order === 'attack' && !foe) { g.calm = true; g.order = 'hold'; }
          else if (g.calm && foe && g.order === 'hold') { g.calm = false; g.order = 'attack'; }
        }
      }
    }
    depthTick(rt, dt);
    // 深追いの監視（追い討ちの下知が出た後は咎めない）
    if (F.vBroken && !F.pursuitOK && !depthOn(rt)) {
      if (p.z < LINE2) {
        F.pursT = (F.pursT || 0) + dt;
        if (F.pursT > 2.5 && (F.pursCd || 0) <= 0 && (F.pursN || 0) < 2) {
          F.pursN = (F.pursN || 0) + 1;
          F.pursCd = 15;
          rt.award((t) => t.pursuits++, '勝手に深追いした');
          rt.say('大沢勘兵衛', '深追いするなと申したであろう！戻れ！', 3);
        }
      } else F.pursT = 0;
      F.pursCd = (F.pursCd || 0) - dt;
    }
    // 新手
    if (F.Rz && !F.rzDone && (F.Rz.routed || F.Rz.count === 0)) {
      F.rzDone = true;
      rt.objDone('rz'); rt.unmark('rz');
      rt.award((t) => t.side.push('新手を食い止めた'), '新手を食い止めた');
      rt.say('大沢勘兵衛', 'ようしのいだ！　新手は退いたぞ', 3);
    }
    // 判断：日比野の備が本備を押している（先手を崩して 30 秒後に一度だけ）
    if (F.vBroken && !F.mChoice && F.vBrokenT && rt.t - F.vBrokenT > 30 && !rt.G.lord && F.M.count > 6 && !F.M.routed) {
      F.mChoice = true;
      rt.say('伝令', '本備が日比野の備に押されておりまする！', 3);
      // 持ち場は選んだ攻め口で違う（林の端か、前備の横か）
      const here = F.point && F.point !== POINT2 ? '前備の横' : '林の端';
      rt.choose('日比野の備が本備を押している。どうする？', [
        { label: '組を連れて西へ回り、日比野の横腹を突く', note: `日比野が早く崩れる。${here}は空く（東の新手は大沢の組が受ける）` },
        { label: `${here}に残り、東の新手に備える`, note: '持ち場を守る。日比野との押し合いは長引く' },
      ], (i) => {
        if (i === 0 && !F.M.routed && F.M.count) {
          F.helpM = true;
          rt.obj('hm', '西へ回り、日比野の備の横腹を突け', 'side');
          const c = F.M.center();
          rt.marker('hm', { x: c.x + 14, z: c.z }, '日比野の横腹', { h: 3 });
          rt.zone('hm', c.x + 14, c.z, 8);
          F.hmPt = { x: c.x + 14, z: c.z };
          rt.say('大沢勘兵衛', `よし、行け！　${here}はわしが持つ`, 3);
        } else if (!F.M.routed && F.M.count) { rt.say('大沢勘兵衛', '持ち場を離れぬか。……よかろう、東を頼む', 3); F.M.morale = Math.min(100, F.M.morale + 10); }
      }, 20);
    }
    // 保険：先手が崩れて 130 秒たっても日比野の備が踏みとどまる時は、討死の噂で崩れかける（段が止まらないように）
    if (F.vBroken && F.vBrokenT && !F.mPush && rt.t - F.vBrokenT > 90 && F.M.count && !F.M.routed) { F.mPush = true; F.M.noRout = false; F.M.morale = Math.min(F.M.morale, 15); rt.say('伝令', '日比野の備、崩れかかっておりまする！', 3); }
    // 日比野が先に崩れたら、横腹を突く下知は畳む
    if (F.helpM && !F.hmDone && (F.M.routed || !F.M.count)) { F.hmDone = true; rt.unmark('hm'); rt.unzone('hm'); rt.objRemove('hm'); }
    if (F.helpM && !F.hmDone && F.hmPt) {
      const p = rt.player.u.pos;
      if (Math.hypot(p.x - F.hmPt.x, p.z - F.hmPt.z) < 8) {
        F.hmDone = true; rt.unmark('hm'); rt.unzone('hm'); rt.objDone('hm');
        F.M.morale -= 30;
        rt.banner('横腹を突いた', '日比野の備が揺らぐ');
        rt.award((t) => t.side.push('日比野の備の横腹を突いた'), '日比野の横腹を突いた');
      }
    }
    // 最後の段：退く斎藤勢の殿（しんがり）が畦の手前で踏みとどまる。畦を越えずに崩せ
    const mDone0 = F.vBroken && (F.M.routed || F.M.count === 0) && F.Rz && (F.rzDone || rt.t - F.rzT > 55);
    // 殿の前に段を重ねる（立て直し→在所の鉄砲の判断→長井の残りとの押し合い）
    if (!rt.G.lord && F.signal && !F.ending && mDone0 && !F.dpA) { F.dpA = true; depthStart(rt, moriCtx(rt), moriA(), () => { F.dpAdone = true; }); }
    if (!rt.G.lord && F.signal && !F.ending && mDone0 && F.dpAdone && !F.rearG) {
      F.rearG = enemyGroup(rt, { faction: 'saito', name: '斎藤の殿', anchor: { x: -20, z: LINE2 + 10 }, facing: 0, order: 'hold', aggro: 14, width: 14, morale: 95, fleeDir: { x: 0, z: -1 }, formation: 'yari' },
        [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: (F.dpMem || {}).moriVillage ? 1 : 3 }]);
      F.rearG.dmgMult = 0.6;   // 押し合いと本隊の押し出しを凌いだ後なので、殿の打ち込みは段の敵と同じくらいに
      F.rearT = rt.t;
      nagashinojo.kit.backOf(rt, F.rearG, { flag: 'saito', armor: 0x35382c, kind: 'spear', w: 22, depth: 12, count: 170, seed: 135 });
      rt.banner('斎藤の殿', '畦の手前で踏みとどまる');
      rt.say('大沢勘兵衛', '退く斎藤の殿が踏みとどまった。畦の手前で崩せ。畦は越えるな！', 4);
      rt.obj('rear', '畦の手前で斎藤の殿を崩せ（畦を越えない）', 'main');
      rt.marker('rear', centerOf(F.rearG), () => `斎藤の殿・${moraleWord(F.rearG.morale)}`, { red: true, group: F.rearG });
      rt.after(12, () => { if (F.rearG && !gone(F.rearG)) { F.rearG.order = 'attack'; F.rearG.seekRange = 30; } });
    }
    if (F.rearG && F.rearG.count < 6 && !gone(F.rearG)) F.rearG.morale = Math.min(F.rearG.morale, 20);
    // 勝敗
    if (F.signal && !F.ending) {
      const mDone = mDone0 && (rt.G.lord || (F.rearG && (gone(F.rearG) || rt.t - F.rearT > 55)));
      if (F.rearG && mDone && !F.rearScored) { F.rearScored = true; rt.unmark('rear'); if (gone(F.rearG)) { rt.objDone('rear'); rt.award((t) => t.side.push('斎藤の殿を崩した'), '斎藤の殿を崩した'); } else rt.objFail('rear'); }
      // 殿を崩した後も段を重ねる（追い討ちの下知→後備え→侍大将か横備えか→稲葉山の後詰）
      if (mDone && !rt.G.lord && !F.dpB) { F.dpB = true; F.pursuitOK = true; depthStart(rt, moriCtx(rt), moriB(), () => { F.dpBdone = true; }); }
      if ((mDone && (rt.G.lord || F.dpBdone)) || (!depthOn(rt) && rt.t - F.signal > (rt.G.lord ? 330 : 1500))) {
        if (F.Rz && !F.rzDone) { rt.objFail('rz'); rt.unmark('rz'); }
        F.ending = true;
        if (!F.vBroken) { rt.tracker.main = false; rt.objFail('break'); }
        rt.banner('斎藤勢、退いていく');
        rt.say('大沢勘兵衛', '勝ち戦じゃ！　皆、ようやった', 3.5);
        sfx('horagai', 0.7);
        // 戦の後：森部薬師堂付近で首実検（前田利家の手柄は背景の報告にとどめ、主人公の手柄を奪わない）
        rt.after(4, () => {
          rt.banner('森部薬師堂', '討ち取った首を検め、戦功を定める');
          rt.say('大沢勘兵衛', '薬師堂の前で首実検じゃ。手柄の帳面をつけよ', 3.5);
          rt.after(3.5, () => rt.say('伝令', '前田又左衛門殿も、一つ首を挙げられたとのこと', 3));
        });
        rt.finish({}, 14);
      }
    }
  },

  // 遠くの両軍（見た目だけ）：合図で織田が押し出し、西の端で駆け寄ってぶつかる。日比野が崩れたら斎藤は崩れ、北へ退く
  moveFar(rt, dt) {
    const F = rt.flags;
    nagashinojo.kit.backTick(rt);
    if (!F.signal) return;
    if (!F.farGo) {
      F.farGo = true;
      F.farO.forEach((m, i) => rt.after(i * 1.2, () => m.advance(30, 14)));
      for (const m of F.clash) m.advance(44, 14, { charge: true });
    }
    if (F.sBack && !F.farBack) {
      F.farBack = true;
      F.clash[1].rout({ hideAfter: 40 });
      // 前の備は崩れて散り、後ろの備と本陣は背を向けて退く
      F.farS.forEach((m, i) => rt.after(1 + i * 1.3, () => (m.army.cz > -125 || i % 3 === 0 ? m.rout({ hideAfter: 50 }) : m.retreat(50, 30))));
    }
  },

  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.M || g === F.N) {
      F.sBack = true;
      if (g === F.M && F.N.count > 0) F.N.morale -= 40;
    }
    if (g === F.V && !F.vBroken) {
      F.vBroken = true; F.vBrokenT = rt.t;
      rt.unmark('V');
      rt.objDone('break');
      rt.banner('敵の先手、崩れたり');
      rt.award((t) => { t.special = { label: '敵先手崩し', pts: 25 }; t.main = true; }, '敵先手崩し・任務達成');
      F.M.morale = Math.min(F.M.morale, 85) - 10;
      F.M.noRout = false;
      F.B.noRout = false;
      // 東から新手（組で受け止める場面）
      rt.after(14, () => {
        const Rz = enemyGroup(rt, { faction: 'saito', anchor: { x: 95, z: -70 }, facing: -2.3, order: 'attack', seekRange: 90, fleeDir: { x: 1, z: -0.6 }, morale: 95 },
          // 組が五人の見習いの時は、新手も小勢に（組で受け止められる数）
          (rt.squad.length < 10 ? [{ type: 'samurai', n: 1 }, { type: 'cavalry', n: 1 }, { type: 'ashigaru', n: 7 }] : [{ type: 'samurai', n: 1 }, { type: 'cavalry', n: 2 }, { type: 'ashigaru', n: 10 }]));
        Rz.anchor = { x: (F.point || POINT2).x, z: (F.point || POINT2).z + 8 };
        // 見習いの組が受け止める新手は、長駆してきて息が上がっている（打ち込みを少し弱く）
        if (rt.squad.length < 10) for (const u of Rz.units) u.dmg *= u.type === 'cavalry' ? 0.6 : 0.8;
        F.Rz = Rz;
        F.rzT = rt.t;
        rt.banner('新手', '東の林から');
        rt.say('大沢勘兵衛', `東から新手じゃ！　${nm(rt)}、組をまとめて食い止めよ！`, 4);
        nagashinojo.kit.backOf(rt, Rz, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 18, depth: 10, count: 150, seed: 37, stop: () => { const c = Rz.center(); return c.x < 80; } });
        rt.bark('「待て」で踏みとどまるか、「退け」で下がって味方と合うか。組頭が決める');
        rt.obj('rz', '東からの新手を食い止めよ', 'side');
        rt.marker('rz', centerOf(Rz), () => `新手・${moraleWord(Rz.morale)}`, { red: true, group: Rz });
      });
      rt.say('大沢勘兵衛', '見事じゃ！　だが深追いはするな。北の畦より先へは出るでない', 4);
      rt.obj('purs', '深追いするな（北の畦を越えない）', 'order');
    }
    if (g === F.M) rt.say('足軽', '日比野の備えが崩れたぞ！', 2.5);
    // 崩れた後、名のある将の討死が伝わる（史実では日比野下野守・長井甲斐守ともにこの戦で討たれた）
    if ((g === F.M || g === F.N) && !g.deathSaid) {
      g.deathSaid = true;
      const b = g.units.find((u) => u.type === 'busho');
      rt.after(g === F.M ? 7 : 9, () => {
        if (b && b.alive && rt.distTo(b.pos) > 35) rt.army.kill(b, null);
        rt.say('伝令', g === F.M ? '日比野下野守、討ち取られたり！' : '長井甲斐守も討たれたとのこと！', 3);
      });
    }
  },

  onKill(rt, v, k) {
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1; else rt.flags.ak = (rt.flags.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (rt.flags.signal && v.group === rt.flags.V && k && (k.isPlayer || k.isSub)) rt.flags.V.noRout = false;
  },
  onPlayerHit(rt, t) {
    if (rt.flags.signal && t.group === rt.flags.V) rt.flags.V.noRout = false;
    // こちらを狙って斬りかかってきた相手を受け返しただけなら咎めない
    if (!rt.flags.signal && !rt.flags.early && t.team === 1 && t.target !== rt.player.u) {
      rt.flags.early = true;
      rt.violation('合図の前に仕掛けた', ['大沢勘兵衛', '待てと申したはずじゃ！']);
    }
  },
  onSquadCommand(rt, id) {
    if (!rt.flags.signal && !rt.flags.early && (id === 'attack' || id === 'focus')) {
      rt.flags.early = true;
      rt.violation('合図の前に突撃を命じた', ['大沢勘兵衛', '号令はまだじゃ！　組を下げよ！']);
    }
  },
};
// 森部の bot（素直な遊び手）：組を連れて指示地点へ。合図までは目の前の敵だけ。合図の後は先手を突き、深手なら組の後ろへ下がる。
// 大沢の「北の畦より先へは出るな」を守る（逃げる敵を追って斎藤の本隊へ一人で入らない）
moribe.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.guardHold = false;
  if (!u.alive) return;
  // 段（b_depth.js）が動いている間は、そちらの的へ向かう
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  const pt = F.point || POINT2;
  if (u.hp < u.maxHp * 0.45) F.botBack = true;
  if (F.botBack && u.hp > u.maxHp * 0.75) F.botBack = false;
  // 組がついて来るように、初めに一度「ついて来い」
  if (b.squadGroups[0] && b.squadGroups[0].order !== 'follow' && !F.signal && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 3; }
  const sq = b.squadGroups[0];
  if (F.botBack) {
    const c = F.B && F.B.count ? F.B.center() : { x: 20, z: 30 };
    goTo(p, inp, c.x, c.z + 8, 3);
    inp.guardHold = !!b.army.nearestEnemy(u, 3);
    return;
  }
  const reach = F.signal ? 14 : 4;
  const e = b.army.nearestEnemy(u, reach, (o) => !o.noTarget && !o.fleeing && o.pos.z > LINE2 - 4);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6;
    if (F.signal && sq && sq.order !== 'attack' && !(b.botCmdT > b.t)) { inp.e.add('KeyC'); b.botCmdT = b.t + 3; }
    return;
  }
  // 行き先：合図の前は指示地点、合図の後は先手（崩れた後は新手、それも無ければ前備の横）
  let q = pt;
  if (F.signal) {
    const tg = !F.vBroken && F.V.count ? F.V : F.Rz && F.Rz.count && !F.Rz.routed ? F.Rz : null;
    q = tg ? tg.center() : { x: 20, z: -20 };
  }
  if (q.z < LINE2 + 4) q = { x: q.x, z: LINE2 + 4 };
  goTo(p, inp, q.x, q.z, F.signal ? 4 : 5);
};
moribe.canSkip = (rt) => (rt.flags.pointDone && !rt.flags.signal ? '合図まで待つ' : '');
moribe.skip = (rt) => {
  const F = rt.flags, V = F.V;
  // 先手がまだ畦の向こうなら、渡り切った所まで進めてから合図
  if (!F.vArrived && V && V.count && V.dest) {
    const c = V.center(), dx = V.dest.x - c.x, dz = V.dest.z - c.z;
    for (const u of V.units) if (u.alive) { u.pos.x += dx; u.pos.z += dz; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); }
    if (V.onArrive) { const f = V.onArrive; V.onArrive = null; f(V); }
  }
  F.vArrived = rt.t - 13;
};
moribe.rts = true;   // 侍大将以上は上空の指揮（rtsCanCommand の身分の縛りは rts.js 側）
moribe.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '斎藤軍', mon: 'saito' } };
// 史実でこの戦にいた名のある武将（battle.js の placeFamous が、その家の隊に加える。敵は名乗り、討てば手柄）
moribe.famous = [
  { name: '前田利家', team: 0, g: /横備え|前備/, loose: 1, line: '前田又左衛門、帰参の手土産に首を取りに参った！' },
  { name: '足立六兵衛', g: /殿/, loose: 1, line: '美濃の頸取り足立六兵衛とはわしの事よ！　その首、置いてゆけ！' },
];
moribe.date = (rt) => `永禄四年五月十四日　${seasonOf('五月')}・${sky(rt)}`;
// 森部：はっきりした数は伝わらない。控えめに、織田 約千五百、斎藤 約六千とする
moribe.force = (rt) => {
  const F = rt.flags;
  return { a: 1500 - (F.ak || 0) * 6, a0: 1500, b: 6000 - (F.ek || 0) * 20 - (F.ending ? 800 : 0), b0: 6000 };
};
moribe.history = '永禄四年五月、斎藤義龍の急死の直後に信長は美濃へ攻め入り、森部で斎藤勢を破った。この戦いで斎藤方の日比野下野守・長井甲斐守が討ち死にしている。斎藤家の紋は「撫子」（二頭立波とする伝えもある）。道三の頃から撫子を使ったと伝わるが、義龍・龍興の頃の旗の形ははっきりしない。この戦では撫子の旗にしている。';

// 軍議（gungi.js・F6）：合図の後の仕掛け方を二つから選ぶ。史実の既定は正面
//   ①front（既定）：横備えは陸から正面で長井の備に当たる
//   ②river：横備えが瀬を渡って長井の備の背へ先に回り込む（長井の士気が早く揺らぐ）
// 軍議は侍大将候補（rank 3）から（main.js の canGungi）。組頭見習いは史実の既定（正面）で進む
moribe.gungi = (rt) => {
  const F = rt.flags;
  const G = {
    center: { x: -20, z: -40 }, dist: 100,
    units: [{ id: 'plan', name: '横備え', group: () => F.Y, nominal: () => (F.Y ? F.Y.count : 0) }],
    routes: [
      { id: 'front', name: '陸から正面で、長井の備に当たる' },
      { id: 'river', name: '瀬を渡って、長井の備の背へ回り込む' },
    ],
    default: { plan: 'front' },
    enemy: [
      { name: '日比野下野守の備', known: true, count: () => (F.M ? F.M.count : 0) },
      { name: '長井甲斐守の備', known: true, count: () => (F.N ? F.N.count : 0) },
    ],
    onStart: (assign) => moribe.onGungiStart(rt, assign),
  };
  const auto = window.__moribeStrategy || (/[?&]bot/.test(location.search) ? 'front' : null);
  if (auto) { moribe.onGungiStart(rt, { plan: auto }); return null; }
  return G;
};
moribe.onGungiStart = (rt, assign) => {
  rt.flags.strategy = (assign && assign.plan) || 'front';
};

// ---- 森部 ----
function moriCtx(rt) {
  const F = rt.flags;
  // 本備・横備えが尽きても、大沢の手から一手が加わる（組が全滅して一人で受けることにならない）
  return { faction: 'saito', dmg: 0.56, friends: () => [F.A, F.B, F.Y].filter((g) => g && g.count && !g.routed), aid: { name: '大沢の手の一組', list: [uS(1), uA(8)] }, aidSaid: '大沢の手から一組が加わった' };
}
// 日比野が崩れ、東の新手を受けた後：立て直し → 判断（在所の鉄砲組か、中央か）→ 長井の残りとの押し合い（東から横槍）→ 殿（前からの流れ）
function moriA() {
  return [
    DP.rest({ dur: 9, say: [['大沢勘兵衛', '組を集めよ。手負いは後ろへ下げ、槍を持てる者だけで組み直せ'], ['足軽', '組頭、与作が脚をやられた……歩けぬ'], ['大沢勘兵衛', '荷駄の者に運ばせよ。……長井の備の残りが、西で立て直しておる。まだ終わらぬぞ']] }),
    DP.pick({ time: 12, title: '西の在所に斎藤の鉄砲組が籠もり、横備えを撃っている。どうする？',
      pre: (rt) => rt.say('伝令', '西の在所から鉄砲！　横備えが撃たれておりまする！', 3),
      options: [{ label: '在所へ回り、鉄砲組を追い出す', note: '横備えが助かる。後の斎藤の殿（しんがり）に鉄砲が加わらない' }, { label: '中央に残り、押し返してくる長井の残りを受ける', note: '味方の大勢と並べる。在所の鉄砲は殿に加わる' }],
      on: (rt, m, i) => { m.moriVillage = i === 0; rt.say('大沢勘兵衛', i === 0 ? 'よし、在所へ回れ。家の陰から撃たれるな' : 'よし、中央で槍を揃えよ', 3); } }),
    DP.fight({ max: 95, skip: (rt, m) => !m.moriVillage, at: { x: -70, z: -30 }, title: '在所の鉄砲組', sub: '家の陰から撃つ斎藤の鉄砲', obj: '西の在所の鉄砲組を追い出せ',
      foes: () => [{ name: '在所の鉄砲組', from: { x: -84, z: -44 }, list: [uS(1), uG(4), uA(6)], seek: 45 }],
      reward: '在所の鉄砲組を追い出した' }),
    DP.fight({ max: 95, at: { x: -20, z: -36 }, title: '押し合い', sub: '長井の備の残りが、斎藤の後詰と押し返してくる', obj: '押し返してくる斎藤勢を受け止め、崩せ',
      say: [['大沢勘兵衛', '来るぞ！　本備と並べ、押し負けるな！']],
      foes: (rt, m) => [{ name: '長井の備の残り', from: { x: -46, z: -84 }, list: [uS(2), uA(m.moriVillage ? 10 : 12)], noRout: 20 }],
      later: [{ t: 34, title: '横槍', sub: '東の林から斎藤の後詰', say: ['足軽', '東から横槍じゃ！　騎馬が混じっておる！'], foes: () => [{ name: '斎藤の後詰', from: { x: 56, z: -60 }, list: [uS(1), uC(2), uA(8)], mass: 150 }] },
        { t: 62, title: '新手', sub: '長井の備の後ろから、斎藤の新手が押し出す', say: ['大沢勘兵衛', 'まだ来るか！　本備と並べ、押し返せ！'], foes: () => [{ name: '斎藤の新手', from: { x: -30, z: -96 }, list: [uS(2), uA(10)], mass: 200 }] }],
      reward: '長井の残りを押し返した' }),
    DP.rest({ dur: 8, bark: '立て直し：組を寄せ直す', say: [['大沢勘兵衛', '手負いを下げよ。……見よ、斎藤の本隊が押し出してくる'], ['足軽', 'あれは……畦の向こう一面、斎藤の旗じゃ']] }),
    DP.hold({ at: { x: -4, z: -44 }, dur: 50, r: 14, title: '斎藤の本隊、押し出す', sub: '畦の向こうから、斎藤の大軍がどっと押し寄せる', label: '本備の前', obj: '本備の前で斎藤の本隊を受け止めよ',
      say: [['大沢勘兵衛', '槍衾じゃ！　本備と肩を並べよ。一歩も退くな！']],
      waves: (rt, m) => [
        { t: 5, say: ['足軽', '来るぞ、一面じゃ！'], foes: () => [{ name: '斎藤の本隊の先手', from: { x: -10, z: -96 }, list: [uS(2), uA(12), uG(m.moriVillage ? 0 : 3)], mass: 220 }] },
        { t: 42, say: ['大沢勘兵衛', '二の手じゃ！　横からも来る！'], foes: () => [{ name: '斎藤の本隊の二の手', from: { x: 30, z: -92 }, list: [uS(1), uC(2), uA(8)], mass: 200 }] },
      ],
      reward: '斎藤の本隊の押し出しを受け止めた' }),
    DP.rest({ dur: 6, bark: '立て直し：息を整え、槍を並べ直す', say: [['大沢勘兵衛', '押し返したぞ！　斎藤は退きにかかった。……まだ畦は越えるな'], ['足軽', '畦の手前で、斎藤の槍が向き直っておる']] }),
  ];
}
// 斎藤の殿を崩した後：立て直し（追い討ちの下知）→ 判断（一番に追うか、足並みを揃えるか）→ 後備え → 稲葉山の後詰を受ける
function moriB() {
  return [
    DP.rest({ dur: 11, say: [['大沢勘兵衛', '……ようやった。息を整えよ'], ['伝令', '殿（信長）より下知！　畦を越えて追い討ちせよ、とのこと！'], ['大沢勘兵衛', '聞いたか。今度は越えてよい。だが組は離すな']],
      fn: (rt) => { rt.objRemove('purs'); } }),
    DP.pick({ time: 12, title: '追い討ちの下知が出た。どう追う？',
      options: [{ label: '組を連れて一番に追う', note: '敵は崩れかけで、先に着けば手柄が大きい。味方の備は遅れる' }, { label: '大沢の備と足並みを揃えて進む', note: '味方と一緒に当たれる。敵は立て直して待つ' }],
      on: (rt, m, i) => { m.moriFast = i === 0; rt.say('大沢勘兵衛', i === 0 ? '若いのう。……行け、ただし組を置いていくな' : 'それでよい。備えを崩さず進むぞ', 3); } }),
    DP.fight({ max: 95, at: { x: -6, z: -94 }, title: '追い討ち', sub: '退く斎藤勢の後備えが、北の畦で向き直る', obj: '退く斎藤勢の後備えを崩せ',
      foes: (rt, m) => [{ name: '斎藤の後備え', from: { x: -4, z: -128 }, list: [uS(2), uA(m.moriFast ? 8 : 12), uG(2)], morale: m.moriFast ? 55 : 95 }],
      later: (rt, m) => [...(m.moriFast ? [] : [{ t: 32, title: '横槍', sub: '立て直した斎藤勢が西から', say: ['足軽', '西から横槍！'], foes: () => [{ name: '立て直した斎藤勢', from: { x: -52, z: -112 }, list: [uS(1), uA(7)] }] }]),
        { t: 60, title: '押し返し', sub: '退く斎藤の本隊が、向き直って押し返してくる', say: ['大沢勘兵衛', '向き直ったぞ！　槍を揃えよ！'], foes: () => [{ name: '向き直った斎藤の本隊', from: { x: 20, z: -134 }, list: [uS(2), uA(12)], mass: 240 }] }],
      reward: (t, m) => { if (m.moriFast) t.special = { label: '一番に追い付いた', pts: 25 }; else t.side.push('斎藤の後備えを崩した'); }, rewardLabel: '斎藤の後備えを崩した' }),
    DP.rest({ dur: 9, heal: 0.6, say: [['伝令', '稲葉山から斎藤の後詰！　北の街道を下ってきまする！'], ['大沢勘兵衛', '畦まで戻れ。追い討ちはここまでじゃ。畦で槍を揃えて受けよ']] }),
    DP.hold({ skip: () => true, at: { x: 0, z: -64 }, dur: 50, r: 14, title: '稲葉山の後詰', sub: '畦で槍を揃え、斎藤の後詰を受け止めよ', label: '北の畦', obj: '北の畦で、稲葉山からの後詰を受け止めよ',
      waves: (rt, m) => [
        { t: 6, say: ['足軽', '来たぞ、北の街道じゃ！'], foes: () => [{ name: '斎藤の後詰の先手', from: { x: 0, z: -140 }, list: [uS(1), uA(10)], mass: 200, dmg: 0.5 }] },
        { t: 34, say: ['大沢勘兵衛', '騎馬じゃ！　槍衾！'], foes: () => [{ name: '斎藤の騎馬', from: { x: 40, z: -132 }, list: [uC(2), uA(5)], mass: 120, dmg: 0.5 }] },
        { t: 56, say: ['大沢勘兵衛', '後詰の総掛かりじゃ！　ここを凌げば勝ちぞ！'], foes: () => [{ name: '斎藤の後詰の総掛かり', from: { x: 10, z: -150 }, list: [uS(1), uC(1), uA(8)], mass: 260, dmg: 0.5, morale: 70 }] },
      ],
      reward: '稲葉山の後詰を受け止めた' }),
  ];
}

export { moribe };
