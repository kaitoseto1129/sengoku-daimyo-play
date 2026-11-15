// ======================================================================
// 殿のお通り（K308 要件39）：序盤（足軽のうち）は信長に話しかけられない。清洲の表の通りを、信長が馬で通り、
//   供の侍と旗が続く。町の人と兵は脇へ寄って頭を下げ、主人公は見るだけ（話す札は出さない）。
//   一度の城下で一回。城の方（北）から町の門（南）へ抜けて消える。
// ======================================================================
import { allyGroup } from './bhelp.js';

export function processionSetup(rt, { castleZ, gateZ, kiyosu }) {
  if (!kiyosu || (rt.G.rank || 0) >= 3 || rt.G.lord) return null;
  return (rt.flags.oTori = { at: 24 + Math.random() * 10, castleZ, gateZ, g: null, done: false, said: 0 });
}

export function processionTick(rt, dt) {
  const O = rt.flags.oTori;
  if (!O || O.done) return;
  if (!O.g) {
    if (rt.t < O.at || rt.choice) return;
    const z0 = O.castleZ - 8;
    const guard = rt.army.spawnGuard; rt.army.spawnGuard = null;   // 見える所にも出す（お通りの場面）
    try {
      O.g = allyGroup(rt, { name: '殿のお通り', anchor: { x: 0, z: z0 }, facing: Math.PI, order: 'move', dest: { x: 0, z: O.gateZ - 12 }, noRout: true, width: 2, speed: 1.15, march: true, aggro: 0, seekRange: 0, fixed: true },
        [{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true, flag: 'eiraku', horse: true, haori: 0x7a1d14 } },
          { type: 'samurai', n: 4, o: { invuln: true, flag: 'eiraku' } }]);
    } finally { rt.army.spawnGuard = guard; }
    for (const u of O.g.units) u.noTarget = true;
    rt.bark('殿のお通りじゃ！　道を開けい', true);
    return;
  }
  const lead = O.g.units.find((u) => u.alive);
  if (!lead) { O.done = true; return; }
  const p = rt.player.u.pos;
  const d = Math.hypot(p.x - lead.pos.x, p.z - lead.pos.z);
  // 通りの近くの町の人（town_crowd の本物の形）は足を止め、殿の方を向いて深く頭を下げる。過ぎれば元へ
  const C = rt.flags.crowd;
  for (const P of (C && C.pool) || []) {
    const u = P.u;
    if (!u || !P.ag) continue;
    const near = Math.abs(lead.pos.z - u.pos.z) < 10 && Math.abs(u.pos.x - lead.pos.x) < 9;
    if (near) {
      P.talkT = Math.max(P.talkT || 0, 0.5); P.g.order = 'hold'; P.g.dest = null;
      u.heading = Math.atan2(lead.pos.x - u.pos.x, lead.pos.z - u.pos.z); P.g.facing = u.heading;
      if (u.body) u.body.rotation.x = 0.55; if (u.head) u.head.rotation.x = 0.3;
      P._otBow = true;
    } else if (P._otBow) { P._otBow = false; if (u.body) u.body.rotation.x = 0; if (u.head) u.head.rotation.x = 0; }
  }
  if (d < 16 && O.said < 2 && rt.t > (O.sayAt || 0)) {
    O.sayAt = rt.t + 6;
    rt.say(O.said++ ? '町の人' : '組の者', O.said === 1 ? '頭を下げよ。上総介様じゃ……。わしらが口をきける御方ではない' : 'あれが殿か。馬上から町を見ておられる', 3.5);
  }
  if (lead.pos.z < O.gateZ - 8) {
    for (const u of O.g.units) { u.alive = false; if (u.mesh) u.mesh.visible = false; }
    O.done = true;
  }
}
