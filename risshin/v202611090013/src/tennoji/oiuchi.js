// ======================================================================
// 天王寺の戦い　追撃の段の道中（12〜14分。b_tennoji.js の chase から入れる）
// 史実：再攻撃で崩れた本願寺勢を、信長は大坂の城戸口まで追い、二千七百余を討った（信長公記巻九）。砦から石山まで約二・五キロ。
// 遊び：二キロ余りを歩かせるだけにしない。道中で、①燃える在家と逃げる門徒の列 ②道を塞ぐ殿の門徒 を見せ、
//   殿を払うか約百秒で、走り抜けた形に一度だけ暗くして城戸口の手前（約百四十歩）へ移す（味方の隊も一緒に）。
// 字は出さない：煙・赤い印の殿・暗転で分からせる。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

function curtain(on, sec = 0.6) {
  if (typeof document === 'undefined') return null;
  let d = document.getElementById('tn-curtain');
  if (!d) {
    d = document.createElement('div');
    d.id = 'tn-curtain';
    d.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:40;transition:opacity ' + sec + 's linear';
    document.body.appendChild(d);
  }
  d.style.opacity = on ? '1' : '0';
  if (!on) setTimeout(() => { if (d.style.opacity === '0') d.remove(); }, sec * 1000 + 200);
  return d;
}

export function install(rt, ctx) {
  const F = rt.flags;
  const { march, spent, dress, IKKO, KIDO } = ctx;
  const t0 = rt.t, W = rt.world;
  let tail = null, cut = false, tick = 0;
  // ① 道の脇の在家が燃える（石山へ退く門徒が火を掛けた。煙の柱を三つだけ）
  rt.after(10, () => {
    if (F.ending || rt.over) return;
    const p = rt.player.u.pos;
    F.oiSmoke = [[-40, -160], [55, -230], [-25, -300]].map(([dx, dz], i) => W.addSmokeColumn?.(p.x + dx, W.heightAt(p.x + dx, p.z + dz) + 5, p.z + dz, { size: 3 - i * 0.5, black: true }));
    rt.say('足軽', '在家に火を掛けて退いていくぞ！　煙に紛れて逃がすな！', 3.5);
  });
  // ② 道を塞ぐ殿の門徒（自分の前、約九十歩）
  rt.after(24, () => {
    if (F.ending || rt.over || cut) return;
    const p = rt.player.u.pos, z = p.z - 90, x = p.x * 0.5;
    tail = enemyGroup(rt, { name: '道を塞ぐ殿の門徒', anchor: { x, z }, facing: 0, width: 10, order: 'hold', guard: true, guardLeash: 8, aggro: 26, seekRange: 34, morale: 80, faction: 'honganji', fleeDir: { x: 0, z: -1 } },
      dress([{ type: 'samurai', n: 1, o: { hat: 'kabuto_m' } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }], IKKO));
    F.oiTail = tail;
    rt.army.play?.('eshout', { x, z }, 1.3);
    sfx('gun', 0.6);
    rt.say('組頭', '殿の門徒が道を塞いだ！　鉄砲の後ろへ回り、味方と払え！', 4);
    rt.marker('oiTail', () => (spent(tail) ? null : tail.center()), '道を塞ぐ殿', { red: true, group: tail });
  });

  const jump = () => {
    if (cut) return;
    cut = true;
    rt.unmark('oiTail');
    curtain(true);
    rt.after(0.7, () => {
      if (F.ending || rt.over) { curtain(false); return; }
      const P = rt.player, at = { x: F.kz.x, z: F.kz.z + 140 };
      const put = (u, x, z) => { u.pos.x = x; u.pos.z = z; u.pos.y = W.heightAt(x, z); u.target = null; u.moveTo = null; if (u.vel) { u.vel.x = 0; u.vel.z = 0; } };
      put(P.u, at.x, at.z);
      if (P.vel) { P.vel.x = 0; P.vel.z = 0; }
      P.lock = null; P.heading = Math.PI;
      // 味方の隊も後ろへ（追撃の列のまま）。隊ごとに道の幅へ並べ、城戸口の前へ進ませる
      let k = 0;
      for (const [q, ox] of [[F.nobu, 0], [F.saku, -12], [F.taki, 12], [F.ake, 6], [F.honjin?.guard, -6]]) {
        if (!q || spent(q)) continue;
        let i = 0;
        for (const u of q.units) if (u.alive && !u.fleeing && !u.woundOut) { put(u, at.x + ox + (i % 4) * 1.4 - 2, at.z + 10 + k * 7 + Math.floor(i / 4) * 1.5); i++; }
        q.anchor = { x: at.x + ox, z: at.z + 12 + k * 7 };
        march(q, [[KIDO.x + ox, KIDO.z + 26]], 'hold', Math.PI, 4); q.aggro = 24;
        k++;
      }
      let j = 0;
      for (const g of rt.squadGroups || []) if (g?.units) for (const u of g.units) if (u.alive && !u.isPlayer) { put(u, at.x - 3 + (j % 5) * 1.5, at.z + 3 + Math.floor(j / 5) * 1.5); j++; }
      // 道中に残った自分の側の殿は軽くして（数に入れない）消えるに任せる
      if (tail && !spent(tail)) for (const u of tail.units) if (u.alive) { u.fleeing = true; u.moraleFleeDir = { x: 0, z: -1 }; }
      rt.after(0.3, () => curtain(false));
      rt.after(1.5, () => { if (!F.ending) rt.say('織田信長', '城戸口が見えたぞ！　殿を払え。木戸の内へは入るな！', 4); });
      sfx('horagai', 0.7);
    });
  };

  return {
    update(dt) {
      if (F.ending || rt.over || F.step !== 4) return;
      if ((tick -= dt) > 0) return;
      tick = 0.5;
      // 城戸口：殿が粘って長引く時は、約九十秒で殿が木戸の内へ逃げ込む（時間で敵を固くしない・待たせない）
      if (F.kidoCut) {
        F.oiKidoT = F.oiKidoT || rt.t;
        if (rt.t - F.oiKidoT > 90 && !F.oiKidoFlee) {
          F.oiKidoFlee = true; F.kidoHelp = true;
          for (const g of F.kidoG || []) if (!g.kidoRetreat) {
            g.kidoRetreat = true; g.noRout = false; g.guard = false; g.aggro = 0; g.seekRange = 0; g.fire = false;
            march(g, [[g.anchor.x, KIDO.z - 26]], 'hold', 0, 4);
          }
          rt.say('足軽', '殿が木戸の内へ逃げ込むぞ！　木戸の手前で止まれ！', 3.5);
        }
      }
      if (cut) return;
      const el = rt.t - t0, p = rt.player.u.pos;
      const left = Math.hypot(p.x - F.kz.x, p.z - F.kz.z);
      if (left < 260 || F.kidoCut) { cut = true; rt.unmark('oiTail'); return; }   // 自分で歩いて着いた
      const tailDone = tail && spent(tail);
      if (tailDone && !F.oiTailSaid) {
        F.oiTailSaid = true;
        rt.award((t) => t.side.push('追撃の道を塞いだ殿の門徒を払った'), '道を塞いだ殿を払った');
        rt.say('足軽', '殿が崩れた！　城戸口まで駆けろ！', 3);
      }
      if ((tailDone && el > 70) || el > 120) jump();
    },
  };
}
