// ======================================================================
// 天王寺の戦い　①の段「原田勢を収める」（0〜3分。b_tennoji.js の prologue から入れる）
// 史実：五月三日、木津を攻めた原田直政の手は楼の岸から出た本願寺勢に崩され、直政は討死。残った者は天王寺砦へ逃げ込んだ。
// 遊び：西（木津の方）から、追われる原田勢の残りが砦の南の門へ駆けて来る。門前へ出て、追う門徒を払い、門の内へ入れる。
//   入れ終わるか、二分半で次の段（籠城）へ。主人公が何もしなくても進む（任務に着いたら必ず何か起きる）。
// 字は出さない：原田の旗（味方の印）と、追う門徒の赤い印、門へ駆ける列で分からせる。
// ======================================================================
import { allyGroup, enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export function install(rt, ctx) {
  const F = rt.flags;
  const { march, spent, inPoly, SOTO_POLY, T_GATE, dress, IKKO, next } = ctx;
  const t0 = rt.t;
  rt.setPhase('harada');
  // 原田の残りは十人ほど。半ばは手負い（足が遅い）。追う門徒は六人と鉄砲二。本物の兵を増やしすぎない（天王寺は携帯で重い戦）
  const H = allyGroup(rt, { name: '原田直政の手の残り', anchor: { x: -128, z: -14 }, facing: Math.PI / 2, width: 6, aggro: 4, morale: 55, noRout: true, formation: 'column' },
    [{ type: 'samurai', n: 2, o: { hat: 'kabuto_m' } }, { type: 'ashigaru', n: 7 }, { type: 'gun', n: 1 }]);
  for (const u of H.units) if (Math.random() < 0.5) { u.hp = Math.min(u.hp, u.maxHp * 0.55); u.speed = (u.speed || 3) * 0.85; }
  march(H, [[-70, -12], [-24, -18], [-4, -32], [T_GATE.x, T_GATE.z + 2], [T_GATE.x - 4, T_GATE.z - 12]], 'hold', 0);
  H.speed = 3.2;
  const P = enemyGroup(rt, { name: '原田勢を追う門徒', anchor: { x: -150, z: -10 }, facing: Math.PI / 2, width: 8, aggro: 22, seekRange: 30, morale: 70, faction: 'honganji', fleeDir: { x: -1, z: -0.4 } },
    dress([{ type: 'samurai', n: 1, o: { hat: 'hachimaki' } }, { type: 'ashigaru', n: 5 }, { type: 'gun', n: 2 }], IKKO));
  P.ai = false; P.guard = false; P.noRing = true;
  march(P, [[-80, -12], [-30, -18], [-6, -30]], 'attack');
  F.harada = H; F.haradaChase = P;
  F.foes.push(P);

  rt.say('織田の使番', '木津攻めは崩れた！　原田様の手の者が、西から砦へ逃げて来る！', 4);
  rt.after(5, () => { if (F.step === 0 && !rt.G.lord) rt.say('明智光秀', '門を半ば開けよ。原田の者を入れ、追う門徒は門前で払え！', 4); });
  rt.after(14, () => { if (!F.haradaDone) { sfx('gun', 0.5); rt.army.play?.('eshout', { x: -90, z: -12 }, 1.2); } });
  rt.after(30, () => { if (!F.haradaDone && !spent(H)) rt.say('原田の足軽', '後ろから門徒が来る！　門を閉めるな、まだ仲間がおる！', 3.5); });
  rt.obj('main', '南の門の前へ出て、逃げて来る原田勢を門の内へ入れよ', 'main');
  F.southGate?.userData?.openGate?.();   // 原田勢を入れるため、門を開ける（入れ終えたら閉め直す）
  rt.marker('harada', () => (spent(H) ? null : H.center()), '逃げて来る原田勢', { h: 3, guideAlways: true, guidePriority: 400 });
  rt.marker('haradaChase', () => (spent(P) ? null : P.center()), '追う門徒', { red: true, group: P });

  let tick = 0, shut = false;
  const st = {
    update(dt) {
      if (rt.over || F.ending) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      if (F.haradaDone) { if (!shut) st.shut(); return; }
      let inside = 0, live = 0;
      for (const u of H.units) if (u.alive && !u.woundOut) { live++; if (inPoly(SOTO_POLY, u.pos.x, u.pos.z)) inside++; }
      const el = rt.t - t0;
      rt.objProgress('main', live ? `門の内へ入った原田勢 ${inside}／${live}人` : '');
      // 皆が入った後の間：手負いの手当てと、寄せ手の鉄砲の始まり（何も起きない間を作らない）
      if (live && inside >= live && !F.haradaInSaid) {
        F.haradaInSaid = true;
        rt.say('砦の足軽', '原田の衆は皆入った！　門を閉めよ、閂を掛けよ！', 3.5);
        rt.after(8, () => { if (!F.haradaDone) { sfx('volley', 0.7); rt.say('組頭', '寄せ手の鉄砲じゃ！　柵の陰で頭を下げよ！', 3.5); } });
      }
      // 皆が入った・追手が尽きて半ばが入った・二分半たった、のどれかで籠城へ
      if ((live && inside >= live && el > 110) || (spent(P) && inside >= Math.ceil(live / 2) && el > 120) || el > 165 || !live) st.done(inside);
    },
    done(inside) {
      if (F.haradaDone) return;
      F.haradaDone = true;
      rt.unmark('harada'); rt.unmark('haradaChase');
      if (inside > 0) {
        rt.award((t) => t.side.push('木津から逃げた原田勢を砦へ収めた'), '原田勢を砦へ収めた');
        rt.say('原田の侍', 'かたじけない……。殿（原田様）は、楼の岸の鉄砲に……。', 4);
      }
      // 入った者は門の内の守りに加わる（籠城の段の味方の厚み）
      if (!spent(H)) { H.ai = false; H.order = 'hold'; H.guard = true; H.guardLeash = 4; H.noRout = false; H.name = '砦に入った原田勢'; H.anchor = { x: T_GATE.x - 6, z: T_GATE.z - 10 }; H.dest = null; H.path = null; }
      if (!spent(P)) { P.ai = true; P.noRing = false; }
      rt.after(3, () => next());
    },
    // 自分が砦の内に戻り、門口が空いてから閉める。待ち時間で兵を瞬時に移さない。
    shut() {
      const G = F.southGate?.userData;
      if (!G?.closeGate || F.step === 1 || F.breakDone) { shut = true; return; }
      const me = rt.player.u.pos;
      if (!inPoly(SOTO_POLY, me.x, me.z)) return;
      const inDoor = (u) => Math.abs(u.pos.x - T_GATE.x) < 4.2 && Math.abs(u.pos.z - T_GATE.z) < 1.6;
      let busy = false;
      for (const u of rt.army.units) if (u.alive && !u.gone && inDoor(u)) { busy = true; break; }
      if (busy) return;
      shut = true;
      G.closeGate();
      sfx('wood', 0.7);
    },
  };
  return st;
}
