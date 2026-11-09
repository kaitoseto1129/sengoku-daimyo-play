// ======================================================================
// 雑賀攻め・小雑賀川　対陣の中の段「川下の堤の鉄砲陣」（約10〜12分。b_saika.js の hold の後、parley の前に入れる）
// 史実：川を挟む対陣は半月に及び、雑賀衆は夜ごとに小勢で渡っては鉄砲を撃ち掛けた（信長公記巻十の対陣の記事を、遊びの局地に縮めた補完）。
// 遊び：川上・川下の寄せを払った後、川下の堤の陰に雑賀の鉄砲衆が入り込み、竹束の列の横から撃ち掛ける。
//   堀の先手と堤へ寄せ、鉄砲陣を取る。取ると堤の小屋に火を掛けて潰す。取るか約二分半で和議（parley）へ。
// 字は出さない：堤の上の硝煙・赤い印・燃える小屋で分からせる。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

const DIKE = { x: -4, z: 58 };   // 川下の堤の陰（東岸）

export function install(rt, ctx) {
  const F = rt.flags;
  const { dress, SAIKA, moveGroup, next } = ctx;
  const t0 = rt.t;
  let done = false, tick = 0, fire = null, R = null, takenT = 0;
  rt.setPhase('tsutsumi');
  const G = enemyGroup(rt, { faction: 'saika', fixed: true, name: '川下の堤の雑賀鉄砲衆', anchor: DIKE, facing: 0, width: 10, order: 'hold', guard: true, guardLeash: 6, aggro: 22, seekRange: 40, morale: 85, fleeDir: { x: -1, z: 0.3 } },
    dress([{ type: 'samurai', n: 1, o: { hat: 'jingasa' } }, { type: 'gun', n: 5 }, { type: 'ashigaru', n: 4 }], SAIKA));
  G.fixed = false;
  F.tsutsumiG = G;
  const live = () => { let n = 0; for (const u of G.units) if (u.alive && !u.fleeing && !u.woundOut) n++; return n; };
  sfx('volley', 0.9);
  rt.army.play?.('volley', DIKE, 1.1);
  rt.say('見張り', '川下の堤の陰から撃って来る！　竹束の横を狙われておるぞ！', 4);
  rt.after(5, () => rt.say('堀秀政', '堤の鉄砲陣を取れ！　横から回って、玉込めの間に寄せよ！', 4));
  rt.obj('main', '川下の堤の陰の鉄砲陣を、堀の先手と取れ', 'main', true);
  rt.objProgress('main', '');
  rt.marker('tsutsumi', () => (live() ? G.center() : null), '堤の鉄砲陣', { red: true, group: G });
  for (const g of [F.hori, ...(F.escorts || [])].slice(0, 2)) if (g && !g.routed && g.count) {
    moveGroup(g, { x: DIKE.x + 8, z: DIKE.z - 10 }, Math.PI);
    g.onArrive = (q) => { q.order = 'attack'; q.aggro = 26; q.seekRange = 30; };
  }

  return {
    update(dt) {
      if (done || F.ending || rt.over) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      const el = rt.t - t0;
      // 堤を取った後、雑賀が舟で取り返しに来る（約三十秒後）。取り返しを払えば済む
      if (!live() && !takenT) {
        takenT = rt.t;
        fire = rt.world.addFire?.(DIKE.x - 3, DIKE.z + 2, { size: 1.6, blackSmoke: true });
        rt.say('堀秀政', '堤の陣は取った！　小屋を焼け。川から取り返しに来るぞ、構えよ！', 4);
        rt.after(18, () => {
          if (done) return;
          R = enemyGroup(rt, { faction: 'saika', name: '堤を取り返す雑賀衆', anchor: { x: -34, z: DIKE.z + 8 }, facing: Math.PI / 2, width: 6, order: 'hold', aggro: 26, seekRange: 34, morale: 85, fleeDir: { x: -1, z: 0 } },
            dress([{ type: 'samurai', n: 1, o: { hat: 'jingasa' } }, { type: 'ashigaru', n: 4 }, { type: 'gun', n: 1 }], SAIKA));
          R.fixed = false; R.order = 'move'; R.dest = { x: DIKE.x, z: DIKE.z }; R.onArrive = (q) => { q.order = 'attack'; q.aggro = 30; };
          rt.army.play?.('eshout', { x: -30, z: DIKE.z + 8 }, 1.3);
          rt.say('見張り', '川を渡って堤を取り返しに来る！', 3.5);
          rt.marker('tsutsumiR', () => (R && R.units.some((u) => u.alive && !u.fleeing && !u.woundOut) ? R.center() : null), '取り返しに来る雑賀衆', { red: true, group: R });
        });
      }
      const rl = R ? R.units.filter((u) => u.alive && !u.fleeing && !u.woundOut).length : 0;
      const n = live() + rl;
      rt.objProgress('main', n ? `堤の雑賀衆 ${n}人` : '');
      if ((R && !n && el > 100) || el > 200) {
        done = true; F.tsutsumiDone = true;
        rt.unmark('tsutsumi'); rt.unmark('tsutsumiR');
        if (!n) {
          sfx('horagai', 0.6);
          rt.award((t) => t.side.push('川下の堤の雑賀の鉄砲陣を取り、取り返しも払った'), '堤の鉄砲陣を取った');
          rt.say('堀秀政', '堤は守った。……だが、川の向こうはまだ抜けぬ', 4);
        } else {
          rt.say('組頭', '堤の雑賀衆は川を渡って退いた。深追いするな', 3.5);
          G.order = 'move'; G.dest = { x: DIKE.x - 4, z: DIKE.z + 40 }; G.retreatOnly = true; G.onArrive = (q) => { q.order = 'hold'; };
        }
        // 雑賀が退き、川が静まる間（和議の前の二十秒余り）
        rt.after(6, () => { if (!F.ending) { for (const g of F.gunPosts || []) { g.fire = false; g.holdFire = true; for (const u of g.units) u.cd = 1e9; } sfx('kane', 0.4); rt.say('見張り', '向こう岸の鉄砲が止んだ……。柵の旗が下がっていくぞ', 4); } });
        rt.after(13, () => { if (!F.ending) rt.say('堀秀政', '撃ち返すな。何か言うて来るつもりじゃ', 3.5); });
        rt.after(20, () => next());
      }
    },
    fire: () => fire,
  };
}
