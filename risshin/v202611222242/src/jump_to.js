// K374（mini の実機の全戦の流しを速くする）：?sen=<戦の id>&t=<秒> で開くと、戦が始まってから t 秒の所まで早送りし、そこで手を返す。
//   早送りの間は自動の遊び手（playbot の brain）が本人を動かす（撮る道具 look_multi_cloud の advance と同じ回し方）。
//   刻みは普段の細かさ（0.05 秒）のまま回す数だけ増やし、当たりのすり抜けを起こさない。早送りの間は本人を倒さない（命が45を切ったら80へ）。
//   ?sen が無い時・t が無い時は読まれない（普通の遊びには関係しない）。
import { Battle } from './battle.js';
import { brain } from './playbot.js';

const mkInp = () => ({ dx: 0, dy: 0, wheel: 0, leftPressed: false, rightPressed: false, axis: null, lockPressed: false, quickCmd: null, runHeld: false,
  k: new Set(), e: new Set(), left: false, right: false, key(c) { return this.k.has(c); }, pressed(c) { return this.e.has(c); } });

export function run(game, sec) {
  if (!(sec > 0)) return;
  const P = Battle.prototype;
  // 早送りの間は、毎コマの普段の update を止める（二重に進めない）
  if (!P.__jumpLp) { const up = P.update; P.update = function (...a) { if (window.__jStep || !window.__jHold) return up.apply(this, a); }; P.__jumpLp = 1; }
  const wait = setInterval(() => {
    const b = game.battle;
    if (!b || !b.player || !b.player.u || b.ended) return;
    clearInterval(wait);
    go(b);
  }, 300);
  async function go(b) {
    window.__jHold = 1; window.__jumpTo = { want: sec, done: false };
    const inp = mkInp(); let n = 0;
    try {
      while (b.t < sec && !b.ended && b.player && b.player.u) {
        inp.e.clear(); inp.leftPressed = false; window.__jStep = 1;
        try { brain(b, inp); b.update(0.05, inp); } finally { window.__jStep = 0; }
        const u = b.player.u; if (u.alive && u.hp < 45) u.hp = 80;
        if (++n % 120 === 0) await new Promise((r) => setTimeout(r, 0));   // 六秒ぶん回したら一度絵を描かせる
      }
    } catch (e) { window.__jumpErr = String((e && e.stack) || e); } finally { window.__jHold = 0; window.__jumpTo.done = true; window.__jumpTo.at = Math.round(b.t || 0); }
  }
}
