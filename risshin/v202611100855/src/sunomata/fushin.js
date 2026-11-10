// ======================================================================
// 墨俣：築城の進み（BUILD_PROGRESS）と、bot が詰まらないための決まり（docs/sunomata_spec_1109.md・kaito 11/9 夜）
//   ・築城は「時間＋築城地の安全さ」で進む。特定の人足一人や、物理の動きの完了の知らせには頼らない。
//     人足が減っても最低の速さで進み、敵が柵の内に入っている間だけ遅くなる（止まりはしない）。
//   ・5段階：0 河原と旗／1 資材の集積／2 外柵／3 櫓と内陣／4 守りの拠点の完成（夜明けに「城」）。
//     段が上がるたびに使番の声と、目の前の櫓・陣幕・旗が実際に立つ（字の札は増やさない）。
//   ・波の終わりは「全滅」でなく、寄せて来た組の主な兵が二割以下になった時か、寄せて来てから
//     最大の時間を過ぎた時。どちらでも残りは退く（岩や柵に引っかかった一人で波が終わらない事を無くす）。
//   ・見張り：段も波も六十秒変わらず、本人が生きていて築城地が敵に取られていなければ、次の段へ進める。
//   ・完全に詰むのは本人が倒れた時だけ。
// 本体（b_sunomata.js）からは sunomata/index.js の tick 経由で毎コマ呼ぶ。
// ======================================================================
import * as THREE from 'three';

// 段の境（BUILD_PROGRESS）。4 は夜明けの完成。
const STAGE_AT = [0, 8, 30, 62, 100];
// 寄せて来てから退くまでの最大の秒（一・二・三の手）
const WAVE_MAX = { 0: 90, 1: 110, 2: 120, 3: 150 };
const STALL = 60;
const STAGE_CALL = [
  null,
  ['使番', '資材が着いたぞ！　杭と縄を降ろせ'],
  ['使番', '外柵、立ちました！　柵越しに守れます'],
  ['使番', '櫓、まもなく！　内の陣幕も張れたぞ'],
  ['木下藤吉郎', '……できた。'],
];

const ready = (u) => !!u && u.alive && !(u.hp <= 0) && !u.dying && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;

function S(rt) {
  const F = rt.flags;
  return F.fs || (F.fs = { p: 0, stage: 0, sig: '', sigT: rt.t, pT: rt.t, pSeen: 0, next: 0, kicks: 0, vis: null });
}

export function progress(rt) { return S(rt).p; }
export function stage(rt) { return S(rt).stage; }

// 退く：討死にせず、柵から離れて北へ下がる（追わなくても波が終わる）
export function retreat(g) {
  if (!g || g.routed) return;
  g.noRout = false; g.morale = 0; g.routed = true; g.order = 'flee'; g.fleeSet = true; g.fleeDir = { x: 0, z: -1 };
}

// 築城地が敵に取られていない（柵の内に戦える敵が三人より多くいない）
function siteHeld(rt, FORT) {
  let n = 0;
  for (const u of rt.army.units) {
    if (u.team !== 1 || !ready(u) || u.group?.routed) continue;
    if (Math.abs(u.pos.x) < FORT && Math.abs(u.pos.z) < FORT && ++n > 3) return false;
  }
  return true;
}

// 寄せて来た組ごとに、最初の人数と寄せた時刻を覚え、二割以下か最大の時間で退かせる。
function waveRule(rt, FORT) {
  const F = rt.flags;
  // 本人が戦う前に全ての寄せ手を退かせると、戦果を付ける相手が尽きる。
  // 停滞の救済と同じく、各寄せで槍を合わせてから時間上限を使う。
  if (F.wave >= 1 && F.wave <= 3 && F.foughtWave !== F.wave) return;
  const maxT = WAVE_MAX[F.wave || 0] ?? 120;
  for (const g of rt.army.groups) {
    if (g.team !== 1 || g.routed || g.noAI || !g.units?.length) continue;
    const live = g.units.filter(ready);
    if (!live.length) continue;
    if (g._fsT == null) {
      if (!live.some((u) => Math.max(Math.abs(u.pos.x), Math.abs(u.pos.z)) < FORT + 40)) continue;
      g._fsT = rt.t; g._fsN = Math.max(live.length, g.units.length);
      continue;
    }
    const few = live.length <= Math.max(1, Math.floor(g._fsN * 0.2));
    const long = rt.t - g._fsT >= maxT;
    if (!few && !long) continue;
    // 寄せ大将の組は、大将が生きて柵の内にいる間だけは残す（討つ機会を消さない）。最大の時間の倍を過ぎれば退く。
    const boss = F.yoseBoss;
    if (boss && ready(boss) && boss.group === g && rt.t - g._fsT < maxT * 2 && !few) continue;
    retreat(g);
  }
}

// 目の前で立っていく櫓・陣幕・旗（当たり判定なし。小物に引っかからないよう見た目だけ）
function buildVis(rt) {
  const W = rt.world, root = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0xa88d63 }), dark = new THREE.MeshLambertMaterial({ color: 0x5e5548 });
  const cloth = new THREE.MeshLambertMaterial({ color: 0xe8e2d2, side: THREE.DoubleSide });
  const band = new THREE.MeshLambertMaterial({ color: 0x1d1b18, side: THREE.DoubleSide });
  const yx = -11, yz = -10, y0 = W.heightAt(yx, yz);
  // 櫓：四本の柱が段3までに伸び、段3で床と屋根が乗る
  const tower = new THREE.Group(); tower.position.set(yx, y0, yz);
  const postG = new THREE.CylinderGeometry(.13, .16, 1, 6); postG.translate(0, .5, 0);
  const posts = [];
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const m = new THREE.Mesh(postG, wood); m.position.set(dx * 1.2, 0, dz * 1.2); m.scale.y = .01; tower.add(m); posts.push(m);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3, .18, 3), wood); deck.position.y = 6.2; deck.visible = false; tower.add(deck);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(3, .9, 3), band); rail.position.y = 6.75; rail.scale.set(1, 1, 1); rail.visible = false; tower.add(rail);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 4), dark); roof.position.y = 8; roof.rotation.y = Math.PI / 4; roof.visible = false; tower.add(roof);
  root.add(tower);
  // 陣幕：砦の中ほどの北に、白地に黒の一筋
  const maku = new THREE.Group();
  const mx = 2, mz = -12, my = W.heightAt(mx, mz);
  maku.position.set(mx, my, mz);
  // 幕は地から少し上に張り、両端と中ほどの竿で吊る（宙に浮いた白い板に見せない）
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.5), cloth); cl.position.y = 1.05; maku.add(cl);
  const st = new THREE.Mesh(new THREE.PlaneGeometry(9, .3), band); st.position.set(0, 1.1, .01); maku.add(st);
  const poleG = new THREE.CylinderGeometry(.05, .06, 2.2, 5); poleG.translate(0, 1.1, 0);
  for (const px of [-4.5, -1.5, 1.5, 4.5]) { const pl = new THREE.Mesh(poleG, dark); pl.position.x = px; maku.add(pl); }
  maku.visible = false; root.add(maku);
  root.userData = { posts, deck, rail, roof, maku, flags: [] };
  rt.scene.add(root);
  return root;
}

function showVis(rt, B) {
  const v = B.vis?.userData; if (!v) return;
  // 柱は外柵（段2）から櫓（段3）までの進みで伸びる
  const k = Math.max(0, Math.min(1, (B.p - STAGE_AT[1]) / (STAGE_AT[3] - STAGE_AT[1])));
  for (const m of v.posts) m.scale.y = Math.max(.01, k * 6.3);
  const s3 = B.stage >= 3;
  v.deck.visible = v.rail.visible = v.roof.visible = s3;
  v.maku.visible = s3;
}

function stageUp(rt, B, k) {
  B.stage = k;
  const c = STAGE_CALL[k];
  if (c && k < 4) rt.say(c[0], c[1], 3);
  if (k === 4 && B.vis && rt.flags.fsFlagMaker) {
    for (const [x, z] of [[-11, -12.5], [-9, -10]]) { const f = rt.flags.fsFlagMaker(x, z); if (f) { rt.scene.add(f); B.vis.userData.flags.push(f); } }
  }
  showVis(rt, B);
}

// 次の段へ進める（六十秒の見張りから）
function kick(rt, def, C) {
  const F = rt.flags, B = S(rt), v = F.s15 || {};
  // 停滞の救済でも、舟着きへの出迎えと本人の帰還は省かない。
  if (v.ph === 'hakobi') {
    const p = rt.player.u.pos;
    if (!v.atDock || Math.abs(p.x) >= C.FORT || Math.abs(p.z) >= C.FORT) return 'wait';
    B.kicks++; C.hakobiForce?.(rt); return 'hakobi';
  }
  // 戦った印は本体の命中・討ち取りでだけ付ける。待つだけで目標を果たさせない。
  if (F.wave && F.foughtWave !== F.wave) return 'wait';
  B.kicks++;
  if (!F.wave) { def.wave1?.(rt); return 'w1'; }
  if (F.wave === 1) {
    for (const g of [F.W1, F.W1b, F.PR1]) retreat(g);
    if (!F.W2) def.wave2?.(rt);
    return 'w2';
  }
  if (F.wave === 2) {
    retreat(F.W2);
    def.wave3?.(rt);
    return 'w3';
  }
  // 三の手：刻限までは築城を一段進め、刻限を過ぎていれば残りの寄せを退かせて夜明けの完成へ
  if (!F.finishAt || rt.t < F.finishAt) {
    const nx = STAGE_AT.find((a) => a > B.p);
    if (nx != null && nx < 100) B.p = nx;
    return 'build';
  }
  for (const g of rt.army.groups) if (g.team === 1 && !g.routed && g.units?.some(ready)) retreat(g);
  F.fsForce = true;
  def.holdWin?.(rt);
  return 'dawn';
}

export function tick(rt, dt, def, C) {
  const F = rt.flags;
  if (rt.over || F.won || F.ending || !rt.player?.u) return;
  const B = S(rt);
  if (!B.vis) B.vis = buildVis(rt);
  const alive = rt.player.u.alive && rt.player.u.hp > 0;
  const held = siteHeld(rt, C.FORT);
  // 築城の進み：時間＋安全さ。人足が減っても最低の速さで進む。
  if (alive && dt > 0 && dt < 1) {
    const hands = F.wk?.units?.filter(ready).length ?? 0;
    let rate = 100 / 780;                       // 安全なら十三分ほどで仕上がる速さ
    if (F.finishAt && F.wave >= 3) rate = Math.max(rate, (100 - B.p) / Math.max(4, F.finishAt - rt.t));
    if (!hands) rate *= .5;
    if (!held) rate *= .25;
    const cap = F.wave >= 3 ? 100 : 80;         // 完成は三の手（夜）の後、夜明けに
    B.p = Math.min(cap, B.p + rate * dt);
  }
  let k = B.stage;
  while (k < 4 && B.p >= STAGE_AT[k + 1]) k++;
  if (k !== B.stage) stageUp(rt, B, k);
  else if (B.vis && rt.t >= B.next) showVis(rt, B);
  if (rt.t < B.next) return;
  B.next = rt.t + 1;
  if (F.fsForce && F.finishAt && rt.t >= F.finishAt) def.holdWin?.(rt);
  waveRule(rt, C.FORT);
  // 六十秒の見張り：波・段・刻限の何も変わらなければ、次へ進める
  const v = F.s15 || {};
  const sig = [v.ph || '', F.wave || 0, !!F.next2, !!F.next3, F.duskNext || 0, B.stage, !!F.w3Clear, !!F.finalChecked, !!F.lastCall,
    rt.army.groups.filter((g) => g.team === 1 && g.routed).length].join('|');
  if (sig !== B.sig) { B.sig = sig; B.sigT = rt.t; return; }
  if (!alive || !held || rt.t - B.sigT < STALL) return;
  const what = kick(rt, def, C);
  B.sigT = rt.t;
  (F.fsLog ||= []).push(`${Math.round(rt.t)}s ${what}`);
}

// 夜明けの勝ちの関所に使う：築城が仕上がったか、見張りで夜明けへ進めたか
export function built(rt) { return S(rt).p >= 100 || !!rt.flags.fsForce; }
