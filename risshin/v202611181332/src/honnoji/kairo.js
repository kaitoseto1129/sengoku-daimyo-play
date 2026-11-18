// ======================================================================
// 本能寺の変　火の回る回廊（8〜11分・docs/oda15_plan_1108.md 32「寺内・廊下・中庭を移動しながら戦う／火災拡大・退路減少・明智軍増加」）
// 本堂の守りの後、上様と奥へ退く前に：中庭の回廊で明智勢を食い止める → 本堂に火が回り、回廊にも火が移る（退く道が細る）→
// 渡り廊下の口で新手を受け、御殿へ駆け込む。終わると元の「上様と奥へ退く」段（p6）へ。
// 入れ方：b_honnoji.js で wrap(honnoji, K) を一度。def.p6 を包む。
// ======================================================================
import { k15Freeze, k15Heal, k15Off, k15Go, k15Rout, k15Scenes, k15Track } from '../oda15_kit.js';
import { PT } from '../honno_tera.js';
import { sfx } from '../audio.js';

export function wrap(def, K) {
  const p6 = def.p6;
  def.p6 = function (r) {
    const F = r.flags;
    if (F.ending || r.over || !r.player.u.alive) return;
    if (k15Off(r) || F.kairoDone || (F.hp || 0) >= 6) return p6.call(this, r);
    if (F.k15stage === 'kairo') return;
    start(r, K, () => { k15Heal(r); F.kairoDone = true; F.k15on = false; F.k15stage = null; p6.call(this, r); });
  };
}

function start(rt, K, done) {
  const F = rt.flags, W = rt.world;
  F.k15stage = 'kairo'; F.k15on = true;
  k15Freeze(rt, 'kairo');   // 前の段の時計を止める
  // 11/18 クラウドし act bot：本堂の段で残った『本堂へ踏み込む侍』（侍三・一太刀1.1倍・本人狙い）が中庭まで付いて来て、
  //   回廊の口の手前 (-41,66) で侍の傷169を受けて倒れた（448秒）。本堂の段の侍は、火が回ったら東の門へ退く（次の段へ持ち越さない）。
  if (F.stand?.honnoStand === 2 && F.stand.units.some((u) => u.alive)) k15Rout(rt, F.stand, { x: -5, z: 46 });
  //   次の回は、本堂の段の『縁へ寄せる・なだれ込む・脇門の明智勢』が上様と退く段まで付いて来て、足軽の傷282で倒れた（747秒）。
  //   本堂の周り（二十五歩の内）で斬り合っていた本堂の段の組は、まとめて退かせる。回廊の段の寄せ手は下で新たに入る。
  for (const g of F.foes || []) {
    if (g === F.stand || g.gate?.alive || g.routed || (g.order !== 'attack' && g.order !== 'path') || !g.units.some((u) => u.alive)) continue;
    const c = g.center();
    // 11/18 持ち主 クラウド（act bot 0718：570秒 御殿の奥 (-71,87) で倒れた）：本堂の段の名の組が本人を追って本堂から二十五歩より外に居ると退かず、
    //   回廊・渡り・御殿まで付いて来て上様と退く段で囲んだ。本堂の段で入れた組は、居る所に関わらず退かせる
    if (Math.hypot(c.x + 50, c.z - 46) < 25 || /^(上様を狙う明智の侍|脇門の明智勢|裏手から来る明智勢|なだれ込む明智勢|宿坊から回る明智勢)$/.test(g.name || '')) k15Rout(rt, g, { x: -5, z: c.z });
  }
  const stop = () => F.k15stage !== 'kairo' || F.ending || !rt.player.u.alive;
  // 11/18 cloud-06（kaito「少し軽く」・act bot 0/3 で三回とも段5 の中庭の回廊・渡り廊下で囲まれ倒れ、段5 が四〜十分続いた）：
  //   守る長さを 60→40秒・70→45秒に詰める（寄せ手の数と一太刀の重さは変えない。指示書の本能寺8〜9分にも合わせる）
  // 11/18 クラウド（本能寺の持ち主・長さ）：act bot 967秒のうち回廊の段が200秒（歩く二つが上限40秒に当たり・守る40＋45秒）。
  //   守る長さ 40→30・45→30秒、歩く上限 40→25・戻る上限 30→20秒に詰める（寄せ手の数と重さは変えない）
  // 11/18 17:20 持ち主 クラウド（act bot 1710：872秒のうち回廊の段が百十秒）：守る長さ 30→22秒（数と重さはそのまま）
  const niwa = PT.niwa, watari = { x: -66, z: 72 };
  // 11/18 K358：本堂の内（西の奥）から回廊の口・渡り廊下へ真っすぐ向かうと本堂の壁に阻まれ、act bot が堂の内で命一桁のまま斬られ続けた。
  //   堂の内にいる間は東の戸の外（縁の下）を先に示し、出てから回廊の口へ（着いた判定は元の行き先のまま）
  const viaDoor = (to) => () => { const p = rt.player.u.pos; return p.x < -46.5 && p.z > 36 && p.z < 56 ? { x: -43.5, z: 47 } : to; };
  { const u = rt.player.u; if (u.alive && u.hp < u.maxHp * 0.5) u.hp = u.maxHp * 0.5; }   // 11/18 司令塔の決め (a)：段の替わり（本堂→回廊）でも命を半ばまで
  rt.banner('中庭の回廊', '上様が奥へ移られる前に、回廊の口の追手を払え');
  k15Go(rt, 'kr-niwa', niwa, 5, '中庭の回廊の口を守れ', '回廊の口', () => {
    const w1 = K.akechi(rt, '中庭へ入った明智勢', [[niwa.x + 12, niwa.z - 10], [niwa.x + 2, niwa.z]], [K.uS(1), K.uA(4)], { entered: true, player: true, dmg: 0.5 });
    K.say(rt, '小姓', '中庭に明智勢じゃ！', 3);
    k15Track(rt, w1, '中庭の明智勢', { sec: 22, reward: '中庭の回廊の口を守った' }, () => k15Scenes(rt, [
      [1, () => {
        rt.banner('本堂に火が回る', '回廊の屋根にも火が移った。退く道が細る');
        sfx('crash', 0.5);
        for (const [x, z] of [[-46, 58], [-45, 70], [-52, 77]]) { try { W.addFire(x, z, { size: 1.8, h: 2.4, blackSmoke: true }); } catch (e) { /* 火を置けない所でも続ける */ } }
      }],
      [3, () => K.say(rt, '森蘭丸', '火が回る！　渡り廊下から御殿へ！', 3.5)],
    ], () => k15Go(rt, 'kr-watari', watari, 5, '渡り廊下の口へ走れ', '渡り廊下', () => {
      { const u = rt.player.u; if (u.alive && u.hp < u.maxHp * 0.5) u.hp = u.maxHp * 0.5; }   // 中庭→渡り廊下の替わりでも半ばまで
      const w2 = K.akechi(rt, '回廊を回り込む明智勢', [[watari.x + 10, watari.z - 6], [watari.x + 1, watari.z]], [K.uS(2), K.uA(3)], { entered: true, player: true, dmg: 0.5 });
      K.say(rt, '小姓', '回り込まれた！　ここで食い止めよ！', 3);
      k15Track(rt, w2, '回り込む明智勢', { sec: 22, reward: '渡り廊下の口で明智勢を食い止めた' }, () => k15Scenes(rt, [
        [1, () => K.say(rt, '森蘭丸', '寄せ手は増えるばかりじゃ。上様をお連れして御殿の奥へ！', 3.5)],
      ], () => k15Go(rt, 'kr-back', { x: -50, z: 56 }, 8, '本堂の上様のもとへ戻れ', '本堂の口', done, { limit: 20 }), stop));
    }, { limit: 25, guide: viaDoor(watari) }), stop));
  }, { limit: 25, guide: viaDoor(niwa) });
}
