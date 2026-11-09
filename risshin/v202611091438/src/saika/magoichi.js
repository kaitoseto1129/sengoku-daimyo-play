// ======================================================================
// 雑賀攻め・小雑賀川　渡河の中の段「孫一の手、高岸を下る」（約5〜8分。b_saika.js の cross から入れる。この戦の一番の場面）
// 史実：渡った堀の先手は、馬も上がれない高岸と鉄砲に阻まれ、武者数人を失って引いた（信長公記巻十）。
//   雑賀の鉄砲衆を率いたのは鈴木孫一ら（孫一本人は平井の居館の方。ここに来るのは孫一の手の者）。
// 遊び：西岸の坂の下に取り付くと、高岸の上の柵が一斉に火を噴き、孫一の手の鉄砲衆と槍が坂を下って先手を川へ押し落としに来る。
//   坂の下の足場を保って払う（対岸の確保）。払うか約二分半で退き太鼓（b_saika.js の retreat はこの段が済むまで待つ）。
// 字は出さない：八咫烏の旗・一斉の硝煙・坂を下る列で分からせる。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export function install(rt, ctx) {
  const F = rt.flags;
  const { dress, SAIKA, SHORE } = ctx;
  let G = null, G2 = null, done = false, tick = 0, startT = 0;
  const cnt = (g) => { let n = 0; if (g) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) n++; return n; };
  const live = () => cnt(G) + cnt(G2);
  // 二の寄せ：川上の坂から槍の組が回り込む（一の寄せから約五十五秒。足場を保つ間を、時間でなく寄せで作る）
  const second = () => {
    G2 = enemyGroup(rt, { faction: 'saika', name: '孫一の手の槍', anchor: { x: SHORE.x - 6, z: SHORE.z - 16 }, facing: 0, width: 8, order: 'hold', aggro: 26, seekRange: 30, morale: 90, fleeDir: { x: -1, z: 0 } },
      dress([{ type: 'samurai', n: 1, o: { hat: 'jingasa' } }, { type: 'ashigaru', n: 5 }], SAIKA));
    G2.fixed = false; G2.order = 'move'; G2.dest = { x: SHORE.x - 2, z: SHORE.z - 2 }; G2.formation = 'column'; G2.colW = 2;
    G2.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.aggro = 30; };
    sfx('volley', 0.9);
    rt.army.play?.('eshout', { x: SHORE.x - 6, z: SHORE.z - 14 }, 1.4);
    rt.say('組頭', '川上の坂からも来るぞ！　背を川に取られるな！', 3.5);
    rt.marker('mago2', () => (cnt(G2) ? G2.center() : null), '孫一の手の槍', { red: true, group: G2 });
  };

  const start = () => {
    startT = rt.t;
    // 高岸の上の柵が一斉に撃つ
    sfx('volley', 1); rt.after(1.2, () => sfx('volley', 0.9)); rt.after(2.6, () => sfx('volley', 0.8));
    for (const g of F.gunPosts || []) for (const u of g.units) u.cd = Math.min(u.cd || 0, 0.2 + Math.random() * 0.8);
    G = enemyGroup(rt, { faction: 'saika', name: '鈴木孫一の手の鉄砲衆', anchor: { x: SHORE.x - 7, z: SHORE.z + 14 }, facing: Math.PI, width: 10, order: 'hold', aggro: 26, seekRange: 30, morale: 90, fleeDir: { x: -1, z: 0 } },
      dress([{ type: 'samurai', n: 1, o: { hat: 'jingasa', name: '孫一の手の鉄砲頭' } }, { type: 'gun', n: 4 }, { type: 'samurai', n: 1, o: { hat: 'jingasa' } }, { type: 'ashigaru', n: 5 }], SAIKA));
    G.fixed = false; G.order = 'move'; G.dest = { x: SHORE.x - 2, z: SHORE.z + 2 }; G.formation = 'column'; G.colW = 3;
    G.onArrive = (q) => { q.order = 'attack'; q.formation = 'yari'; q.aggro = 30; };
    F.magoG = G;
    rt.banner('孫一の手、高岸を下る', '八咫烏の旗が坂を下って来る');
    rt.army.play?.('eshout', { x: SHORE.x - 14, z: SHORE.z }, 1.6);
    rt.after(2, () => rt.say('孫一の手の鉄砲頭', '織田の者を川へ追い落とせ！　一人も上げるな！', 3.5));
    rt.after(6, () => rt.say('堀秀政', '坂の下を離すな！　足場を保って、下りて来る槍を払え！', 4));
    rt.obj('mago', '坂の下の足場を保ち、下りて来る孫一の手を払え', 'order');
    // 後の槍の組には mago2 の印がある。先の組が尽きたら、その持ち場の印を残さない。
    rt.marker('mago', () => (cnt(G) ? G.center() : null), '孫一の手', { red: true, group: G });
    // 堀の先手も坂の下へ寄せて共に受ける
    if (F.hori && !F.hori.routed && F.hori.count) { F.hori.fixed = false; F.hori.order = 'move'; F.hori.dest = { x: SHORE.x + 2, z: SHORE.z + 3 }; F.hori.onArrive = (q) => { q.order = 'attack'; q.aggro = 18; }; }
  };

  return {
    update(dt) {
      if (done || F.ending || rt.over) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      // 渡河前に寄せを終わらせず、本人が西岸へ着いてから迎え撃つ。
      if (!startT) { if (F.reached) start(); return; }
      if (!G2 && (rt.t - startT > 55 || !cnt(G))) second();
      const n = live(), held = rt.t - startT;
      rt.objProgress('mago', `孫一の手 ${(G?.units.length || 0) + (G2?.units.length || 0)}人中 残り${n}人`);
      if ((G2 && !n && held > 110) || held > 180) {
        done = true; F.magoDone = true;
        rt.unmark('mago'); rt.unmark('mago2');
        if (!n) {
          rt.objDone('mago');
          rt.award((t) => t.side.push('高岸を下った孫一の手を、坂の下で払った'), '孫一の手を坂の下で払った');
          rt.say('堀秀政', '払ったか。だが上の柵は抜けぬ……。この岸は高すぎる', 4);
        } else {
          rt.objRemove('mago');
          for (const g of [G, G2]) if (g) {
            g.focus = null; g.retreatOnly = true;
            g.order = 'move'; g.dest = { x: SHORE.x - 8, z: g.anchor.z > 0 ? SHORE.z + 16 : SHORE.z - 16 };
            g.onArrive = (q) => { q.order = 'hold'; };
          }
        }
        // 退き太鼓の合図を少し後に（b_saika.js の retreat）
        F.bankWaitAt = rt.t - 10;
      }
    },
  };
}
