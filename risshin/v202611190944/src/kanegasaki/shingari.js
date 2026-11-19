// ======================================================================
// 金ヶ崎の退き口 15分の構成（docs/oda15_plan_1108.md 8）　④「殿戦・藤吉郎・光秀ら・一定時間食い止める」（9〜13分）
// 一番の見せ場：笙の川の砦で、藤吉郎の殿が朝倉の本手を食い止め、主力（信長の本隊）を若狭への道へ逃がす。
// 渡りの段（deep B）の後、狭路の砦へ退く前に入る。朝倉の騎馬と侍の大きな寄せを三度受け、決めの秒だけ持ちこたえる。
// 呼び方：b_kanegasaki.js の deep('B') の後で start(rt, ctx, done)。
// ======================================================================
import * as THREE from 'three';
import * as DP from '../b_depth.js';
import { depthStart } from '../b_depth.js';

export function start(rt, ctx, done) {
  const F = rt.flags;
  if (F.k15Shingari) return;
  F.k15Shingari = 'on';
  F.dpOn = true;
  // 11/10 kanegasaki_spec_1109「味方の数は見た目で減らす（本物の AI の数でなく）」：渡りの段の後に続くこの殿の段で、
  //   木下の組が二十二人から一人まで溶けて備が崩れ、act の bot が毎回「合流が間に合わず」で負けた。この段の間だけ殿の組を固くする
  for (const g of F.tono || []) if (g) g.defMult = Math.max(g.defMult || 1, 3);
  const { LINE1, LOOK } = ctx;
  const from = (dx, dz) => ({ x: LINE1.x + dx, z: LINE1.z + dz });
  const stages = [
    DP.rest({ dur: 5, heal: 0.3, banner: ['金ヶ崎の殿', '主力が退ききるまで、川の砦で食い止める'],
      say: [['木下藤吉郎', '殿はこの藤吉郎が引き受けた！　殿様が朽木を越えるまで、一人も通すな！', 4.2]] }),
    DP.hold({
      at: LINE1, r: 11, dur: 95, limit: 200, noRefill: true, label: '川の砦', title: '殿の戦い', sub: '朝倉の本手が川を渡って来る',
      obj: '川の砦で朝倉の本手を食い止めよ。主力を逃がせ',
      waves: [
        { t: 3, say: ['足軽', '川向こうに朝倉の旗が並んだ！　渡って来るぞ！'],
          foes: () => [{ name: '朝倉の本手の追手', from: from(0, -30), formation: 'yari', list: [{ type: 'busho', n: 1, o: { name: '朝倉の侍大将', horse: true, hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 2 }], mass: 200 }] },
        { t: 12, say: ['朝倉の侍大将', '織田の殿を踏み潰せ！　信長を逃がすな！'], foes: () => [] },
        { t: 35, say: ['池田勝正', '騎馬が浅瀬を回るぞ！　横を固めよ！'],
          foes: () => [{ name: '朝倉の騎馬', from: from(-24, -18), list: [{ type: 'cavalry', n: 4 }, { type: 'samurai', n: 1 }], mass: 80 }] },
        { t: 65, say: ['使番', '殿様の本隊、若狭への道に入られました！　あと少し！'],
          foes: () => [{ name: '朝倉の新手', from: from(16, -26), list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }], mass: 120 }] },
      ],
      reward: '金ヶ崎の殿で朝倉の本手を食い止めた',
      // 守備を離れて失敗した時は、後の退き口で成功へ変えない。
      onEnd: (rt2, m, won) => { if (!won) { m.kgFailed = true; rt2.flags.kgFailWhy = '殿'; } },
    }),
    DP.rest({ dur: 5, heal: 0.3, banner: ['主力は抜けた', '殿も狭路の砦へ退く'],
      say: [['木下藤吉郎', 'ようやった！　殿様は抜けられた。わしらも退くぞ、狭路の砦まで走れ！', 4]] }),
  ];
  for (const stage of stages) stage.idleAdvance = false;
  const hold = stages[1], tick = hold.tick, end = hold.end;
  // 到着待ちと接敵後の守備を別に数える。共通の期限では先に打ち切らない。
  hold.limit = Infinity; hold.noHardCap = true;
  hold.tick = (rt2, C, m, context, el, dt) => {
    const held = C.inT;
    // 寄せが川の砦へ届く前の待機は、殿の守備に数えない。
    if (!C.contacted) C.contacted = C.groups.some(g => !g.routed && g.units.some(u =>
      u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget &&
      Math.hypot(u.pos.x - LINE1.x, u.pos.z - LINE1.z) < 26));
    tick(rt2, C, m, context, el, dt);
    if (C.contacted) fuse(rt2, C, el, dt, from, LINE1);
    // 共通の守備は旗から四十一メートルまで数える。ここでは川の砦を
    // 離れても守ったことにならないよう、指定した十一メートル内だけ数える。
    const p = rt2.player.u.pos;
    // 11/10 関所：十一メートルでは砦の柵の前で槍を合わせる間が数えられず、act の bot が三度とも期限（二百秒）で失敗→殿が崩れて負けた。
    //   柵のすぐ前で寄せを受ける所（二十二メートル）までは守っている事にする。川を渡って追い回せば数えない。
    // 11/17 owner-2（見回り：act bot が「川の砦で朝倉の本手を食い止めよ」のまま1162秒で時間切れ）：寄せを追って二十二メートルの外へ出ると守りの時間が進まなかった。三十二メートルまで数える（川を渡って追い回せば数えない）
    const defending = Math.hypot(p.x - LINE1.x, p.z - LINE1.z) < 32;
    // 川の北で三度の寄せを退けた場合も、砦で守備を続けられるようにする。
    // 未到着の控えと未投入の波は除外せず、空の隊だけで達成にしない。
    if (!C.contacted && defending && !C.waves.length &&
      C.groups.some(g => g.units.length > 0) &&
      C.groups.every(g => !g.kgPending && (g.routed || g.order === 'flee' ||
        !g.units.some(u => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound && !u.noTarget)))) C.contacted = true;
    C.inT = held + (C.contacted && defending ? dt : 0);
    // 二百秒近くで追手が着いても、必要な守備時間を残す。一度だけ延ばし、
    // 持ち場を離れたり未到着のままだったりしても、無期限には待たせない。
    if (C.contacted && !C.contactDeadlineSet) {
      C.contactDeadlineSet = true;
      C.deadline = Math.max(200, el + 95 * 0.6 + 1);
    }
    if (el >= (C.deadline ?? 200)) { C.timeout = true; return true; }
    // 追手の全滅は求めない。殿は三度の寄せを受けて定めの間を守れば退く。
    return C.contacted && el >= 95 && !C.waves.length && C.inT >= 95 * 0.6;
  };
  hold.end = (rt2, C, m) => {
    // 共通の守備判定は時間切れでも滞在秒だけで達成にするため、
    // 接敵後の守備不足・期限切れは必ず失敗として後の退きへ渡す。
    if (C.timeout || !C.contacted || C.inT < 95 * 0.6) C.inT = 0;
    end(rt2, C, m);
  };
  const withdrawal = stages[2], withdrawalStart = withdrawal.start;
  const failedWithdrawal = DP.rest({ dur: 5, heal: 0.3,
    banner: ['川の砦を守りきれぬ', '残った組と若狭への道へ退く'],
    say: [['木下藤吉郎', '備が持たぬ！　残った者を集め、若狭への道へ退け！', 4]] });
  withdrawal.start = (rt2, C, m, context) =>
    (m.kgFailed ? failedWithdrawal.start : withdrawalStart)(rt2, C, m, context);
  depthStart(rt, { ...ctx, look: LOOK, scale: 1.0, dmg: 0.5 }, stages,
    () => { F.k15Shingari = 'done'; F.dpOn = false; for (const g of F.tono || []) if (g && g.defMult > 1.6) g.defMult = 1.6; done(); });
}

// ----------------------------------------------------------------------
// K355（センゴク3・4巻・信長の忍び4巻：docs/books/sengoku_manga.md・nobunaga_shinobi_04.md）の殿の工夫を、川の砦の守りに足す（作り直さない）。
//   ①脇の小高い所の伏兵が、寄せの侍大将を撃つ。撃たれた大将の手は四秒ほど下がり、また寄せる（その繰り返しで時を稼ぐ）
//   ②左右の林から斜めに撃ち込む「殺し間」：寄せが柵の前の間に入ると、両脇の林から煙と音が上がり、前の兵が倒れる
//   ③矢玉が尽きる：七十秒を過ぎると林の鉄砲は止み、柵の内から石を投げる（石は三つを使い回す・小谷の投石と同じ作り）
//   字の札は出さず、音・煙・倒れる兵と短い声だけ。本物の兵は増やさない
const KG_STONES = [];
let KG_SGEO = null, KG_SMAT = null;
const kgLive = (u) => u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;
function fuse(rt, C, el, dt, from, LINE1) {
  const A = rt.army;
  // 石の弧を進める
  for (const s of KG_STONES) {
    if (!s.on) continue;
    s.t += dt;
    const k = Math.min(1, s.t / s.dur);
    s.mesh.position.set(s.ax + (s.bx - s.ax) * k, s.ay + (s.by - s.ay) * k + Math.sin(k * Math.PI) * 2.6, s.az + (s.bz - s.az) * k);
    s.mesh.rotation.x += dt * 8;
    if (k >= 1) {
      s.on = false; s.mesh.visible = false;
      A.play?.('knock', { x: s.bx, z: s.bz }, 0.8);
      A.forNear?.(s.bx, s.bz, 1.2, (u) => { if (u.team === 1 && u.alive && !u.isStruct) A.damage(u, 12, null, { kind: 'rock' }); });
    }
  }
  if (C.fuseAt == null) C.fuseAt = el + 6;
  if (el < C.fuseAt) return;
  const foes = [];
  for (const g of C.groups) if (g && !g.routed) for (const u of g.units) if (kgLive(u) && u.team === 1) foes.push(u);
  if (!foes.length) { C.fuseAt = el + 3; return; }
  if (el < 70) {
    C.fuseAt = el + 10 + Math.random() * 3;
    // ① 伏兵：侍大将（馬上の将）を狙う
    const chief = foes.find((u) => u.type === 'busho' || u.officer);
    const hill = from(22, -4);
    if (chief && Math.hypot(chief.pos.x - LINE1.x, chief.pos.z - LINE1.z) < 48) {
      A.play?.('gun', hill, 1); A.smoke?.(hill.x, rt.world.heightAt(hill.x, hill.z) + 1.4, hill.z, chief.pos.x - hill.x, chief.pos.z - hill.z);
      A.damage(chief, 16, null, { kind: 'gun' });
      const g = chief.group;
      if (g && !g.routed && g.order !== 'retreat') {
        const prev = g.order; g.order = 'retreat';
        rt.after(4, () => { if (!g.routed && g.order === 'retreat') g.order = prev || 'attack'; });
      }
      if (!C.fuseSaid1) { C.fuseSaid1 = true; rt.say('足軽', '脇の丘の伏兵が侍大将を撃った！　大将が下がるぞ', 3); }
    }
    // ② 殺し間：柵の前の間（二十四メートル内）に入った寄せへ、左右の林から斜めに撃ち込む
    const inZone = foes.filter((u) => Math.hypot(u.pos.x - LINE1.x, u.pos.z - LINE1.z) < 24);
    if (inZone.length) {
      for (const sd of [-1, 1]) {
        const w = from(sd * 18, 6);
        A.play?.('gun', w, 0.9); A.smoke?.(w.x, rt.world.heightAt(w.x, w.z) + 1.2, w.z, LINE1.x - w.x, LINE1.z - w.z);
        const t = inZone[Math.floor(Math.random() * inZone.length)];
        if (t && t.type !== 'busho') A.damage(t, 30, null, { kind: 'gun' });
      }
      if (!C.fuseSaid2) { C.fuseSaid2 = true; rt.say('木下藤吉郎', '間に入った！　左右の林から撃ちかけよ！', 2.8); }
    }
    return;
  }
  // ③ 矢玉が尽きた：柵の内から石を投げる
  C.fuseAt = el + 2.6 + Math.random() * 1.6;
  if (!C.fuseSaid3) { C.fuseSaid3 = true; rt.say('足軽', '玉が尽きた！　石じゃ、石を投げろ！', 2.8); }
  const near = foes.filter((u) => Math.hypot(u.pos.x - LINE1.x, u.pos.z - LINE1.z) < 20);
  if (!near.length) return;
  let st = KG_STONES.find((q) => !q.on);
  if (!st) {
    if (KG_STONES.length >= 3) return;
    if (!KG_SGEO) { KG_SGEO = new THREE.DodecahedronGeometry(0.16, 0); KG_SMAT = new THREE.MeshLambertMaterial({ color: 0x77706a, flatShading: true }); }
    st = { mesh: new THREE.Mesh(KG_SGEO, KG_SMAT) }; rt.scene.add(st.mesh); KG_STONES.push(st);
  }
  if (st.mesh.parent !== rt.scene) rt.scene.add(st.mesh);   // 前の戦の場面に残った石を、この戦の場面へ移す
  const tgt = near[Math.floor(Math.random() * near.length)], a = from((Math.random() - 0.5) * 8, 2);
  Object.assign(st, { on: true, t: 0, dur: 0.9, ax: a.x, ay: rt.world.heightAt(a.x, a.z) + 1.6, az: a.z,
    bx: tgt.pos.x, by: rt.world.heightAt(tgt.pos.x, tgt.pos.z) + 0.3, bz: tgt.pos.z });
  st.mesh.visible = true;
}
