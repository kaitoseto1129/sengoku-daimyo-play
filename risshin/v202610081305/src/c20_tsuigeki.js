// 退き口と追撃。既存の兵を使い、柵の口・浅瀬・野・殿へ歩いて進む。
// 道筋は下知の時だけ作る。時間切れで殿を崩したことにはしない。
export function tsuigekiRetreat(rt, groups, rear, at, exit) {
  for (const g of groups) {
    const c = g.center();
    g.fleeDir.x = 1; g.fleeDir.z = -0.2; g.fleeSet = true;
    g.fleePath = c.x > at.x ? [[exit.x, exit.z]] : [[Math.max(34, c.x + 12), c.z], [at.x + 28, at.z], [exit.x, exit.z]];
    for (const u of g.units) u.fleePathIdx = 0;
    // 寄せが崩れた後の護衛も退く。共通の敗走で順に武器を捨てる。
    if (g.count && !g.routed) { g.noRout = false; g.morale = 0; }
  }
  rear.noRout = true; rear.aggro = 0; rear.retreatOnly = true;
  rear.order = 'path'; rear.formation = 'column'; rear.colW = 2;
  rear.path = [[at.x, at.z]]; rear.pathIdx = 0; rear.dest = null;
  rear.onArrive = (g) => {
    g.order = 'hold'; g.formation = 'yari'; g.yariRanks = 3;
    g.facing = -Math.PI / 2; g.aggro = 12; g.retreatOnly = false;
    g.noRout = false;
    for (const u of g.units) { u.invuln = false; u.noTarget = false; }
  };
}

function charge(g) {
  g.order = 'attack'; g.path = null; g.dest = null; g.onArrive = null;
  g.formation = g.kind === 'gun' || g.kind === 'bow' || g.isGun ? 'line' : 'yari';
  g.facing = Math.PI / 2; g.seekRange = 55; g.aggro = 14; g.pursuing = true;
}

export function tsuigekiStart(rt, o) {
  const F = rt.flags;
  const gz = o.gates[0] + o.offset;
  const flankZ = o.rearAt.z + (o.side ? -22 : 0);
  F.tsuigeki = { preserveRear: !!o.preserveRear, groups: o.groups, rear: o.rear, rearAt: o.rearAt, stage: 0, poll: 0,
    points: [{ x: o.frontX, z: gz }, { x: 36, z: gz }, { x: 125, z: gz }, { x: o.rearAt.x - 10, z: flankZ }],
    labels: ['大宮前の虎口', '連吾川の浅瀬', '東へ続く退き口', '出沢・寒狭川方面へ退く馬場の殿'] };
  for (const g of o.groups) if (g.count && !g.routed) {
    const c = g.center();
    let gate = o.gates[0];
    for (const z of o.gates) if (Math.abs(z - c.z) < Math.abs(gate - c.z)) gate = z;
    const z = gate + o.offset;
    g.focus = null; g.pending = null; g.onArrive = charge;
    g.holdFire = false; g.fire = true; g.salvoOnly = false; g.aggro = 2;
    g.formation = 'column'; g.colW = 1; g.roadColumn = true; g.pursuing = false;
    g.order = 'path'; g.pathIdx = 0; g.dest = null;
    // 三重の口を最後尾まで抜けてから、川を渡り野へ出る。
    g.path = [[c.x, z], [o.frontX + 20, z], [65, z], [125, gz], [o.rearAt.x - 14, flankZ]];
    if (c.x <= o.rearX + 1) g.path.unshift([o.rearX, c.z], [o.rearX, z]);
  }
  rt.setPhase('pursuit');
  rt.obj('pursue', '下知じゃ。大宮前の虎口から出て、退く武田勢を追え', 'main', true);
  rt.marker('pursuit_road', F.tsuigeki.points[0], F.tsuigeki.labels[0]);
}

export function tsuigekiTick(rt, dt) {
  const T = rt.flags.tsuigeki;
  if (!T) return false;
  T.poll -= dt;
  if (T.poll > 0) return false;
  T.poll = 0.5;
  const p = rt.player.u.pos, at = T.points[T.stage];
  // 追わずに留まっても戦は止めない。設楽原は追撃失敗で終え、殿の生死を変えない。
  T.stageAt ??= rt.t;
  if (rt.t - T.stageAt > 60 && !T.urged) { T.urged = true; rt.say('組頭', '何をしておる！　印の方へ東へ追え。味方は先に行くぞ！', 4); }
  if (rt.t - T.stageAt > 150 && !T.rear.routed && T.rear.count) {
    if (T.preserveRear) {
      T.timedOut = true;
      rt.say('組頭', '追い切れぬ。深追いはやめよ。組を揃えて戻るぞ！', 4);
      return true;
    }
    T.stage = 3; T.rear.morale = 0; T.rear.routed = true;
    for (const u of T.rear.units) if (u.alive) u.fleeing = true;
    rt.say('使番', '味方の追手が馬場の殿を崩した！　武田勢は総崩れじゃ！', 4);
  }
  if (T.stage < 3 && (Math.hypot(p.x - at.x, p.z - at.z) < 10 || p.x >= at.x && Math.abs(p.z - at.z) < 35)) {
    T.stage++; T.stageAt = rt.t; T.urged = false;
    rt.marker('pursuit_road', T.points[T.stage], T.labels[T.stage]);
    if (T.stage === 1) {
      rt.obj('pursue', '連吾川の浅瀬を渡れ。組と東へ追え', 'main', true);
      rt.say('組頭', '川を渡れ！　組を離すな。武田は東の野へ退くぞ！', 3.5);
    } else if (T.stage === 2) {
      rt.obj('pursue', '野を東へ進み、逃げる武田勢を追え', 'main', true);
      rt.say('足軽', '武田の兵が槍を捨てて逃げるぞ！　東へ追え！', 3);
    } else {
      rt.obj('pursue', '退き口の槍衾を崩せ。勝頼を追い続けるな', 'main', true);
      rt.say('伝令', '馬場の殿が槍を揃えた！　ここを崩せ。勝頼への深追いは無用じゃ！', 4);
      rt.unmark('pursuit_road');
      rt.marker('rear', T.rear.anchor, '退き口を守る馬場隊', { red: true, group: T.rear });
    }
  }
  return T.stage === 3 && (T.rear.routed || T.rear.count === 0);
}
