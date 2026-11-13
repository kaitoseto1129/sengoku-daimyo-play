// ======================================================================
// 志賀の陣・宇佐山城　中の段「森隊の粘り」（十九日の町口。docs/oda15_plan_1108.md の 11）
// - 両手の寄せ（shiga.midArmy）の後、すぐ三将を討たせず、浅井・朝倉の新手が続けて町口へ寄せる（城外防衛・複数波・森隊が粘る）。
// - 敵の増援が重なり、織田信治が先に討死（湖側）。森隊は町口の後ろへ下がる。
// - 森可成が退き口を守る最後の防衛（姉川で磯野を受けた槍の可成）。その後に本の筋書きの三将の最期（lastStand）と宇佐山城へ退く段。
// ======================================================================
import { sfx } from '../audio.js';

export const MISSION = '森可成の退き口を、町口で最後まで守れ';
// 11/11 テスターの声「寄せ手を防ぐとあっても、敵が来ない」：両手の寄せの後、先の手が崩れてから新手が着くまで九十秒近く敵が近くにいなかった。新手の着く秒を 45/98/175 → 15/55/110 に詰めた（HOLD は同じ）
export const HOLD = 270;    // 両手の寄せから、この秒で可成・青地の最期（本の lastStand）
const NOBU_AT = 130;        // 両手の寄せから、この秒で信治の最期

// ctx：{ enemyGroup, dress, ASA, AZA, town, doomNobu() }
export function install(rt, ctx) {
  const F = rt.flags, t0 = rt.t;
  if (rt.G.lord) return;
  F.shigaHoldUntil = HOLD; F.shigaNehari = { t0 };
  const live = () => F.step === 1.5 && !F.ending && !rt.over;
  const wave = (at, name, look, faction, from, list, line, who) => rt.after(at, () => {
    if (!live()) return;
    const g = ctx.enemyGroup(rt, { faction, name, anchor: from, marchTo: { x: ctx.town.x + (from.x < ctx.town.x ? -8 : 4), z: ctx.town.z - 8 }, facing: 0, order: 'attack', seekRange: 75, aggro: 12, morale: 90, fleeDir: { x: 0, z: -1 } },
      ctx.dress(list, look));
    // 控えが先の攻防で崩れていたら、新手が来た声や鬨を出さない。
    // 同じ隊を復活させず、後の寄せ手と三将の接触を待つ処理へつなぐ。
    if (!g || !g.count || g.routed || g.hidden || g.butai?.captured) return;
    g.fire = true;
    try { sfx('taiko', 0.9); } catch (e) { /* 音が無くても進む */ }
    rt.army.play('eshout', from, 1.5);
    if (speakerAlive(who)) rt.say(who, line, 3.4);
  });
  wave(15, '朝倉の新手', ctx.ASA, 'asakura', { x: 28, z: -56 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 11 }, { type: 'gun', n: 3 }], '朝倉の新手じゃ！　まだ来るぞ、列を崩すな！', '森可成');
  wave(55, '山側の浅井の新手', ctx.AZA, 'azai', { x: -36, z: -20 }, [{ type: 'samurai', n: 2 }, { type: 'cavalry', n: 2 }, { type: 'ashigaru', n: 10 }], '山側からも新手！　浅井の騎馬じゃ！', '青地茂綱');
  wave(110, '朝倉の三の手', ctx.ASA, 'asakura', { x: 18, z: -60 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 3 }], '三の手が来たぞ……敵は尽きぬのか', '足軽');
  const speakerAlive = (who) => who === '森可成' ? !!F.moriU?.alive :
    who === '青地茂綱' ? !!F.aochiU?.alive : true;
  const say = (at, who, line, d = 3.6) => rt.after(at, () => {
    if (live() && speakerAlive(who)) rt.say(who, line, d);
  });
  say(70, '森可成', 'よう粘った！　敵は十倍、だが町口は一つ。一度に来られるのは同じ数じゃ', 4);
  say(128, '使番', '湖側の信治様の手、押されておりまする！', 3.2);
  rt.after(NOBU_AT, () => { if (live()) ctx.doomNobu(); });
  // 信治の討死を見届けてから、森隊は町口の後ろへ下がり、可成が退き口を守る
  const mourn = () => {
    if (!live() || !speakerAlive('森可成')) return;
    if (!F.nobuDead) {
      // 本の doom が新手を寄せ、見える敵との接触を確かめる。時刻だけで討死にしない。
      rt.after(3, mourn); return;
    }
    rt.say('森可成', '信治殿……！　森隊、町口の後ろまで下がれ。退き口だけは渡すな！', 4);
    say(22, '森可成', 'わしはここで退き口を守る。皆を城へ通すまで、一歩も引かぬ', 4.2);
  };
  rt.after(NOBU_AT + 8, () => mourn());
  say(HOLD - 12, '青地茂綱', '森殿、浅井の本隊が山を下りて来る！', 3.2);
  // 可成・青地も lastStand の doom に任せ、敵のいない所では倒さない。
}
// 右上の一行：信治が討たれた後は「可成の退き口を守れ」
export function late(rt) { const F = rt.flags; return !!F.shigaNehari && F.step === 1.5 && !!F.nobuDead; }
