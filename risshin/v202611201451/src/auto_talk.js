// P8 自動の会話の部品（K419・K400・K388）：名のある味方の武将のそばへ行くと台詞が自動で進む。
//   使い方：registerAutoTalk(rt, { key, who:'長宗我部元親'（味方の名 or {x,z}）, radius:3.5, timeout:null（戦の秒・来なくても始める）,
//            minT:0, lines:[[話し手, 台詞, 前の台詞からの間(秒), 見せる秒, 'taiko'（鳴らす合図・省略可）], ...], face:true, onDone })
//   say：話す関数を替える時（本能寺は聞こえる所だけ話す honnoSay）。一度だけ。同時に流れるのは一つ。話は rt.say（頭上の吹き出し・字幕）。太鼓の合図（K400）は行ごとに一回だけ。
import { sfx } from './audio.js';

const pos2 = (rt, who) => {
  if (who && typeof who.x === 'number') return who;
  const list = rt.army?.units || [];
  for (const u of list) if (u.alive && u.team === 0 && u.name && (u.name === who || u.name.endsWith(who))) return u;
  return null;
};

// K400 戦ごとの登録表（戦の前の話のある戦）：key は戦の id。名のある味方のそばへ行くと吹き出し（＋太鼓）が一度だけ
//   本能寺（b_honnoji.js）は自前の段で honnoK419 から playAutoTalk を呼ぶので、ここには入れない
export const AUTO_TALKS = {
  t06_hetsugi: [{ key: 'k400_motochika', who: '長宗我部元親', radius: 7, minT: 25, lines: [['長宗我部元親', '信親を守れ！　先手を支えよ！', 0, 2.8, 'taiko']] }],
  t03_komaki: [{ key: 'k400_ikeda', who: '池田恒興', radius: 7, minT: 25, lines: [['池田恒興', '中入りぞ！　遅れるな、続け！', 0, 2.6, 'taiko']] }],
};

export function playAutoTalk(rt, spec, guard = () => true) {
  const F = rt.flags, A = F.autoTalk || (F.autoTalk = { list: [], running: false });
  if (A.running) return false;
  A.running = true;
  const nb = typeof spec.who === 'string' ? pos2(rt, spec.who) : null;
  if (spec.face !== false && nb && nb.pos && rt.player?.u) { const q = rt.player.u.pos; nb.heading = nb.facing = Math.atan2(q.x - nb.pos.x, q.z - nb.pos.z); }
  let at = 0.2;
  const last = spec.lines.length - 1;
  spec.lines.forEach(([sp, text, gap, dur, cue], i) => {
    if (i) at += gap ?? 2.8;
    rt.after(at, () => {
      if (rt.over || !guard()) { A.running = false; return; }
      if (cue) { try { sfx(cue, 0.9); } catch (e) { /* 音が無くても進む */ } }
      (spec.say || ((a, b, c) => rt.say(a, b, c)))(sp, text, dur ?? 2.5);
      if (i === last) rt.after((dur ?? 2.5) + 0.3, () => { A.running = false; if (spec.onDone) spec.onDone(); });
    });
  });
  return true;
}

export function registerAutoTalk(rt, spec) {
  const A = rt.flags.autoTalk || (rt.flags.autoTalk = { list: [], running: false });
  if (!A.list.some((s) => s.key === spec.key)) A.list.push({ ...spec, done: false });
}

// 毎コマ（battle.js の場面の所から）：着いたか、時が来たら始める
export function autoTalkTick(rt) {
  const id = rt.def?.id;
  if (id && AUTO_TALKS[id] && !rt.flags.autoTalkReg) { rt.flags.autoTalkReg = 1; for (const sp of AUTO_TALKS[id]) registerAutoTalk(rt, sp); }
  const A = rt.flags.autoTalk;
  if (!A || !A.list.length || A.running || rt.over || !rt.player?.u?.alive) return;
  const p = rt.player.u.pos;
  for (const s of A.list) {
    if (s.done || rt.t < (s.minT || 0)) continue;
    const u = pos2(rt, s.who);
    const near = u && Math.hypot(p.x - (u.pos?.x ?? u.x), p.z - (u.pos?.z ?? u.z)) <= (s.radius ?? 3.5);
    if (near || (s.timeout != null && rt.t >= s.timeout)) { s.done = true; playAutoTalk(rt, s); return; }
  }
}
