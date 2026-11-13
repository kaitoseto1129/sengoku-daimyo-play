// ======================================================================
// 雑賀攻め・小雑賀川　対陣の中の段「川下の堤の鉄砲陣」（約10〜12分。b_saika.js の hold の後、parley の前に入れる）
// 史実：川を挟む対陣は半月に及び、雑賀衆は夜ごとに小勢で渡っては鉄砲を撃ち掛けた（信長公記巻十の対陣の記事を、遊びの局地に縮めた補完）。
// 遊び：川上・川下の寄せを払った後、川下の堤の陰に雑賀の鉄砲衆が入り込み、竹束の列の横から撃ち掛ける。
//   堀の先手と堤へ寄せ、鉄砲陣を取る。取ると堤の小屋に火を掛けて潰す。本人が堤へ寄り、取り返しも払ってから和議（parley）へ。
// 字は出さない：堤の上の硝煙・赤い印・燃える小屋で分からせる。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

// 本筋の残兵判定とそろえ、倒れた者・後送された者・敗走した組を追わせない。
const ready = (u) => u.alive && !u.gone && !u.dying && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed && !u.group?.routed;

const DIKE = { x: -4, z: 58 };   // 川下の堤の陰（東岸）

export function install(rt, ctx) {
  const F = rt.flags;
  const { dress, SAIKA, moveGroup, next, missionText } = ctx;
  let done = false, tick = 0, fire = null, R = null, takenT = 0, raidAt = 0;
  const startedAt = rt.t;
  rt.setPhase('tsutsumi');
  const G = enemyGroup(rt, { faction: 'saika', fixed: true, name: '川下の堤の雑賀鉄砲衆', anchor: DIKE, facing: 0, width: 10, order: 'hold', guard: true, guardLeash: 6, aggro: 22, seekRange: 40, morale: 85, fleeDir: { x: -1, z: 0.3 } },
    dress([{ type: 'samurai', n: 1, o: { hat: 'jingasa' } }, { type: 'gun', n: 5 }, { type: 'ashigaru', n: 4 }], SAIKA));
  G.fixed = false;
  F.tsutsumiG = G;
  F.tsutsumiAt = DIKE;
  const live = () => { let n = 0; if (!G.tsRouted) for (const u of G.units) if (ready(u)) n++; return n; };
  // 抜いていない杭を横切らず、川下の浅瀬から西岸へ退く。
  const withdraw = (g) => {
    const c = g.center();
    g.tsRouted = true; g.noRout = true; g.focus = null; g.retreatOnly = true;
    g.pending = null; g._gather = false;
    g.holdFire = true; g.fire = false; g.fixed = false;
    g.order = 'path'; g.formation = 'column'; g.colW = 2;
    // 先頭だけ浅瀬を回すと後列が杭へ斜めに戻る。出発点から全列を道へ沿わせる。
    g.anchor.x = c.x; g.anchor.z = c.z;
    g.roadColumn = true; g.followColumnRoad = true;
    // 高岸の急斜面へ登り直さず、杭列の西の法尻を川下へ抜ける。
    g.path = [[c.x, c.z], [-8, 76], [-28, 76], [-32, DIKE.z + 36]]; g.pathIdx = 0;
    g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI / 2; };
  };
  sfx('volley', 0.9);
  rt.army.play?.('volley', DIKE, 1.1);
  rt.say('見張り', '川下の堤の陰から撃って来る！　竹束の横を狙われておるぞ！', 4);
  rt.after(5, () => rt.say('堀秀政', '堤の鉄砲陣を取れ！　横から回って、玉込めの間に寄せよ！', 4));
  rt.obj('main', missionText, 'main', true);
  rt.objProgress('main', '');
  rt.marker('tsutsumi', () => (live() ? G.center() : DIKE), '堤の鉄砲陣', { red: true, group: G });
  let sent = 0;
  const assaultOrders = [];
  for (const g of new Set([F.hori, ...(F.escorts || [])])) if (g && !g.routed && g.count) {
    // 二組を一点へ重ねず、堤の東側から間を空けて寄せる。
    // 堤を取る下知の間は、射手の盾になる判断で竹束の前へ戻らせない。
    // 兵ごとの移動と応戦は続け、堤を守り終えたら元の判断へ戻す。
    assaultOrders.push({ g, noAI: g.noAI, guard: g.guard });
    g.noAI = true; g.guard = false; g.guardOn = false;
    moveGroup(g, { x: DIKE.x + 8 + sent * 6, z: DIKE.z - 10 - sent * 8 }, Math.PI);
    g.onArrive = (q) => { q.order = 'attack'; q.retreatOnly = false; q.guard = false; q.aggro = 26; q.seekRange = 30; };
    if (++sent >= 2) break;
  }

  return {
    update(dt) {
      if (done || F.ending || rt.over) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      // 八割を失った守り手や、三分攻め続けた隊は退く。残る一人の全滅待ちにしない。
      const defenders = live();
      if (!G.tsRouted && defenders && (defenders <= Math.floor(G.units.length * .2) || rt.t - startedAt >= 180)) {
        withdraw(G);
        rt.say('見張り', '堤の鉄砲衆が引くぞ。堤へ寄せて守りを固めよ！', 4);
      }
      // 堤を取った後、雑賀が川下の浅瀬から取り返しに来る。取り返しを払えば済む
      // 味方だけで敵を払っても、本人が堤へ着くまでは占拠・放火を進めない。
      // 守り手が退いたら敵隊の印を外し、本人が着くまで堤そのものを案内する。
      if (!live() && !F.tsutsumiPlaceMarked) {
        F.tsutsumiPlaceMarked = true;
        rt.marker('tsutsumi', DIKE, '川下の堤', { h: 3 });
        // 守り手が射程の外へ退くと、攻め手は手前の集合地点で止まってしまう。
        // 堤の東へ列を進め、杭列を越えずに川下からの取り返しを迎える。
        for (let i = 0; i < assaultOrders.length; i++) {
          const g = assaultOrders[i].g;
          if (g.routed || !g.count) continue;
          moveGroup(g, { x: DIKE.x + 8 + i * 6, z: DIKE.z }, 0);
          g.onArrive = (q) => {
            q.order = 'hold'; q.retreatOnly = false; q.facing = 0;
            q.formation = 'yari'; q.aggro = 18;
          };
        }
      }
      if (!live() && !takenT && Math.hypot(rt.player.u.pos.x - DIKE.x, rt.player.u.pos.z - DIKE.z) < 12) {
        takenT = rt.t;
        // 敵が尽きても堤の行き先を残す。取り返しを払った後もここへ戻れる。
        rt.marker('tsutsumi', DIKE, '川下の堤', { h: 3 });
        fire = rt.world.addFire?.(DIKE.x - 3, DIKE.z + 2, { size: 1.6, blackSmoke: true });
        rt.say('堀秀政', '堤の陣は取った！　小屋を焼け。川から取り返しに来るぞ、構えよ！', 4);
        rt.after(18, () => {
          if (done || F.ending || rt.over) return;
          R = enemyGroup(rt, { faction: 'saika', noAI: true, noHunt: true, noFrontline: true, name: '堤を取り返す雑賀衆', anchor: { x: -32, z: DIKE.z + 8 }, facing: 0, formation: 'column', colW: 2, width: 2, order: 'hold', aggro: 26, seekRange: 34, morale: 85, fleeDir: { x: -1, z: 0 } },
            dress([{ type: 'samurai', n: 1, o: { hat: 'jingasa' } }, { type: 'ashigaru', n: 4 }, { type: 'gun', n: 1 }], SAIKA));
          raidAt = rt.t;
          // 堤の正面には抜いていない杭列が七十歩まで続く。端を回って東岸へ寄せる。
          const c = R.center();
          R.fixed = false; R.order = 'path'; R.formation = 'column'; R.colW = 2;
          R.anchor.x = c.x; R.anchor.z = c.z;
          R.roadColumn = true; R.followColumnRoad = true;
          R.path = [[c.x, c.z], [-28, 76], [-8, 76], [DIKE.x, DIKE.z]]; R.pathIdx = 0;
          R.onArrive = (q) => { q.order = 'attack'; q.aggro = 30; q.formation = 'yari'; };
          rt.army.play?.('eshout', { x: -30, z: DIKE.z + 8 }, 1.3);
          rt.say('見張り', '川を渡って堤を取り返しに来る！', 3.5);
          rt.marker('tsutsumiR', () => (R && R.units.some((u) => ready(u)) ? R.center() : null), '取り返しに来る雑賀衆', { red: true, group: R });
        });
      }
      // 堤へ届いた主力は攻めに移る。川の中の後尾一人の到着を待たない。
      if (R && !R.routed && !R.tsRouted && R.order === 'path' && R.pathIdx >= 3 && R.onArrive) {
        const c = R.center();
        if (Math.hypot(c.x - DIKE.x, c.z - DIKE.z) < 12) {
          const arrive = R.onArrive; R.onArrive = null; arrive(R);
        }
      }
      let rl = 0;
      if (R) for (const u of R.units) if (ready(u)) rl++;
      // 取り返しの手は半ばを失うか三分経てば浅瀬へ退く。川の中の鉄砲一人を待ち続けない。
      if (R && !R.tsRouted && rl && (rl <= Math.ceil(R.units.length / 2) || rt.t - raidAt >= 180)) {
        // 残兵を数から外すだけでは退かない。来た浅瀬へ戻し、残る杭列を横切らせない。
        withdraw(R);
        rt.say('見張り', '取り返しの手が引くぞ！　川下の浅瀬へ退いていく！', 3);
      }
      // 渡河中の取り返しも数える。遠いだけで「払った」とせず、討つか退くまで続ける。
      // 半数を失って退く下知が出た組は、川の中の残兵を追わせない。
      const n = live() + (R?.tsRouted ? 0 : rl);
      // 払った組の印を残して、川の中や退く残兵へ追わせない。
      if (R && !R.tsMarkerCleared && (R.tsRouted || !rl)) {
        R.tsMarkerCleared = true; rt.unmark('tsutsumiR');
      }
      rt.objProgress('main', `堤の雑賀衆 ${G.units.length + (R?.units.length || 0)}人中 残り${n}人`);
      const p = rt.player.u.pos;
      if (R && !n && Math.hypot(p.x - DIKE.x, p.z - DIKE.z) < 12) {
        done = true; F.tsutsumiDone = true;
        for (const order of assaultOrders) { order.g.noAI = order.noAI; order.g.guard = order.guard; }
        rt.unmark('tsutsumi'); rt.unmark('tsutsumiR');
        sfx('horagai', 0.6);
        rt.award((t) => t.side.push('川下の堤の雑賀の鉄砲陣を取り、取り返しも払った'), '堤の鉄砲陣を取った');
        rt.say('堀秀政', '堤は守った。……だが、川の向こうはまだ抜けぬ', 4);
        // 雑賀が退き、川が静まる間（和議の前の二十秒余り）
        rt.after(6, () => { if (!F.ending) { F.bankCeasefire = true; for (const g of rt.army.groups) { g.fire = false; g.holdFire = true; for (const u of g.units) u.cd = 1e9; } sfx('kane', 0.4); rt.say('見張り', '向こう岸の鉄砲が止んだ……。こちらも撃つな', 4); } });
        rt.after(13, () => { if (!F.ending) rt.say('堀秀政', '撃ち返すな。何か言うて来るつもりじゃ', 3.5); });
        rt.after(20, () => { if (!F.ending && !rt.over) next(); });
      }
    },
    fire: () => fire,
  };
}
