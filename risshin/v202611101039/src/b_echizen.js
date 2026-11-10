// 旧越前の入口も、実寸の木ノ芽峠の定義を使う。
// 縮めた二砦・敵だけ弱い傷・時刻による救済・本陣への斬り込みは重ねない。
import { kinome, kinomeCourtLevel, echizenValleyGroves } from './b_kinome.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dirtTex } from './nature.js';
import { KINOME_PLAN, KINOME_ROADS, ROAD, EXIT_KANNON, EXIT_KINOME, GATE_KANNON, GATE_KINOME, SAIKOJI_HON, HACHIBUSE_HON, KX, KZ } from './castles/kinome.js';
import { sakamogi, yagura } from './props.js';
import { flagTexture } from './textures.js';
import { distToPolyline } from './world.js';
import { distToSeg } from './units.js';
import { addDeck, groundAt } from './floors.js';
import { timeslipField } from './timeslip_field.js';
import { tabaGeo } from './taketaba.js';
import { drawGroundAt, guardDrawCamera, avoidCameraBodies } from './render_camera.js';
import { sfx } from './audio.js';
import { isTouch } from './touch.js';
import { S } from './settings.js';
import { NAKA } from './naka.js';
import { dressStage } from './stage_dress.js';
import { allyGroup, enemyGroup } from './bhelp.js';
import { goalsTick } from './hud_goals.js';
import * as EC_GORYU from './echizen/goryu.js';
import * as EC_KURUWA from './echizen/kuruwa.js';
import * as EC_SEIEI from './echizen/seiei.js';
import * as EC_FUCHU from './echizen/fuchu.js';   // 15分の構成（docs/oda15_plan_1108.md 18）：段の中身は echizen/ に一段一ファイル

// 段ごとの下知は、小言を消す古い語句の制限で落とさない。
const ECH_STORY_LINES = new Set([
  '主郭から精鋭が打って出たぞ！　副郭で踏みとどまれ！',
  '追いついたぞ。坂の上に殿が踏みとどまっておる！',
  '……一揆勢は府中へ散った。峠は、われらの物じゃ',
]);

// 11/5 fix61（kaito 九1・九3・十1）：右上は①〜⑤を最初から全部並べ、済んだ物に印（hud_goals の札）。両軍の今の兵の数の棒も上に常に出す。
//   共通の任務札は一行だけ（missionSingleLine）なので、その後に目標の札を重ねて置き換える（有岡と同じ作り）。時の字は出さない。
const ECH_BOARD_CSS = `
html:root body #hud#hud#hud.ech-goals #armybar:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; }
html:root body #hud#hud#hud.ech-goals #armybar .clock { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.ech-goals #armybar { visibility:hidden !important; }
html:root body #hud#hud#hud.ech-goals #h-prog#h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud#hud.ech-goals #h-prog#h-prog.goal-mode > .pg-goals { display:block !important; }
html:root body #hud#hud#hud.ech-goals #h-prog#h-prog.goal-mode {
 left:auto !important; right:calc(12px + env(safe-area-inset-right, 0px)) !important; transform:none !important;
 top:calc(min(28vh, 126px) + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
 width:auto !important; min-width:0 !important; max-width:min(340px, 38vw) !important; box-sizing:border-box;
 padding:8px 12px 9px 10px !important; background:rgba(14,12,10,.7) !important; border:none !important; border-radius:6px !important;
}
html:root body #hud#hud#hud.ech-goals #h-prog#h-prog.goal-mode .pg-goals li { display:flex !important; white-space:normal !important; align-items:flex-start; color:#e6dfd2 !important; }
html:root body #hud#hud#hud.ech-goals #h-prog#h-prog.goal-mode .pg-goals li i { margin-top:3px; }
html:root body #hud#hud#hud.ech-goals #h-prog#h-prog.goal-mode .pg-goals li span { color:inherit !important; background:none !important; }
html:root body #hud#hud#hud.ech-goals #h-prog#h-prog.goal-mode .pg-goals li.now { color:#fff !important; }
html:root body #hud#hud#hud.ech-goals #h-prog#h-prog.goal-mode .pg-goals li.done { color:#cfc9bc !important; }
html:root body #hud#hud#hud.ech-goals #h-prog#h-prog.goal-mode .pg-goals :is(h3 b, li em.tm) { display:none !important; }`;
function echGoalBoard(rt) {
  const hud = rt.hud;
  if (!hud?.root || typeof document === 'undefined') return;
  hud.root.classList.add('ech-goals');
  const style = document.createElement('style');
  style.textContent = ECH_BOARD_CSS;
  document.head.appendChild(style);
  const progress = hud.progress;
  hud.progress = function (battle) {
    const out = progress.call(this, battle);
    if (battle === rt && this.prog && !rt.over) {
      const def = rt.def, one = def.missionSingleLine;
      def.missionSingleLine = false;
      try { goalsTick(this.prog, rt); } finally { def.missionSingleLine = one; }
    }
    return out;
  };
  const dispose = rt.dispose;
  rt.dispose = function () {
    hud.progress = progress;
    if (hud.prog) hud.prog.classList.remove('goal-mode');
    hud.root.classList.remove('ech-goals'); style.remove();
    return dispose.call(this);
  };
}

// kaito 10/31：寄せる敵は、ほかの者より本人を多く狙う。本人から三十歩内で打ちかかる組を本人へ向ける
//   （三歩半内の別の敵には先に応じる）。本人が深手の時と、定義が門・櫓へ向けた組は外す。共通の兵の考えは触らない。
function huntPlayer(rt, dt) {
  const F = rt.flags;
  if ((F._huntT = (F._huntT || 0) - dt) > 0) return;
  F._huntT = 0.5;
  const P = rt.player.u;
  if (!P?.alive) return;
  // 11/1：郭の中の乱戦の間、木戸前で三組・四組が一度に本人へ集まり、倒れる戦が増えた。本人へ向ける組は二つまで、深手の目安も半ばに。
  const weak = P.hp < P.maxHp * 0.5;
  let hunters = 0;
  for (const g of rt.army.groups) if (g.team === 1 && g.focus === P && g.count && !g.routed) hunters++;
  for (const g of rt.army.groups) {
    if (g.team !== 1 || !g.count || g.noHunt) continue;
    const mine = g.focus === P;
    if (g.focus && !mine) continue;
    if (g.routed || weak || g.order !== 'attack' || g.isPlayerSquad) { if (mine) { g.focus = null; hunters--; } continue; }
    const c = g.center(), d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
    // 同じ距離でも塀の向こうには寄せない。追跡中に壁を挟んだ時も
    // 注視を返し、兵自身が通れる所の敵を選べるようにする。
    if (d < 45 && rt.army.wallBetween(c, -1, P.pos, false)) {
      if (mine) { g.focus = null; hunters--; }
      continue;
    }
    if (!mine && d < 30 && hunters < 2) { g.focus = P; hunters++; }
    else if (mine && d > 45) { g.focus = null; hunters--; }
  }
}
// 10/31 mini の点付け：開戦25秒の本人の位置と向きは流すたびに変わり、決まった所に置いた押し合いが画面から外れた。
// 開戦から win 秒の間、本人の前（カメラの向く先）の foeD 歩へ近い敵の組を、allyD 歩へ味方の組を寄せ続け、
// 画面の正面で斬り合わせる。兵は足さず、瞬間移動もしない（歩いて寄る）。時が過ぎたら元の下知へ戻す。
function endHeroFrontClash(rt) {
  const H = rt.flags._hfc;
  if (!H || H.done) return;
  for (const [g, s] of H.saved) {
    // 既に敗走した組や、新しい下知で郭へ向かった組を古い命令へ戻さない。
    if (g.routed || g.order !== 'hold' || !g.noAI) continue;
    g.order = s.order; g.path = s.path; g.pathIdx = s.pathIdx; g.noAI = s.noAI; g.aggro = s.aggro;
    // 下知だけ戻しても、持ち場と向きが本人の前のままだと元の隊列へ戻れない。
    g.anchor.x = s.x; g.anchor.z = s.z; g.facing = s.facing;
  }
  H.saved.clear(); H.done = true;
}
function heroFrontClash(rt, dt, o = {}) {
  const F = rt.flags, P = rt.player.u;
  const H = F._hfc || (F._hfc = { t: 0, t0: rt.t, saved: new Map() });
  if (H.done) return;
  if (rt.t - H.t0 > (o.win ?? 50) || rt.over || F.ending || !P?.alive || (o.active && !o.active(rt))) {
    endHeroFrontClash(rt); return;
  }
  if ((H.t -= dt) > 0) return;
  H.t = 0.5;
  const e = rt.camera?.matrixWorld?.elements;
  let fx = e ? -e[8] : 0, fz = e ? -e[10] : 0, L = Math.hypot(fx, fz);
  if (L < 0.3) { fx = Math.sin(P.heading); fz = Math.cos(P.heading); L = 1; }
  fx /= L; fz /= L;
  // 戦の視点が決まった向き（例：表門）を見る時は、その向きを使う
  const D = o.dir && o.dir(rt);
  if (D) { const l = Math.hypot(D.x, D.z) || 1; fx = D.x / l; fz = D.z / l; }
  const pick = (foe, want, d) => {
    let x = P.pos.x + fx * d, z = P.pos.z + fz * d;
    if (o.clamp) ({ x, z } = o.clamp(x, z));
    // 前が塀・柵の向こうなら、本人の手前の側（壁の内）まで縮める
    for (let k = 0; k < 3 && rt.army.wallBetween(P.pos, -1, { x, y: P.pos.y, z }); k++) { d *= 0.6; x = P.pos.x + fx * d; z = P.pos.z + fz * d; if (o.clamp) ({ x, z } = o.clamp(x, z)); }
    const list = [];
    for (const g of rt.army.groups) {
      if ((g.team !== P.team) !== foe || g.isPlayerSquad || g.routed || g.count < 2 || (o.skip && o.skip(g, foe))) continue;
      if (g.assault || g.siegeAI || g.units.some((u) => u.alive && (u.type === 'busho' || u.isLord || u === rt.flags.nb))) continue;
      const c = g.center(), r = Math.hypot(c.x - x, c.z - z);
      // 塀・柵・門の向こうの組は寄せない（壁に詰まって突っ立つ）
      if (r < (o.reach ?? 70) && !rt.army.wallBetween({ x: c.x, y: P.pos.y, z: c.z }, -1, { x, y: P.pos.y, z })) list.push([r, g]);
    }
    list.sort((a, b) => a[0] - b[0]);
    const out = []; let n = 0;
    for (const [, g] of list) { if (n >= want) break; out.push(g); n += g.count; }
    out.forEach((g, k) => {
      if (!H.saved.has(g)) H.saved.set(g, { order: g.order, path: g.path, pathIdx: g.pathIdx, noAI: g.noAI, aggro: g.aggro,
        x: g.anchor.x, z: g.anchor.z, facing: g.facing });
      const side = (k - (out.length - 1) / 2) * 6 + (foe ? 0 : 1.5);
      g.order = 'hold'; g.noAI = true; g.aggro = Math.max(g.aggro || 0, 9);
      if (g.focus && g.focus !== P) g.focus = null;
      g.anchor.x = x + fz * side; g.anchor.z = z - fx * side;
      g.facing = foe ? Math.atan2(-fx, -fz) : Math.atan2(fx, fz);
    });
  };
  pick(true, o.foeN ?? 22, o.foeD ?? 15);
  pick(false, o.allyN ?? 16, o.allyD ?? 9);
}
// 実際の構え方に合わせる。携帯と切替式では長押しを強いない。
function passGuardAction() {
  return isTouch ? '「構え」を押す' : S.guardToggle ? '右押しで構える' : '右押しを押し続ける';
}

// 山肌だけが空色へ消えると、道と木が空中に浮いて見える。
// 土と樹木を同じ距離の霞へそろえる。高さによる濃淡の差で幹だけ残さない。
function passSoilFog(mat) {
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => `${key}|越前の地面と森の霞の抜け・山の肩`;
  mat.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment)
      // 嵐の二百メートルで山肌を消すと、百九十メートル先からの尾根が見えない。
      // 地面と森だけ同じ四百八十メートルの霞へ延ばす。兵の見通しと雨量は保つ。
      .replace('float fogVis = max(20.0, floor(fogFar));',
        'float fogVis = max(480.0, floor(fogFar));')
      // 共通の霞に補正が足されても、高さを使う式全体を差し替える。
      // 古い式との完全一致では補正が外れ、谷の土だけ先に抜けてしまう。
      .replace(/float fogFactor = [^;\n]*\bfogPath\b[^;\n]*;/,
        'float fogFactor = max(1.0 - exp(-fogPath / fogVis * 1.2), smoothstep(fogVis * 0.55, fogVis, fogD));')
      // 木ノ芽峠から受け継ぐ谷底の緑の霞は、土だけ色が違って遠い山を板に見せる。
      // 森と同じ霞の色へ戻す。高さや兵の足場は変えない。
      .replace(/vec3 fogC = [^;]+;/, 'vec3 fogC = fogColor;')
      // 霞み切った土も不透明のままだと、遠い地形の三角形が空を切る。
      // 色の霞がほぼ白くなるまで待つと、嵐でも八百メートル先の山の面が残る。
      // 見通しの距離で土と森を一緒に抜き、遠い尾根の直線を空へなじませる。
      .replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );',
        `gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
         // 点で抜くと明るい空が網目に透け、遠い斜面に白い点の横縞が出た（10/28）。抜かずに霞の色へ溶かす。
         gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, smoothstep(fogVis * 0.9, fogVis * 1.8, fogD) );`);
  };
  mat.needsUpdate = true;
}

// 目の位置だけでなく、本人までの線も土の上へ出す。峠だけの補正。
function passGroundAt(W, x, z) {
  let y = Math.max(W.heightAt(x, z), drawGroundAt(W, x, z));
  // 郭の土も描く地面。格子だけを読むと、縁で目線が平場の裏へ入る。
  for (const c of courts) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1)
    y = Math.max(y, c.y + .04);
  return y;
}
function passGroundView(W, target, eye) {
  const dx = eye.x - target.x, dz = eye.z - target.z, length = Math.hypot(dx, dz);
  const samples = Math.max(16, Math.min(64, Math.ceil(length / .15)));
  let blocked = eye.y < passGroundAt(W, eye.x, eye.z) + .8;
  for (let i = 1; i <= samples && !blocked; i++) {
    const t = i / samples;
    blocked = target.y + (eye.y - target.y) * t < passGroundAt(W, target.x + dx * t, target.z + dz * t) + .65;
  }
  if (!blocked) return false;
  let reach = Math.min(1, 3.2 / Math.max(length, .01));
  for (let attempt = 0; attempt < 8; attempt++) {
    let y = target.y + 1.1;
    const nearSamples = Math.max(16, Math.ceil(length * reach / .15));
    for (let i = 1; i <= nearSamples; i++) {
      const t = i / nearSamples, h = passGroundAt(W, target.x + dx * reach * t, target.z + dz * reach * t) + .8;
      y = Math.max(y, target.y + (h - target.y) / t);
    }
    eye.set(target.x + dx * reach, y, target.z + dz * reach);
    if (y <= target.y + 3.6) break;
    reach *= .65;
  }
  return true;
}

// 任務・ピン・頭上の印は同じ残敵を読む。退いた兵や建物は追わせない。
const passFighter = EC_FUCHU.fighter;
const PASS_COURTS = ['kannon', 'kinome_sou', 'kinome_fuku', 'kinome_hon'];
function passZone(rt) {
  const F = rt.flags;
  const zones = F.SZ?.byId;
  if (!zones) return null;
  // 勝ちの判定と同じく、制圧済みでも残敵が戻った手前の郭へ案内する。
  for (const id of PASS_COURTS) {
    const zone = zones[id];
    if (zone && (zone.owner !== 'friend' || zone.enemies > 0 ||
        id === 'kinome_fuku' && EC_SEIEI.active(rt))) return zone;
  }
  return zones.kinome_hon;
}

// 本道の小勢は、塀で隔てられていない寄せ手を開門前でも迎え撃つ。
function passRoadEngage(rt) {
  const F = rt.flags;
  if (rt.t < F.roadEngageAt) return;
  F.roadEngageAt = rt.t + .5;
  for (const b of F.roadGuards || []) {
    const g = b.real;
    if (!g?.count || g.routed || b._roadEngaged) continue;
    const p = rt.player.u.pos, a = F.ake?.pos, c = b.pos;
    const near = Math.hypot(c.x - p.x, c.z - p.z) < 45 && !rt.army.wallBetween(c, -1, p, false) ||
      a && Math.hypot(c.x - a.x, c.z - a.z) < 35 && !rt.army.wallBetween(c, -1, a, false) ||
      rt.army.units.some(u => u.team === rt.player.u.team && EC_FUCHU.pursuer(u) &&
        Math.hypot(c.x - u.pos.x, c.z - u.pos.z) < 35 &&
        !rt.army.wallBetween(c, -1, u.pos, false));
    if (!near) continue;
    b._roadEngaged = true;
    g.stay = false;
    b.order({ id: 'attack' });
  }
}
function passGate(rt) {
  const F = rt.flags, zone = passZone(rt);
  return zone === F.SZ?.byId.kannon ? F.gateKannon
    : zone === F.SZ?.byId.kinome_sou ? F.gateKinome : null;
}
function passNearestFoe(rt) {
  const F = rt.flags, me = rt.player.u, zone = passZone(rt);
  const opening = !F.step;
  if (!opening && (!zone?.test(me.pos.x, me.pos.z) || passGate(rt)?.struct.alive)) return null;
  // 四分の一秒ごとに探索し、討った瞬間は間引きを待たず選び直す。
  const previous = F.passFoe;
  const openingGroup = F.roadGuards?.[0]?.real, sallyGroup = F.gateSally?.real;
  const previousReady = passFighter(previous) && (opening
    ? previous.group === openingGroup || previous.group === sallyGroup : zone.test(previous.pos.x, previous.pos.z));
  if (rt.t < F.passFoeAt && F.passFoeZone === zone && F.passFoeOpening === opening &&
      (previous === null || previousReady)) return previous;
  F.passFoeAt = rt.t + .25; F.passFoeZone = zone; F.passFoeOpening = opening;
  let best = Infinity, chosen = null;
  for (const u of rt.army.units) {
    if (!passFighter(u) || u.team === me.team || u.invuln ||
        (opening ? u.group !== openingGroup && u.group !== sallyGroup : !zone.test(u.pos.x, u.pos.z))) continue;
    // 同じ郭にいるなら、壁越しの近い兵より通れる所の守兵を先にする。
    const d = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2 +
      (rt.army.wallBetween(me.pos, -1, u.pos, false) ? 1000000 : 0);
    if (d < best) { best = d; chosen = u; }
  }
  // 並んだ二人の前後が少し入れ替わっても、印をちらつかせない。
  if (chosen && previousReady && !rt.army.wallBetween(me.pos, -1, previous.pos, false) && F.passFoeZone === zone &&
      Math.sqrt(best) + 2 >= Math.hypot(previous.pos.x - me.pos.x, previous.pos.z - me.pos.z)) chosen = previous;
  F.passFoe = chosen;
  return chosen;
}

const echizen = Object.defineProperties({}, Object.getOwnPropertyDescriptors(kinome));
// 稲生と同じ共有の仕組みを使い、任務以外の指図・歩数・白い輪を出さない。
// 11/1：共通の既定（本人へ四人が同時・一太刀五割）で bot が倒れて負けた。一太刀を一割八分に、刃の後4秒は次を通さず、同時に打つのは二人まで（木ノ芽峠の登録は変えない）
Object.assign(echizen, { cutFloor: 0.35, meleeGrace: { rate: 1, burst: 1, interval: 4 }, world: { ...kinome.world, playerAtkMax: 2 } });
// 11/8 critic60 echizen（九1・五6）：右上の目標の札に小さな地図がかぶさり、字が半分隠れた。画面に出すのはピン・名・人数・目標・命だけ（Simple）。小さな地図を出さない
echizen.noMiniMap = true;
Object.assign(echizen, {
  goalSignOnly: true,   // 11/4 p100_echizen（AL・AV15・⑧）：行き先の印は頭上の金の▼一つだけ（白い大きな矢印を重ねない）
  missionSingleLine: true, goalsAllRows: true, hideMissionDots: true, hideGuideSteps: true,
  noPlayerFoot: true, quietMiss: true, noSiegeCards: true, noDodgeCard: true,
  nearbyAllySignLimit: 0, enemyTriangleSigns: true, mapMissionEnemy: true,
  nameRange: 240,   // 峠の二陣・本陣と殿の将の名を、近づく前から共通の名札に出す。
  waitForPortrait: true,   // 保存した顔が無い時は黒い影を出さず、本人の顔を撮って一度だけ出す。
  missionPinCaption: '', missionDetail: () => '', missionStatus: () => '',
  missions: ['観音丸の木戸前を守れ', '味方と木戸へ進め', '観音丸の木戸を破れ', '観音丸の郭へ進め', '観音丸の守兵を討て', '観音丸に味方を集めよ', '峠道の殿を討て'],
  missionOf(rt) {
    if (rt.flags.echAdv) return 6;
    if (!rt.flags.step) return 0;
    const gate = passGate(rt)?.struct, me = rt.player.u.pos, zone = passZone(rt);
    if (gate?.alive) {
      const hand = rt.interacts.find(it => it.id === '_gram');
      const at = hand && (typeof hand.pos === 'function' ? hand.pos() : hand.pos);
      return at && Math.hypot(at.x - me.x, at.z - me.z) < hand.r ? 2 : 1;
    }
    if (!zone?.test(me.x, me.z)) return 3;
    if (passNearestFoe(rt)) return 4;
    return zone.friends < zone.need ? 5 : 0;
  },
  missionHeading(rt) {
    if (rt.flags.ending || rt.over) return rt.tracker.main ? '峠を取った' : '味方と退け';
    if (rt.flags.echFuchu) return '峠道を追い、踏みとどまる一揆勢を討つ';
    const foe = this.missionSignTarget(rt);
    if (foe?.name) return `${foe.name}を倒せ`;
    const stage = this.missionOf(rt);
    if (rt.flags.echAdv) return this.missions[stage];
    const place = passZone(rt) === rt.flags.SZ?.byId.kannon ? '観音丸' : '木ノ芽峠城';
    if (stage === 0 && rt.flags.step) return `${place}の郭を味方と守れ`;
    if (stage === 1) return `${place}の木戸へ味方と進め`;
    return this.missions[stage].replaceAll('観音丸', place);
  },
  // 阿波賀三郎は鉢伏の守将。本道の任務を遠い別の城へ向けない。
  commanderTarget(rt) {
    const u = rt.flags.d?.hachibuseHon?.taishoU, p = rt.player.u.pos;
    return !rt.over && !rt.flags.ending && !rt.flags.echAdv && passFighter(u) &&
      Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 35 ? u : null;
  },
  missionSignTarget(rt) { return rt.flags.echAdv ? echTailTarget(rt) : this.commanderTarget(rt) || passNearestFoe(rt); },
  namedGuideTarget(rt) { return this.commanderTarget(rt); },
  missionPin(rt) {
    const F = rt.flags, me = rt.player.u.pos;
    if (rt.over || F.ending || !rt.player.u.alive) return null;
    const q = F.passPin || (F.passPin = { x: 0, z: 0, r: 3, hide: 3 });
    const zone = passZone(rt), gate = passGate(rt)?.struct, stage = this.missionOf(rt);
    const enemy = this.missionSignTarget(rt);
    q.unit = null; q.enemy = false; q.route = false; q.waiting = false; q.arrived = false;
    q.defend = false; q.always = false; q.approach = false; q.silent = true;
    q.r = q.hide = 3;
    let pos;
    if (F.echAdv && enemy && !F.echExitAt) {
      // 木ノ芽峠城の木戸内の殿：近い一人を指す
      pos = enemy.pos; q.unit = enemy; q.enemy = true; q.approach = true; q.r = q.hide = .2;
    } else if (F.echAdv) {
      // 落城後は峠道の木ノ芽峠城の木戸、殿を崩した後は勝ちの判定と同じ北口を指す。
      if (!F.echExitAt) return null;
      pos = rt.world.def.moveWay(rt.army, rt.player.u, F.echExitAt);
      q.route = true; q.r = q.hide = .5;
    } else if (!F.step) {
      // 本人の働きが必要な相手を指す。味方が討ち切った後は木戸へ進める。
      if (enemy) {
        pos = enemy.pos; q.unit = enemy; q.enemy = q.approach = true; q.r = q.hide = .2;
      } else if (gate?.alive) {
        const s = gate.seg;
        pos = s ? { x: (s[0] + s[2]) / 2, z: (s[1] + s[3]) / 2 - 2 } : gate.pos;
        q.r = q.hide = .5;
      } else {
        pos = F.echizenCourtPoint(); q.route = true; q.r = q.hide = .5;
      }
    } else if (enemy) {
      // 刃の届く間も行き先を消さず、同じ守兵を指し続ける。
      pos = enemy.pos;
      q.unit = enemy; q.enemy = true; q.approach = true; q.r = q.hide = .2;
    } else if (gate?.alive) {
      const hand = rt.interacts.find(it => it.id === '_gram');
      pos = stage === 2 && hand ? (typeof hand.pos === 'function' ? hand.pos() : hand.pos) : F.roadPoint;
      q.r = q.hide = .5;
    } else if (!zone.test(me.x, me.z)) {
      // 奥の郭へも山道をたどる。木戸内の制圧後に中心へ直進させると、
      // 塀がなくても急斜面へ迷い込み、味方から離れてしまう。
      pos = zone === F.SZ.byId.kannon || zone === F.SZ.byId.kinome_sou
        ? F.echizenCourtPoint() : rt.world.def.runnerWay(rt.army, rt.player.u, zone.pos);
      q.r = q.hide = .5; q.route = true;
    } else {
      // 味方の列が目指す郭の中を、集合・守備とも同じ固定のピンで示す。
      pos = zone.pos;
      q.r = q.hide = 8;
      q.waiting = q.defend = stage === 0 || stage === 5;
    }
    if (!pos) return null;
    q.x = pos.x; q.z = pos.z;
    // 柵・小郭を挟む時は既存の通れる道を使う。敵本人へ直進する印にしない。
    if (!q.waiting && !q.route && rt.army.wallBetween(rt.player.u.pos, -1, pos, false)) {
      const way = rt.world.def.runnerWay(rt.army, rt.player.u, pos);
      q.x = way.x; q.z = way.z; q.unit = null; q.enemy = false; q.route = true; q.r = q.hide = .5;
    }
    q.arrived = q.waiting && Math.hypot(q.x - me.x, q.z - me.z) < q.r;
    return q;
  },
  bannerAllowed: (rt, text) => rt.over || !!rt.flags.ending || /討ち取|討死|落城/.test(text),
});
// 『信長公記』巻八：十五日は風雨。光秀・秀吉は海側、信長は敦賀。
// https://ja.wikisource.org/wiki/信長公記#巻八（七）越前御進発賀越両国被仰付之事
// 峠口の各備を特定の将に割り振る根拠はないので、共通の織田の旗にする。
echizen.passAttackFlag = 'oda';
// 11/4 p100_echizen（AA・AF・AQ3・④⑥）：峠口で戦う備えは全員を本物の兵にする（遠景の兵の並びを近くに残さない）。
//   織田三万余に一揆は記録なし（docs/battle_refs/echizen.md）。木戸の前と観音丸では織田の先手が一揆勢のおよそ一倍半。
//   奥の城の守りは本物を四人ずつにして枠を空け、東西の別手にも制圧に要る兵を残す。
const PASS_BUTAI = {
  '織田の先手（峠口）': 64, '織田の先手（東の別手）': 20, '織田の西の別働': 12,
  '観音丸城の守兵': 40, '木戸前に打って出た一揆勢': 24,
};
// 11/5 fix61：一戦が二分で終わっていた（kaito 一の5・二の5）。観音丸の北口から上の峠道（九十九折り）の登り口に、
//   退く一揆勢の殿（しんがり）を本物の二十八人で置く（部隊の遠近の入れ替えをしない常の組。遠くで仮の姿に替わらない）。
//   殿の場所と数は推定（史料は「峠の一揆勢は府中へ退いた」だけ。docs/battle_refs/echizen.md）。
const TAIL_FROM = ROAD[ROAD.findIndex(p => p[1] === EXIT_KANNON[1]) + 1];
// 折れ目の先は横の傾きが急で槍を交えられない（高さ七メートル違いで刃が届かず、bot が四分立ち往生した）。
//   北口から折れ目までの真っすぐな登り（道の横が緩い）の上の方に構える。
const TAIL_AT = { x: EXIT_KANNON[0] + (TAIL_FROM[0] - EXIT_KANNON[0]) * .6, z: EXIT_KANNON[1] + (TAIL_FROM[1] - EXIT_KANNON[1]) * .6 };
const TAIL_FACING = Math.atan2(EXIT_KANNON[0] - TAIL_AT.x, EXIT_KANNON[1] - TAIL_AT.z);   // 坂の下の観音丸の北口を向く
// 一揆勢の姿：素の小袖に鉢巻（甲冑・陣笠を着ない。長島の門徒と同じ作り。docs/battle_learn/echizen.md「粗末な腹巻・鉢巻・素の小袖」）
const IKKO_KOSODE = { kosode: 1, kosodeCol: 0x484339, cloth: 0x34332e, hat: 'hachimaki', sode: false, kote: 0, menpo: 0 };
echizen.passButai = (o) => {
  const n = PASS_BUTAI[o.name];
  // 11/6 fixc0917_echizen：木戸前と観音丸の一揆勢を織田の足軽と同じ陣笠・桶側胴にしない
  if (n && o.team === 1) return { nominal: n, real: n, maxReal: n, nearReal: n, look: IKKO_KOSODE };
  if (n) return { nominal: n, real: n, maxReal: n, nearReal: n };
  if (o.team === 1 && !o._roadPost && !/本道/.test(o.name || '')) return { real: Math.min(4, o.nominal || 4), maxReal: 4, nearReal: 4 };
  return null;
};
// 観音丸の入口は土の坂を見せる。推定の敷石を黒い横板として重ねない。
echizen.earthenGateApproach = true;
// 11/6 fix4_echizen（専門家の目・五1）：布陣図に「推定」「名は不明」の断り書きを出さない。峠口の大将は丹羽長秀（天正三年七月に惟住の姓を賜る）、
//   木ノ芽峠の一揆の将は石田の西光寺真敬（信長公記「木目峠、石田の西光寺」・福井県史「石田西光寺真敬も木ノ芽峠で戦死」）。
const JIN_ODA = { hq: ['峠口の本陣', '丹羽長秀'], akechi: ['先手（観音丸の木戸）', '先手の組頭'], hashiba: ['東尾根の別手', '別手の組頭'], west: ['西尾根の別手', '別手の組頭'], reserve: ['後備え', '後備えの組頭'] };
const JIN_IKKO = { kannon: '観音丸の衆徒', sou: '西光寺の衆徒', fuku: '西光寺の衆徒', saikoji: '西光寺の衆徒',saikojiMae: '本覚寺の衆徒', saikojiHon: '本覚寺の衆徒', hachibuseMae: '専修寺の衆徒', ambush: '東尾根の衆徒' };
echizen.jinkei = kinome.jinkei.map(plan => plan.team === 0 ? {
  ...plan, name: '峠口の寄せ', source: '', numbers: '',
  sonae: plan.sonae.map(s => ({ ...s, flag: 'oda', mon: 'oda', role: JIN_ODA[s.id]?.[0] || s.role, general: JIN_ODA[s.id]?.[1] || s.general })),
} : {
  ...plan, name: '木ノ芽峠の城砦群', source: '', numbers: '',
  sonae: plan.sonae.map(s => ({ ...s, role: String(s.role).replace(/木の芽/g, '木ノ芽'), general: JIN_IKKO[s.id] || s.general })),
});
echizen.sides = {
  a: { name: '織田勢（峠口）', mon: 'oda' },
  b: { name: '越前一向一揆', mon: 'namu' },
};
echizen.date = () => '天正三年（1575）八月十五日　風雨';
// 11/6 fixc0917_echizen（kaito 十1・五4・十二1）：始まりの札の「勝つには」を右上の五つの終わり（⑤）とそろえ、両軍の規模も札に書く
echizen.introGoal = '観音丸・木ノ芽峠城・西光寺丸・鉢伏城を味方と押さえ、峠道の西光寺真敬を討ち取り、残る一揆勢を追って討つ';
echizen.introSides = { a: '織田勢　三万余', b: '越前一向一揆　二万' };
// 上の数の棒（kaito 一1・十二1・十二2「380 対 308」「266 から 68 へ一度に減る」「殿の間ずっと 68」）：
//   両軍の規模（織田 三万余・一揆 二万。army_scale.js と同じ）を出し、描く兵が討たれるたびに減る。観音丸が落ちた後は、
//   峠の砦を捨てて府中へ退く一揆勢の分だけ少しずつ減る（一度に跳ばない）
echizen.force = (rt) => {
  const F = rt.flags;
  const retreatT = F.echRetreatT ?? (F.echAdv ? F.echAdvT : null);
  const fled = retreatT == null ? 0 : Math.min(9000, Math.max(0, rt.t - retreatT) * 60);
  return { a: Math.max(0, 30000 - (F.ak || 0) * 8), a0: 30000, b: Math.max(0, 20000 - (F.ek || 0) * 15 - fled), b0: 20000 };
};
// 木戸・柵・民は兵の討死ではない。共通の討取り通知には建物の破壊も届く。
echizen.onKill = function (rt, victim) {
  if (victim.isStruct || victim.civ || victim.type === 'dummy' || victim.type === 'porter') return;
  return kinome.onKill.call(this, rt, victim);
};
// ④で北口を出た本人を「前に出すぎ」と叱らない（目標の行き先どおりに進んでいる。kaito 一5・九4）
echizen.noLeaderFollow = (rt) => !!rt.flags.echAdv || !!(rt.flags.gateKannon && !rt.flags.gateKannon.struct.alive);   // 木戸が開いた後（郭へ入れ・北口を出よ）も
echizen.mapNotes = rt => rt.flags.echizenMapNotes;
echizen.history = '天正三年八月十五日、強い風雨の中、織田勢三万余が敦賀から越前へ攻め入った。信長は敦賀にいた。海の側の杉津口は明智光秀・羽柴秀吉らが破り、堀江景忠が寝返って、一揆の大将の下間頼照は逃げた。その夜、府中の龍門寺が焼かれ、木ノ芽峠・鉢伏・今城・火燧の一揆勢は峠を捨てて府中へ退き、待ち受けた羽柴・明智の手に討たれた。木ノ芽峠を守った石田の西光寺真敬も峠で討死したと寺の由緒書は伝える。';
// 北陸道の関門と寺院衆徒の守備は『福井県史』による。
// https://www.library-archives.pref.fukui.lg.jp/fukui/07/kenshi/T2/T2-5-01-03-01-10.htm
// 民の人数・里の位置・細道は推定。城下町や江戸期の茶屋を峠に足さない。
// 既存の麓の里（-130, -970）と敦賀側の街道に置き、城の堂の守兵とは別にする。
const lowerTurn = ROAD[3], lowerBack = ROAD[2];
const lowerLength = Math.hypot(lowerBack[0] - lowerTurn[0], lowerBack[1] - lowerTurn[1]);
const peopleWatch = [lowerTurn[0] + (lowerBack[0] - lowerTurn[0]) * 30 / lowerLength,
  lowerTurn[1] + (lowerBack[1] - lowerTurn[1]) * 30 / lowerLength];
// 九十九折りを逆に下る。麓では谷川の東岸を保ち、後詰の陣も横切らない。
const PEOPLE_PATHS = [
  [peopleWatch, ...ROAD.slice(0, 3).reverse(), [-80, -890], [-92, -920], [-92, -1052]],
  [[-92, -952], [-92, -1052]],
  [[-130, -993], [-110, -1008], [-92, -1020], [-92, -1052]],
];
const peopleRoute = path => path.slice(1).map(([x, z]) => ({ x, z }));
echizen.civilianCrowd = {
  bounds: { minX: -220, maxX: 180, minZ: -1058, maxZ: -610 },
  fireSize: 1,
  bands: [
    { x: peopleWatch[0], z: peopleWatch[1], kinds: ['merchant', 'townsman', 'monk', 'farmer'],
      mode: 'watch', route: peopleRoute(PEOPLE_PATHS[0]) },
    { x: -92, z: -952, kinds: ['farmer', 'woman', 'child', 'elder'],
      mode: 'watch', route: peopleRoute(PEOPLE_PATHS[1]) },
    { x: -130, z: -993, kinds: ['farmer', 'woman', 'child'],
      mode: 'watch', route: peopleRoute(PEOPLE_PATHS[2]) },
  ],
};
// 民は war_people の共有形で描く。兵の名簿・戦功・当たりには加えない。
const ECHIZEN_PATHS = [...KINOME_ROADS, ...PEOPLE_PATHS];
function peoplePathDistance(x, z) {
  let d = Infinity;
  for (const path of PEOPLE_PATHS) d = Math.min(d, distToPolyline(x, z, path));
  return d;
}
// 押さえた郭の入口へ戻さず、奥の口から先の道を案内する。
const kannonRoadStart = ROAD.findIndex(p => p[1] === EXIT_KANNON[1]);
const kinomeRoadStart = ROAD.findIndex(p => p[1] >= EXIT_KINOME[1]);
// 次の木戸へ進む時だけ、確保した郭の奥の口から先を歩く。
// 退避や使番の経路には使わず、配列は準備時から使い回す。
const kannonForwardPaths = [ROAD.slice(kannonRoadStart)];
const kinomeForwardPaths = [[EXIT_KINOME, ...ROAD.slice(kinomeRoadStart)]];
echizen.roadGuideStart = rt => rt.flags.souFell ? kinomeRoadStart
  : rt.flags.kannonFell ? kannonRoadStart : 0;
// まだ越えていない木戸より先の道へ投影すると、折れ目と残り距離が逆戻りする。
echizen.boundRoadGuide = true;
// 11/6 fix4_echizen（五4）：始まりの札は二三行だけ。操作の案内は書かない
echizen.introText = () => '風雨の峠道。観音丸の木戸から一揆勢が打って出る。返して付け入り、郭を取れ。';
// 背の低い横画面でも、人物紹介より先に最初の下知と勝つ条件を読む。
echizen.introTaskFirst = true;
// 人物名だけが釦の上で切れないよう、紹介は自分で開いて読む。
echizen.introPeopleFolded = true;
// 横画面で用語の説明が軍名を押し下げないよう、開始札だけ短くする。
// 両軍の名と規模は上（introSides）で一度だけ決める
echizen.immediateTaskChanges = true;
echizen.reserveCombatCues = true;
// 最初は敵を受ける持ち場。共通の移動練習や近い敵の札で下知を消さない。
echizen.keepOpeningTaskLabel = true;
echizen.keepTaskLabel = true;
// 接敵中も、城内の任務を携帯用の「旗へなぞる」で置き換えない。
echizen.keepCombatTask = true;
echizen.keepCombatTaskDetail = true;
echizen.keepCombatTaskHeading = true;
echizen.keepDestinationTask = true;
// 構える操作で制圧や進軍の下知を消さない。釦は地面の兵を追わず指元へ固定する。
echizen.keepTaskWithGuard = true;
echizen.compactWaitGuard = true;
// 遠い守兵に反応して、何もいない平場で構え続ける案内を出さない。
// 押し始めた構えは、本人が指を離すまで保つ。
echizen.waitGuardAllowed = (rt, enemy) => {
  if (rt.hud.waitGuardHeldBattle === rt || !rt.flags.step) return true;
  const u = rt.player.u;
  return !!enemy?.alive && Math.abs(enemy.pos.y - u.pos.y) < 3 &&
    Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) <= (enemy.reach || 2) + 2 &&
    !rt.army.wallBetween(u.pos, -1, enemy.pos, false);
};
echizen.openingWait = rt => !rt.flags.step;
echizen.taskText = (rt, text) => {
  if (text === '味方のそばで構え、門外の小勢を受けよ')
    return `味方の旗へ。${passGuardAction()}`;
  // 「次の木戸」だけでは、確保した観音丸へ戻るのか区別できない。
  if (text === '本道の印へ。次の木戸へ進め')
    return '本道から木の芽峠城へ';
  if (text === '進み太鼓と法螺貝。竹束と木戸へ進み、味方と中の敵を討て')
    return '竹束と木戸へ。開いたら味方と中へ';
  // 届かない所で長押しを促さない。掛矢に届いた時の指図だけ操作名へ替える。
  if (text === '木戸の前へ。味方と進め') return '木戸へ。味方と進め';
  if (text === '「打つ」を長押しして木戸を破れ') return '木戸を打ち破れ';
  return text;
};
// 峠の補正で視点を動かした後も、味方の胴や馬の内側から見せない。
echizen.nearAllySolidBody = true;
// 門の屋根や柵を画面中央の長方形で切り抜かない。
// 目の直前の部材は共通の距離判定と、この戦の門の透かしで避ける。
echizen.nearSceneryScreenCut = false;
// 七メートルより後ろの長槍も、穂先は肩越しの視点まで届く。
// 既存の遮り判定の探索だけ広げ、兵と槍の当たりは変えない。
echizen.nearLongWeaponRadius = 10;
// 落ち槍は持ち手から離れて残る。穂先が届く十メートルまで遮りを調べる。
echizen.nearGroundSpearRadius = 10;
echizen.nearGroundSpearClearance = .8;
// 自分の構えた槍を旗と同じ遮蔽物として消すと、素手で戦って見える。
// 既存の指定で本人の槍を残す。周りの長柄を避ける判定と当たりは保つ。
echizen.keepPlayerWeapon = true;
// 携帯横で大きな矢印が兵の胴を覆わないよう、既存の小さい移動印を使う。
echizen.compactDestinationSign = true;
echizen.compactTravelArrow = true;
// 間近の敵を太い額縁で覆わず、細い四隅と刀の印で示す。
// 押せる攻撃札の大きさ・敵の選び方・当たりは既存のまま。
echizen.cornerEnemyGuide = true;
echizen.subtleTargetFrames = true;
// 線画の人型は接写で本人から離れて見える。敵の印と自分の足元の輪で区別する。
echizen.noUnitContrast = true;
echizen.compactPlayerSign = true;
// 小さい輪の下限も渡す。短縮の指定だけでは共通の大きな輪が残る。
echizen.playerSignMinScale = .4;
echizen.playerSignScale = .65;
// 足元の輪と別に本人を額縁で囲まず、目前の敵の四隅を残す。
echizen.playerFootSignOnly = true;
// 急坂で手前へ広がる輪は画面の三分の一まで。十字の手当て印は残す。
echizen.compactDestinationArea = true;
echizen.compactFloorGuides = true;
echizen.groundCombatMarkers = true;
// 退く先と敵を、画面を横切る一本の帯でつながない。
// 指元の短い矢印と退避先の小さい旗を残し、兵の姿と足場を空ける。
echizen.shortRetreatGesture = true;
// 現在の描画はこの長さを読む。古い短縮指定だけでは旗まで太い線が残る。
echizen.retreatLinkLength = 72;
echizen.retreatArrowLength = 72;
// 現在の画面側が読む指定。古い指定だけでは、退避先まで長い点線が残る。
echizen.singleRetreatArrow = true;
echizen.compactRetreatSign = true;
echizen.compactRetreatArea = true;
echizen.compactCombatGuides = true;
// 「ここへ」だけでは退く理由が分からない。傷・包囲と次の行動を残す。
echizen.keepRetreatReason = true;
// 携帯のなぞる操作も補足へ置き、退く理由を本文に残す。
echizen.keepRetreatGestureReason = true;
// 出血中の共通の短縮でも、深手・囲まれた理由と退く先を残す。
echizen.keepWoundRetreatReason = true;
// 残り歩数は退く輪の縁までを一度だけ示す。着いた後は木戸の距離を混ぜない。
echizen.singleRetreatDistance = true;
// 止血後の小さな手足の傷だけで、攻城の下知を退避へ替え続けない。
// 傷の効き目と、出血・深手・包囲・息切れによる退避は共通の判定を保つ。
echizen.retreatForLimbWounds = false;
// 手当ての陰が見つからなくても、通常の退き先を毎回足元から動かさない。
echizen.separateTreatmentRetreat = true;
// 包囲から逃げる間も、布が残る負傷者は止血できる味方の後ろへ導く。
// 退き太鼓で指定された本道は、その下知を優先する。
echizen.preferTreatmentRetreat = rt => !rt.flags.retreatMarked &&
  rt.missionGuide?.marker?.guideArea !== 'retreat';
// 道の帯に重なるだけで急斜面も歩ける扱いになる。退避の印と自動操作は
// 実際の勾配も調べ、本道の脇の切岸へ逃がさない。地形と進軍の道は保つ。
echizen.retreatPointAllowed = (rt, point) => {
  const W = rt.world, p = rt.player.u.pos;
  const slope = W.slopeTan(point.x, point.z);
  if (slope <= .7) return true;
  // 押し出されて既に急坂へ乗った時まで全方向を拒むと、本道へ戻れない。
  // 今より急でない足場へ、等高線に沿って戻る歩みだけ残す。
  // 高低差・途中の段差・柵は共通の退避探索と下の経路判定でも調べる。
  if (slope > W.slopeTan(p.x, p.z) + .001) return false;
  const y = groundAt(W, point.x, point.z, p.y);
  return Math.abs(y - p.y) <= Math.hypot(point.x - p.x, point.z - p.z) * .7 + .15;
};
// 広い曲輪では、道の近さだけでは味方から離れる退避を止められない。
// 同じ足場で支えられる味方を半秒ごとに一人探し、その周りを退き先にする。
// 手当ての陰と退き太鼓の行き先は、それぞれ既存の下知を優先する。
function passRetreatSupportAllowed(rt, point) {
  if (rt.hud.retreatGuide?.treatment || rt.flags.retreatMarked ||
      rt.missionGuide?.marker?.guideArea === 'retreat') return true;
  const u = rt.player.u, p = u.pos;
  const support = rt.flags.echizenRetreatSupport ||
    (rt.flags.echizenRetreatSupport = { at: -1, ally: null });
  if (rt.t >= support.at || support.ally && (!support.ally.alive || support.ally.gone || support.ally.fleeing)) {
    support.at = rt.t + .5; support.ally = null;
    let best = 64;
    for (const a of rt.army.units) {
      if (a === u || !a.alive || a.gone || a.fleeing || a.woundOut || a.noTarget || a.civ ||
          a.isStruct || a.farSim || a.downed || a.group?.hidden || a.group?.routed ||
          a.type === 'dummy' || a.type === 'porter' || a.team !== u.team || Math.abs(a.pos.y - p.y) >= 3) continue;
      const distance = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (distance >= best || rt.army.wallBetween(p, -1, a.pos) || rt.army.terrainBlocks(p, a.pos)) continue;
      best = distance; support.ally = a;
    }
  }
  const a = support.ally;
  if (!a) return true;
  // 味方のすぐ後ろへ四メートル退く余地は残す。
  // 既に孤立している時は、今より味方から離れる旗を出さない。
  const margin = Math.max(12, Math.hypot(a.pos.x - p.x, a.pos.z - p.z));
  return Math.hypot(point.x - a.pos.x, point.z - a.pos.z) <= margin;
}
echizen.botRetreatStepAllowed = (rt, point) => {
  const p = rt.player.u.pos, length = Math.hypot(point.x - p.x, point.z - p.z);
  if (rt.army.wallBetween(p, -1, point)) return false;
  if (!passRetreatSupportAllowed(rt, point)) return false;
  // 勾配だけで選ぶと、追う敵から離れるたびに本道と味方からも離れていく。
  // 道肩と郭で退き先を探す。既に外へ押された時は、戻れる方向を残す。
  const routeMargin = Math.max(6, passRetreatDistance(p.x, p.z) + .05);
  if (passRetreatDistance(point.x, point.z) > routeMargin) return false;
  // 線だけ通っても、肩が柵の端へ当たる道には退く印を置かない。
  // 既に柵へ寄っている時は、今より離れる歩みを認める。
  const route = rt.flags.echizenRetreatSegment || (rt.flags.echizenRetreatSegment = [0, 0, 0, 0]);
  route[0] = p.x; route[1] = p.z; route[2] = point.x; route[3] = point.z;
  for (const s of rt.army.structs) {
    if (!s.alive || s.opened || !s.seg || s.yTop != null && p.y >= s.yTop - .05) continue;
    const clearance = Math.min(.6, distToSeg(p.x, p.z, s.seg));
    const distance = Math.min(distToSeg(point.x, point.z, s.seg),
      distToSeg(s.seg[0], s.seg[1], route), distToSeg(s.seg[2], s.seg[3], route));
    if (distance < clearance - .001) return false;
  }
  const steps = Math.max(1, Math.ceil(length / .75));
  const sample = rt.flags.echizenRetreatSample || (rt.flags.echizenRetreatSample = { x: 0, z: 0 });
  let previous = groundAt(rt.world, p.x, p.z, p.y);
  for (let i = 1; i <= steps; i++) {
    sample.x = p.x + (point.x - p.x) * i / steps;
    sample.z = p.z + (point.z - p.z) * i / steps;
    // 折れた道の別の段へ直線で逃がさず、途中も道肩か郭を通す。
    if (passRetreatDistance(sample.x, sample.z) > routeMargin) return false;
    const y = groundAt(rt.world, sample.x, sample.z, previous);
    sample.y = y;
    if (!rt.world.walkable(sample.x, sample.z, y) || !echizen.retreatPointAllowed(rt, sample) ||
        Math.abs(y - previous) > length / steps * .7 + .15) return false;
    previous = y;
  }
  return true;
};
// 十字を出してから試し役だけが段差を拒むと、行けない印へ案内し続ける。
// 人が見る印も、同じ細かな足場と柵の判定を通す。
echizen.retreatPathAllowed = echizen.botRetreatStepAllowed;
echizen.retreatGroundAt = (rt, x, z, y) => groundAt(rt.world, x, z, y);
// 画面と試し役で別々の後方を探すと、印へ着かず歩き続ける。
// 半秒ごとに安全と足場を確かめた、画面の十字と同じ行き先を使う。
echizen.botTreatmentPoint = rt => {
  const point = rt.hud.retreatDestination(rt, null, true);
  return point?.valid && echizen.botRetreatStepAllowed(rt, point) ? point : null;
};
// 退く時も画面の印と同じ行き先を使う。別の味方へ向かって柵際に戻らない。
// 手当て先の探索と競合させず、画面が選んだ印を借りる。
echizen.botRetreatWay = (rt, back) => {
  const cue = rt.hud.retreatGuide;
  const point = cue?.active && cue.valid ? cue : rt.hud.retreatDestination(rt, null, false);
  if (point?.valid && echizen.botRetreatStepAllowed(rt, point)) return point;
  // 印が見つからない時の本道への戻りにも、柵・途中の勾配を調べる。
  // 使番の経路だけでは急坂への直進が残る。通れなければ構えてその場で待つ。
  const way = kinome.world.runnerWay(rt.army, rt.player.u, back);
  return echizen.botRetreatStepAllowed(rt, way) ? way : rt.player.u.pos;
};
// 「丸」は城の曲輪とも読める。十字の印が手当ての場所だと伝える。
echizen.treatmentApproachLabel = '十字へ退き、手当て';
// 共通の指なぞり案内で、十字を「旗」と呼び直さない。
echizen.treatmentMoveCaption = '十字へ退け。着いたら手当て';
echizen.treatmentTaskGuidance = true;
echizen.treatmentCrossSign = true;
// 移動中・画面外でも、手当て先を集合の旗に取り違えない。
echizen.treatmentDestinationCross = true;
// 手当ての待ち時間中も、まだ十字へ着いていない人を立ち止まらせない。
// 回復量・安全な場所の判定・再使用までの時間は変えない。
echizen.treatmentGuideLabel = (rt, cue) => {
  const p = rt.player;
  if (p.treatmentLeft <= 0) return '布は使い切った。構えて味方の後ろへ';
  if (p.mounted) return '馬を降りて手当て';
  if (p.treatmentReady) return p.treating ? '手当てをそのまま押し続けよ' : '「手当て」を三秒長押し';
  if (!cue?.valid) return '味方の旗へ退け。手当てには味方が要る';
  // 通常の退き先は手当ての十字ではない。実際に出ている印へ案内する。
  if (!cue.treatment) {
    if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius)
      return '味方の後ろへ。構えて退く印へ';
    return 'ここで構え、味方の後ろで手当て';
  }
  if (Math.hypot(cue.x - p.u.pos.x, cue.z - p.u.pos.z) >= cue.radius)
    return '十字へ退き、手当て';
  if (p.treatmentNext > rt.t)
    return `ここで待て。次の手当てまであと${Math.ceil(p.treatmentNext - rt.t)}秒`;
  if (p.aiming || p.draw > 0 || p.chargeT > 0) return '狙いを外し、ここで止まれ';
  if (Math.hypot(p.u.vel.x, p.u.vel.z) >= .3) return 'ここで足を止めて手当て';
  // 十字は敵と味方の位置から選んだ安全な場所。被弾直後の待ち時間を
  // 「敵が離れたら」と言い換えると、着いた人がまた歩き出してしまう。
  const wait = Math.max(0, 6 - p.u.lastHitT, p.inCombatT);
  if (wait > 0) return `ここで待て。手当てまであと${Math.ceil(wait)}秒`;
  return 'ここで止まれ。敵が離れたら手当て';
};
// 退避で本道の札を隠す間は、その理由と、止まってよい場所を伝える。
echizen.retreatGuideLabel = (rt, reached) => {
  if (rt.hud.retreatGuide?.treatment)
    return echizen.treatmentGuideLabel(rt, rt.hud.retreatGuide);
  // 退く印へ着いた後も出血中なら、使える手当てを先に伝える。
  // 安全・残り回数・待ち時間の判定は本人の準備済みの値を使う。
  if (reached && rt.player.treatmentReady)
    return rt.player.treating ? '手当てをそのまま押し続けよ' : '止まって「手当て」を三秒長押し';
  // 退避先が集合の旗でも、出血が止まったことにはならない。
  // 布が残る時は次の手当てまで伝え、構え続けるだけで終わらせない。
  if (reached && rt.player.u.wounds?.bleed > .0001 && rt.player.treatmentLeft > 0)
    return '構えて待て。敵が離れたら手当て';
  if (reached) return rt.player.sta < 20 ? 'ここで構え、息を整えよ' : 'ここで構え、敵を受けよ';
  // 通れる退避先がない間は、切岸へ向けて曖昧な移動を促さない。
  // 場所は従来どおり探し直し、道が通れば退く印の案内へ戻す。
  if (!rt.hud.retreatGuide?.valid)
    return '退く道がない。構えて味方を待て';
  // 構えを知らないまま旗へ背を向けて走らせない。構えるまでは操作名、
  // 構えた後は敵を向いたまま退く動作を、一枚の札で伝える。
  // 構えは自動で退く操作ではない。印へ向き直らず、後ろへ歩くことも伝える。
  const move = rt.player.guard ? '敵を向き、印へ後ろ歩き' : `${passGuardAction()}。印へ後ろ歩き`;
  if (rt.player.u.wounds?.bleed > .0001)
    return `血が出ておる。${move}`;
  const reason = rt.player.u.hp < rt.player.u.maxHp * .3 ? '深手じゃ' : rt.player.u.mobbed ? '囲まれた'
    : rt.player.sta < 20 ? '息を整えよ' : rt.flags.retreatMarked ? '退けとの下知じゃ'
      : rt.player.u.hp < rt.player.u.maxHp * .55 ? '傷が深い' : '敵が迫る';
  return `${reason}。${move}`;
};
// 遠くで木戸が開いても、柵を横切らせず本道から口へ案内する。
echizen.guideMarker = rt => {
  const F = rt.flags;
  if (!F.step) return 'ake';
  const gate = passGate(rt);
  if (F.echAdv || gate?.struct.alive) return 'road';
  return 'echizen-court';
};

// 越前の入口二郭だけを整える。共通の木ノ芽峠の定義や縄張りは変えない。
const courts = KINOME_PLAN.kuruwa.filter(k => k.id === 'kannon' || k.id === 'kinome_sou').map(k => {
  const x0 = Math.min(...k.poly.map(p => p[0])), x1 = Math.max(...k.poly.map(p => p[0]));
  const z0 = Math.min(...k.poly.map(p => p[1])), z1 = Math.max(...k.poly.map(p => p[1]));
  // 小郭が重なる所の八十センチ高い地面を、入口の床へ広げない。
  const y = kinomeCourtLevel(k);
  return { id: k.id, x0, x1, z0, z1, y, mouths: k.gapAt };
});

// 全郭の平場も退避に使う。境界は準備時に一度取り、探索中は数だけ読む。
const retreatCourts = KINOME_PLAN.kuruwa.map(k => ({
  x0: Math.min(...k.poly.map(p => p[0])), x1: Math.max(...k.poly.map(p => p[0])),
  z0: Math.min(...k.poly.map(p => p[1])), z1: Math.max(...k.poly.map(p => p[1])),
}));
function passRetreatDistance(x, z) {
  let d = Infinity;
  for (const c of retreatCourts) {
    d = Math.min(d, Math.hypot(Math.max(c.x0 - x, 0, x - c.x1),
      Math.max(c.z0 - z, 0, z - c.z1)));
    if (d === 0) return 0;
  }
  for (const path of KINOME_ROADS) d = Math.min(d, distToPolyline(x, z, path));
  return d;
}

// 身の回りの当時の場。天正三年八月十五日は今の九月半ば・大風雨（『信長公記』）。
// 北陸道の峠道はぬかるみ、轍と水たまり。木戸の前と郭の内ほど、倒れた槍・一揆方の白い旗・刺さった矢・折れた枝が多い。
echizen.timeslip = {
  wet: 1, dust: 0.05, trample: 0.3, debris: 1, arrows: 0.6, branches: 0.06,
  // 大風雨の暗い昼。水たまりが白い染み（雪）に見えないよう映りを落とし、泥も濡れた焦げ茶に。
  poolDim: 0.32, mudColor: 0x4a3e32,
  grass: 0x6e8a4a, grassTints: [0xffffff, 0xe0eac4, 0xc4d29c], grassH: 1.1, tallGrass: 0.85,
  flagColors: [0xece8dc, 0x24221e, 0x3a3428],
  fights: (rt) => {
    const F = rt.flags, out = [];
    for (const g of [F.gateKannon, F.gateKinome]) { const q = g?.struct?.seg; if (q) out.push([(q[0] + q[2]) / 2, (q[1] + q[3]) / 2, 30]); }
    for (const id of ['kannon', 'kinome_sou']) { const c = F.C?.kuruwa?.[id]?.centroid; if (c) out.push([c.x, c.z, 24]); }
    return out;
  },
};
// 峠口（観音丸の木戸の前）。寄せ手の来る道の向きと、道に直角の向き。配置は推定。
const ENTRY = (() => {
  const i = ROAD.findIndex(p => Math.hypot(p[0] - GATE_KANNON.x, p[1] - GATE_KANNON.z) < 1);
  const a = ROAD[Math.max(0, i - 1)], len = Math.hypot(a[0] - GATE_KANNON.x, a[1] - GATE_KANNON.z) || 1;
  const dx = (a[0] - GATE_KANNON.x) / len, dz = (a[1] - GATE_KANNON.z) / len;
  return { dx, dz, at: (d, o) => [GATE_KANNON.x + dx * d + dz * o, GATE_KANNON.z + dz * d - dx * o] };
})();
// 道の両脇の杉。林の共有の形を使い、道の上には置かない。
const ENTRY_CEDARS = [[14, 15], [14, -15], [26, 19], [26, -19], [38, 15], [38, -16]].map(([d, o]) => {
  const [x, z] = ENTRY.at(d, o);
  return { x, z, r: 3, n: 3, kind: 'sugi' };
});

echizen.world = {
  ...kinome.world,
  muddy: 0.45,   // 雨の峠道はぬかるむ（10/28）
  wetStart: 1,   // 前夜からの大風雨。開戦の時から土は濡れて暗い（乾いた黄土の一枚に見えていた。10/28）
  // 持ち場から見える右の斜面に杉と雑木の林（裸の草の斜面だった。10/28）。郭と道には木を置かない。
  // 大風雨（『信長公記』）。草木の揺れを強める。形と数は変えない。
  windStrength: 1.5,
  // 角の立つ八十面の岩でなく、丸みのある自然石の形を全画質で使う。
  roundRocks: true,
  paths: ECHIZEN_PATHS,
  // 逃げる細道を木で塞がず、里の家や谷川の当たりはそのまま読む。
  clear: (x, z) => kinome.world.clear(x, z) || peoplePathDistance(x, z) < 4,
  groves: [...(kinome.world.groves || []), ...ENTRY_CEDARS, { x: -30, z: -612, r: 9, n: 12 }, { x: -12, z: -611, r: 6, n: 7 }, { x: -50, z: -618, r: 10, n: 10 }, { x: -30, z: -630, r: 10, n: 10 },
    { x: -22, z: -597, r: 7, n: 8, kind: 'sugi' }, { x: -40, z: -592, r: 10, n: 12, kind: 'sugi' },
    // 峠の東の平場の奥（25秒で木戸を抜けた時の右手・正面の奥）も、雨に煙る杉林で閉じる（空いた灰の平らな野に見えていた。10/28）。
    { x: 45, z: -560, r: 10, n: 12, kind: 'sugi' }, { x: 72, z: -578, r: 11, n: 13, kind: 'sugi' }, { x: 66, z: -604, r: 10, n: 12, kind: 'sugi' },
    { x: 40, z: -618, r: 9, n: 10, kind: 'sugi' }, { x: 20, z: -548, r: 8, n: 9, kind: 'sugi' }, ...echizenValleyGroves(),
    // 峠の斜面の雑木（杉ばかりだった。10/29）。持ち場から木戸までの道の両肩と、木戸の先の右手。
    // 11/1：一つの輪に五本の雑木が重なり、持ち場の左手で一つの丸い塊に見えた。二本にして一本ずつの木に見せる。
    ...[[7, 15], [7, -15], [18, 25], [18, -25], [32, 27], [32, -28]].map(([d, o]) => { const [x, z] = ENTRY.at(d, o); return { x, z, r: 5, n: 2, kind: 'broad' }; }),
    { x: 28, z: -556, r: 7, n: 7, kind: 'broad' }, { x: 38, z: -540, r: 6, n: 5, kind: 'broad' }],
  valleyGroves: true,
  compactScenery: true,
  infantryWeight: true,
  groundPhoto: { dirt: 'kanegasaki', mudFromSoil: true },   // 10/30 c_ground_photo2：茶の一枚の土を戦ごとの写真（CC0）に。泥も同じ写真で絵は増やさない（林の道の落ち葉の土。金ヶ崎と同じ写真）
  noHaori: true,
  variedInfantry: true,
  variedLoanArmor: true,
  variedHeadgear: true,
  meleeGroundedFeet: true,
  contactShadows: true,
  groundedSlopeRocks: true,
  rockDrawGround: true,
  // 雨の峠を敷石に見せない。土塊の升の境で陰と凹凸を切らず、
  // 泥の窪みは踏まれた所へ絞る。既存の斑と材質を使う。
  softEarthCrust: true,
  subtleMudRelief: true,
  // 広い山へ薄めた草を道肩へ戻し、湿った裸地と群落をつなぐ。
  roadsideGrass: true,
  // 法線が曲がる道肩でも、土と草の模様の向きを保つ。
  stableSlopeGrain: true,
  // 道の留め木と根を、描く三角形の坂へ沿わせる。
  groundedPassDetails: true,
  // 推定の横板を九メートルごとに並べず、踏まれた土と道肩の根を見せる。
  noPassPlanks: true,
  curvedRockTufts: true,
  litRockTufts: true,
  variedMarch: true,
  livingSpearHedge: true,
  rearSpearSupport: true,
  reachableSpearGrip: true,
  // 門へ続く後列は、待機・移動中の長柄を立てて運ぶ。
  // 狙い・突き・受けは既存の姿へ戻し、人数と攻撃の判定は保つ。
  allySpearSpread: true,
  // 倒れた指物を坂に大きな板として残さず、共有の折れた布を使う。
  crumpledFlags: true,
  // 個別描画の遠い徒歩兵も、胴だけを浮かせず既存の軽い脚を残す。
  wholeInfantrySilhouette: true,
  // 骨入りの兵が遠目の姿へ替わる時も、草摺と臑当の間の袴を残す。
  // 脚の表示だけでは中の布が省かれる。既存の共有形へ含めて描く。
  completeCrowdLegs: true,
  // 急な谷へ大きな板の靄を立てず、地面と森に掛かる距離の霞を使う。
  groundMistScale: 0,
  // 風雨の峠に日差しの柱を足さない。開戦直後の雨量の立ち上がりにも適用する。
  noShafts: true,
  // 地図の外の山だけ霧を無視すると、雨空に灰色の板の輪郭が残る。
  // 峠の輪郭にも既存の距離の霞を掛ける。歩く山肌と縄張りは動かさない。
  passRidgeFog: true,
  // 雨空を切る遠景の幕は重ねず、歩ける山肌と空で峠を見せる。
  noPassRidges: true,
  // 道を下って近づける谷の杉も、黒い三角形で視界を塞がない。
  naturalValleyTrees: true,
  // 雨の跳ねを白い草むらのように大きく立てない。
  rainSplashScale: .4,
  // 遠い矢を太い黒棒へ拡大しない。射撃・当たり・風切りはそのまま。
  naturalArrowRain: true,
  // 胴や骨の倍率を刺さった矢へ重ねず、飛来時の長さを保つ。
  lifeSizePinnedArrows: true,
  pinnedArrowAxisScale: true,
  // 描く直前の体格変更にも、矢自身の行列更新で追従する。
  pinnedArrowRenderScale: true,
  // 本人に当たらない味方の援護射撃で、持ち場から退く案内を出さない。
  enemyArrowWarnings: true,
  // 外れ矢が門前に積もり、太い黒い破片の山に見えるのを避ける。
  // 飛んでいる矢・兵や物への当たり・兵に刺さる矢はそのまま。
  noGroundArrows: true,
  // 門の割れ木は一片ごとの木色を使い、二重の茶で黒い短冊にしない。
  naturalWoodDebris: true,
  // 坂で割れ木を水平に寝かせると、片端が浮き、反対側が土へ刺さる。
  // 着地した時だけ足元の傾きを読み、同じ破片の形を坂へ沿わせる。
  groundedWoodDebris: true,
  // 四隅の補間ではなく、目に見える土の三角形と郭の平場へ置く。
  groundDetailAt: passGroundAt,
  groundStains: true,
  // 杉の一直線の円錐を枝の段へ。既存の共有形を使い、木の数は増やさない。
  layeredNeedles: true,
  // 杉を木全体の交差した板（切り絵）へ替えず、枝房の奥行きを残す（10/28）。
  nearCedarBranches: true,
  raggedNeedles: true,
  brokenNeedleTiers: true,
  // 10/30 vis_h：杉の葉房が明るい黄緑の板の重ねに見えた（点付け）。比叡山の杉と同じ写真の葉房の作り（形・絵は共用）へそろえる。
  cedarBoughs: true, cedarBoughPitch: 1.3, cedarBoughWidth: 1.1, farCedarPitch: 1.0, keepNeedleLayers: true,
  // 画面が暗かった（点付け）。雨の峠の日と空の回り光を上げる（光の値だけ。霧の距離・見通しは変えない）。
  stormLift: 1.35,
  // 10/31 雨の日差しが真上から一様で、兵の顔と胴が平らだった。雲越しの日を斜めから当て、陰の側を残す。
  // 11/6 fixc0917_echizen（kaito「十五日は風雨なのに木の影と日の光がくっきり」）：日の光を弱め、空の明るさで照らす（影を立てない）
  stormLight: { sunI: 0.7, hemiI: 2.9, sunPos: [-70, 80, 55] },
  nightLift: 1.5,   // 観音丸を落とした後は夜（府中が焼かれた夜に峠の一揆勢が退いた）。月夜の兵が白く浮かないよう持ち上げを下限に
  // 兵だけの白い補光を止め、地面と同じ月光と篝火で照らす。人の形と材質は変えない。
  unitNightScale: 0, nightFill: .4, nightMoonMin: .5,
  unevenCrowns: true,
  // 遠景も枝の輪郭を崩し、雑木の重複頂点は一緒に動かして樹冠を裂かない。
  softFarNeedles: true,
  closedFarCrowns: true,
  // 木や据え物を置く前から、描く地面の三角形と同じ高さを読む。
  terrainTriangles: true,
  // 携帯でも足場と同じ格子を描く。粗い別の三角形が目線を覆わないようにする。
  keepTerrainGrid: true,
  // 11/6 fixc2220（critic60「峠が平らな野原に見える」）：郭と道の高さはそのまま、道から離れた左右の山肌だけを高くする。
  height(x, z) { return passCourtHeight.call(this, x, z) + passFlanks(x, z); },
};
function passCourtHeight(x, z) {
    const raw = kinome.world.height.call(this, x, z);
    for (const c of courts) {
      const outside = Math.hypot(Math.max(c.x0 - x, 0, x - c.x1),
        Math.max(c.z0 - z, 0, z - c.z1));
      if (outside >= 96) continue;
      const inside = Math.min(x - c.x0, c.x1 - x, z - c.z0, c.z1 - z);
      // 平場の直前だけ元の高い道を残すと、柵際に二十メートル以上の尾根ができる。
      // 門・奥の口は格子一つ分の肩まで平らに通す。
      // 三メートル幅の土塁は十五メートルの格子で尖るので、外側だけへ広げる。
      let mouth = 1;
      for (const [mx, mz] of c.mouths) {
        const t = Math.max(0, Math.min(1, (Math.hypot(x - mx, z - mz) - 16) / 16));
        mouth = Math.min(mouth, t * t * (3 - 2 * t));
      }
      const edge = Math.sin(Math.PI * Math.min(1, outside / 36));
      const bank = 1.3 * edge * edge * mouth;
      if (inside >= 0) return c.y + bank;
      // 粗い格子でも平場から道の肩へ連続する土の斜面を作る。
      // 郭の高さと床は動かさず、二郭から離れた山・堀・他の戦には触れない。
      const reach = outside * .4;
      const graded = c.y + bank + Math.max(-reach, Math.min(reach, raw - c.y - bank));
      const t = Math.max(0, Math.min(1, (outside - 48) / 48));
      return graded + (raw - graded) * t * t * (3 - 2 * t);
    }
    return raw;
}
// 木ノ芽峠は北陸道が尾根の鞍部を越える峠（標高六百余m）。観音丸・木ノ芽峠城はその鞍部を挟む。
//   道から四十メートル・郭から九十六メートルの足場は動かさず、その外の東西の山肌を峠より高く持ち上げ、
//   峠道が両側の山に挟まれた鞍部に見えるようにする。奥の四城（z −146 より北）と北の府中への下りには掛けない。
function passFlanks(x, z) {
  // 霧の奥にしか山が無かったため、道と郭を避けて近い斜面から立ち上げる。
  const side = Math.abs(x) - 65;
  if (side <= 0 || z > -150) return 0;
  let clear = Infinity;
  for (const road of ECHIZEN_PATHS) {
    clear = Math.min(clear, distToPolyline(x, z, road));
    if (clear <= 40) return 0;
  }
  for (const c of courts) clear = Math.min(clear,
    Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1)) - 56);
  const safe = Math.max(0, Math.min(1, (clear - 40) / 56));
  const s = Math.min(1, side / 230), sm = s * s * (3 - 2 * s);
  const n = Math.min(1, (-150 - z) / 110), nm = n * n * (3 - 2 * n);
  const crest = .82 + .18 * Math.sin(z * .013 + (x > 0 ? 1.7 : .4)) * Math.cos(z * .0071 + x * .004);
  return 150 * sm * nm * crest * safe * safe * (3 - 2 * safe);
}
Object.assign(echizen.world, {
  // 土色だけから草の量を逆算すると、道の外まで裸の斜面になる。
  // 数は増やさず、道の肩に低い草の群落と湿った裸地を交互に残す。
  grassMix(x, z, pathDistance) {
    const edge = Math.max(0, Math.min(1, (pathDistance - 1.2) / 2.8));
    const patch = .5 + .5 * Math.sin(x * .31 + Math.sin(z * .17)) * Math.cos(z * .23);
    // 九月の大雨の峠。道の外は草の斜面（灰色の裸地の一枚に見えていた。10/28）
    return edge * (.45 + .5 * patch);
  },
  tint(x, z, h, color) {
    let d = Infinity;
    for (const road of ECHIZEN_PATHS) d = Math.min(d, distToPolyline(x, z, road));
    // 道の肩を草地へなじませ、坂に貼った一枚の板のような境を減らす。
    const t = Math.max(0, Math.min(1, (d - 5) / 6));
    const blend = t * t * (3 - 2 * t);
    // 大風雨の峠の土は水を吸って暗い。乾いた黄土の一枚に見えていた（10/28）
    color.setRGB(.30 - .08 * blend, .24 + .07 * blend, .16 + .02 * blend);
  },
});

// 写真の丸太組・板囲い・縄掛けを、小さな仕寄りの陣具に使う。
// 城の共有部品は変えず、本道と郭の中央には何も置かない。配置は推定。
// 木戸の前に逆茂木の列（道の幅だけ開ける）と、踏まれた道のぬかるみの照り。
// 逆茂木は飾りで、当たりと兵の数は変えない。水たまりは一つの形にまとめて一回で描く。
function passEntranceScenery(rt) {
  const W = rt.world, rot = Math.atan2(ENTRY.dx, ENTRY.dz), added = [];
  for (const [d, o, len] of [[10, 7.5, 5], [10, 12.8, 5], [10, -7.5, 5], [10, -12.8, 5], [17, 9, 4.5], [17, -9, 4.5]]) {
    const [x, z] = ENTRY.at(d, o), m = sakamogi(W, x, z, rot, len);
    rt.scene.add(m); added.push(m);
  }
  const parts = [], R = (k) => { const v = Math.sin(k * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  // 峠口の十一と、木戸から先の本道（観音丸を抜けて木ノ芽峠城の木戸まで）の轍の窪み。
  const spots = [];
  for (let k = 0; k < 11; k++) spots.push(ENTRY.at(2.5 + k * 2.9 + R(k) * 1.2, (R(k + 20) - .5) * (k % 3 ? 3.2 : 6)));
  const gi = ROAD.findIndex(p => Math.hypot(p[0] - GATE_KANNON.x, p[1] - GATE_KANNON.z) < 1);
  for (let i = Math.max(0, gi); i < ROAD.length - 1 && ROAD[i][1] < EXIT_KINOME[1]; i++) {
    const [ax, az] = ROAD[i], [bx, bz] = ROAD[i + 1], len = Math.hypot(bx - ax, bz - az);
    for (let u = 9; u < len; u += 24) {
      const t = u / len, j = spots.length, o = (R(j + 20) - .5) * 3;
      spots.push([ax + (bx - ax) * t - (bz - az) / len * o, az + (bz - az) * t + (bx - ax) / len * o]);
    }
  }
  for (let k = 0; k < spots.length; k++) {
    const [cx, cz] = spots[k], sx = 1.3 + R(k + 40) * 1.5, sz = .7 + R(k + 60) * .9, yaw = R(k + 80) * 3;
    const g = new THREE.CircleGeometry(1, 16), P = g.attributes.position;
    const edge = new Float32Array(P.count); edge.fill(1, 1);
    const f1 = 1 + (k % 3), f2 = 3 + (k % 2), cs = Math.cos(yaw), sn = Math.sin(yaw);
    for (let i = 0; i < P.count; i++) {
      const lx = P.getX(i), ly = P.getY(i), a = Math.atan2(ly, lx);
      const m = i ? 1 + Math.sin(a * f1 + k) * .22 + Math.sin(a * f2 + k * 2) * .1 : 0;
      const px = lx * m * sx, pz = -ly * m * sz;   // 上から見て表になる向きへ
      const x = cx + px * cs - pz * sn, z = cz + px * sn + pz * cs;
      P.setXYZ(i, x, drawGroundAt(W, x, z) + .03, z);
    }
    g.setAttribute('puddleEdge', new THREE.BufferAttribute(edge, 1));
    g.deleteAttribute('uv'); g.computeVertexNormals(); parts.push(g);
  }
  const geo = mergeGeometries(parts); for (const g of parts) g.dispose();
  // 法線は上向きにそろえ、空と雨雲を鈍く映す。縁は泥色へ移して透かす。
  const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  const mat = new THREE.MeshPhongMaterial({ color: 0x2c302f, emissive: 0x111417, shininess: 90, specular: 0x7d8684,
    transparent: true, opacity: .78, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float puddleEdge; varying float vPuddleEdge;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vPuddleEdge = puddleEdge;');
    sh.fragmentShader = 'varying float vPuddleEdge;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float mudEdge = smoothstep(0.45, 0.9, vPuddleEdge);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.1, 0.075), mudEdge);
        diffuseColor.a *= 1.0 - smoothstep(0.7, 1.0, vPuddleEdge);`)
      .replace('#include <specularmap_fragment>', '#include <specularmap_fragment>\n specularStrength *= 1.0 - mudEdge;');
  };
  const pools = new THREE.Mesh(geo, mat);
  pools.name = 'passEntryPools';
  pools.receiveShadow = true; pools.renderOrder = 1;
  rt.scene.add(pools);
  const dispose = rt.dispose;
  rt.dispose = function (...args) {
    rt.scene.remove(pools); geo.dispose(); mat.dispose();
    for (const m of added) rt.scene.remove(m);
    return dispose.apply(this, args);
  };
}

// 観音丸の木戸の内脇に、木戸を見張る井楼を一つ。
const ECH_GATE = { value: new THREE.Vector3(1e6, 1e6, 0) };
function passFortScenery(rt) {
  const F = rt.flags, W = rt.world, zone = F.C?.kuruwa?.kannon, q = F.gateKannon?.struct?.seg;
  if (!zone?.centroid || !q) return;
  const gx = (q[0] + q[2]) / 2, gz = (q[1] + q[3]) / 2, cx = zone.centroid.x, cz = zone.centroid.z;
  ECH_GATE.value.set(gx, gz, 46);
  // 10/31 点付け：木戸が小さく（三メートル）、兵に隠れて写らなかった。見た目の門構えと扉だけ一回り大きく（当たりの幅は変えない）。
  { const G = F.gateKannon, S = 1.55;
    if (G.frame) { G.frame.scale.set(S, 1.5, 1.2); G.frame.updateMatrixWorld(true); }
    if (G.mesh) { G.mesh.scale.set(S, 1.45, 1); G.mesh.updateMatrixWorld(true); } }
  const dx = cx - gx, dz = cz - gz, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
  // 井楼は木戸の内脇。郭の内で道の芯から十メートル外す。
  for (const side of [1, -1]) {
    // 木戸から郭の奥へ抜ける兵の筋を塞がないよう、塀際（芯から十七メートル）に寄せる。
    const x = gx + ux * 7 + uz * side * 17, z = gz + uz * 7 - ux * side * 17;
    if (!zone.test(x, z)) continue;
    rt.scene.add(yagura(W, x, z, { kind: 'seiro', rot: Math.atan2(ux, uz) }));
    break;
  }
  // 11/4 p100_echizen（kaito AA・AF・AP9・AV4）：近づける所の見せかけの軍勢（木戸の奥の遠景の一揆勢・郭の中の作り物の乱戦・持ち場脇の味方の塊）は置かない。
  //   木戸の前と郭の中には本物の兵だけを立てる（打って出た一揆勢・観音丸城の守兵・織田の先手）。
  // 木戸は共通の部品（kido の冠木門）のまま門構えを一回り大きく見せる（扉は破れて飛ぶ形を保つ）。当たり・口の幅・耐久は元のまま。
  for (const g of [F.gateKannon, F.gateKinome]) {
    if (g?.frame) g.frame.scale.set(1.3, 1.35, 1.3);
  }
}

// 10/30 vis_h（点付け：杉が板の重ね・画面が暗い）。
// 杉の写真の葉房は比叡山と同じく暗い深緑へ沈め、房の根元ほど暗くして、明るい黄緑の板の均一さを崩す（絵・形・描く回数は増やさない）。
// 雨の峠の写しの露出を少し上げる（光の値だけ）。
function passCedarAndLight(rt) {
  const W = rt.world;
  for (const m of new Set((W.treeMeshes || []).map((t) => t.material).flat())) {
    const kind = m?.userData?.leafPhoto;
    if (!m?.color || (kind !== 'cedar' && kind !== 'broad') || m.userData.passDeep) continue;
    m.userData.passDeep = true;
    // 道脇の雑木の写真の葉も、雨の峠では明るい黄緑の板に浮いた。杉ほどではなく沈める。
    // 写真の読込完了時に材質の色が設定し直されるため、峠の掛け色は描く処理へ残す。
    // 読込の前後で葉が黄緑へ戻らず、共有の写真や他の戦の材質も変えない。
    const tint = kind === 'cedar' ? 'vec3(0.56, 0.62, 0.56)' : 'vec3(0.66, 0.68, 0.6)';
    const prev = m.onBeforeCompile, key = m.customProgramCacheKey();
    m.onBeforeCompile = function (sh, r) {
      prev.call(this, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
        #ifdef USE_MAP
        { float pk = 0.56 + 0.4 * smoothstep(0.1, 0.8, abs(vMapUv.y - 0.5) * 2.0) + 0.08 * sin(vMapUv.x * 23.0 + vMapUv.y * 17.0);
          diffuseColor.rgb *= pk * vec3(0.86, 0.9, 0.92) * ${tint}; }
        #endif`);
    };
    m.customProgramCacheKey = () => key + '|passDeep';
    m.needsUpdate = true;
  }
  if (!W.passLookOf) {
    const lookOf = W.passLookOf = W.lookOf.bind(W);
    W.lookOf = (key) => { const L = lookOf(key); if (key === 'storm' && L.grade) L.grade.exposure *= 1.18; return L; };
    if (W.timeKey) W.setTime(W.timeKey);
  }
}

function passCampScenery(rt) {
  const W = rt.world, sites = [];
  const roadDistance = (x, z) => {
    let d = Infinity;
    for (const path of ECHIZEN_PATHS) d = Math.min(d, distToPolyline(x, z, path));
    return d;
  };
  const proposed = [[-80, -554, .2], [36, -128, -.3], [-30, -3, .1], [-26, 182, -.2]];
  // 麓の荷解き場は、急坂と川を避けて道肩の平らな所を二つだけ探す。
  for (const z of [-805, -733]) {
    for (const x of [13, -13, 18, -18]) {
      if (roadDistance(x, z) < 10) continue;
      const y = W.heightAt(x, z);
      if (Math.abs(W.heightAt(x + 4, z) - y) > .7 ||
          Math.abs(W.heightAt(x - 4, z) - y) > .7 ||
          Math.abs(W.heightAt(x, z + 4) - y) > .7 ||
          Math.abs(W.heightAt(x, z - 4) - y) > .7) continue;
      proposed.push([x, z, x > 0 ? -.4 : .4]); break;
    }
  }
  for (const [x, z, rot] of proposed) {
    if (roadDistance(x, z) < 9 || NAKA.list.some(I => {
      const lv = I.levels[0];
      return Math.abs(x - I.x) < lv.w / 2 + 6 && Math.abs(z - I.z) < lv.d / 2 + 6;
    })) continue;
    sites.push({ x, z, rot, y: W.heightAt(x, z) });
  }
  if (!sites.length) return;
  const core = [], detail = [], dummy = new THREE.Object3D(), color = new THREE.Color();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const pole = new THREE.CylinderGeometry(1, 1, 1, 6);
  const ring = new THREE.TorusGeometry(1, .045, 3, 8);
  const place = (list, source, tint, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    const g = source.clone().toNonIndexed();
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(rx, ry, rz);
    dummy.updateMatrix(); g.applyMatrix4(dummy.matrix);
    color.setHex(tint);
    const a = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = color.r; a[i + 1] = color.g; a[i + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); list.push(g);
  };
  // 開いた片流れの陣小屋。雨を落とす板屋根と、裏の葦簀だけにする。
  for (const x of [-1.5, 1.5]) for (const z of [-1.2, 1.2]) {
    const h = z < 0 ? 2.1 : 1.65;
    place(core, pole, 0x554534, x, h / 2 - .12, z, .085, h + .24, .085);
    place(detail, ring, 0x8c7955, x, h - .2, z, .11, .11, .11, Math.PI / 2);
  }
  for (let i = 0; i < 9; i++) {
    place(core, box, i % 3 ? 0x635440 : 0x78674e, -1.6 + i * .4, 1.94, 0,
      .405, .055, 2.85, .185);
    place(detail, box, 0x443a2d, -1.6 + i * .4, 1.96, 0, .025, .018, 2.8, .185);
  }
  place(core, box, 0x777052, 0, .8, 1.2, 3, 1.4, .045);
  for (let i = 0; i < 20; i++)
    place(detail, pole, i % 2 ? 0x92845c : 0x6c6847, -1.43 + i * .15, .8, 1.23, .025, 1.42, .025);
  // 道へ張り出さない短い陣幕。裾を落とし、折れと縫い目を形で残す。
  const cloth = new THREE.PlaneGeometry(4.2, 1.25, 12, 3), p = cloth.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setXYZ(i, x, y - .1 * Math.cos(x * 1.5), .08 * Math.sin(x * 8) + .07 * Math.sin(x * 2 + y));
  }
  cloth.computeVertexNormals();
  place(core, cloth, 0xb5ad8d, .3, 1, 3, 1, 1, 1);
  for (const x of [-1.8, .3, 2.4]) {
    place(core, pole, 0x5c503a, x, .85, 3, .045, 1.9, .045);
    place(detail, box, 0x776c51, x, 1, 2.96, .018, 1.12, .012);
  }
  // 字や断定できない家紋を描かず、風下へ折れた生成りの小旗を一本。
  place(core, pole, 0x706047, -2.8, 1.7, 2, .036, 3.7, .036);
  place(core, box, 0x706047, -2.42, 3.25, 2, .85, .035, .035);
  const flag = new THREE.PlaneGeometry(.72, 1.5, 4, 5), fp = flag.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setZ(i, .1 * Math.sin(fp.getY(i) * 6) + .12 * fp.getX(i));
  flag.computeVertexNormals();
  place(core, flag, 0xbdb59a, -2.42, 2.5, 2, 1, 1, 1);
  // 竹束の予備。竹の節・切り口・二段の縄は近い時だけ描く。
  for (let b = 0; b < 2; b++) {
    const bx = 2.5 + b * .75;
    place(core, pole, 0x777553, bx, .88, 1, .28, 1.8, .28, 0, 0, -.08);
    for (let j = 0; j < 7; j++) {
      const a = j * Math.PI * 2 / 7, x = bx + Math.cos(a) * .25, z = 1 + Math.sin(a) * .25;
      place(detail, pole, j % 2 ? 0x999269 : 0x73764d, x, .88, z, .055, 1.8 - j % 3 * .06, .055);
      for (const y of [.4, 1.05, 1.65]) place(detail, pole, 0xa19a71, x, y, z, .06, .035, .06);
      place(detail, pole, 0xb7a47b, x, 1.79 - j % 3 * .06, z, .038, .012, .038);
    }
    for (const y of [.48, 1.3]) place(detail, ring, 0x746044, bx, y, 1, .32, .32, .32, Math.PI / 2);
  }
  // 雨除けの下の炊事釜と薪。風雨なので野外の大きな炎や土埃は足さない。
  place(core, pole, 0x292a25, -.6, .33, .3, .3, .45, .3);
  place(detail, ring, 0x48483c, -.6, .57, .3, .31, .31, .31, Math.PI / 2);
  for (let i = 0; i < 8; i++)
    place(detail, pole, i % 2 ? 0x534334 : 0x746046, .6 + i % 4 * .17, .1 + Math.floor(i / 4) * .15, .6,
      .075, .85, .075, Math.PI / 2, i * .12);
  for (let i = 0; i < 3; i++) {
    place(core, pole, 0x978363, .2 + i * .55, .3, -.7, .24, .55, .24, 0, 0, Math.PI / 2);
    for (const x of [-.15, .15]) place(detail, ring, 0x6c6047, .2 + i * .55 + x, .3, -.7, .245, .245, .245, 0, Math.PI / 2);
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const meshes = [];
  for (const [parts, far] of [[core, 140], [detail, 48]]) {
    const geo = mergeGeometries(parts), mesh = new THREE.InstancedMesh(geo, mat, sites.length);
    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      dummy.position.set(s.x, s.y, s.z); dummy.rotation.set(0, s.rot, 0); dummy.scale.setScalar(1);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.receiveShadow = true;
    W.viewCull([mesh], 0, far, false); rt.scene.add(mesh); meshes.push(mesh);
    for (const g of parts) g.dispose();
  }
  for (const g of [box, pole, ring, cloth, flag]) g.dispose();
  // 雨除けの釜から細く流れる炊煙。全地点で一束、各三粒だけ。
  // 時刻は描く時に渡し、毎コマの作り直しや粒ごとの計算はしない。
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(220,220,210,0.5)'); gradient.addColorStop(1, 'rgba(220,220,210,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 32, 32);
  const smokeTex = new THREE.CanvasTexture(canvas), smokeGeo = new THREE.BufferGeometry();
  const positions = [], phases = [];
  for (const s of sites) for (let i = 0; i < 3; i++) {
    positions.push(s.x - .6 * Math.cos(s.rot) + .3 * Math.sin(s.rot), s.y + .6,
      s.z + .6 * Math.sin(s.rot) + .3 * Math.cos(s.rot));
    phases.push(i / 3 + sites.indexOf(s) * .17);
  }
  smokeGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  smokeGeo.setAttribute('passPhase', new THREE.Float32BufferAttribute(phases, 1));
  const smokeMat = new THREE.PointsMaterial({ map: smokeTex, color: 0xa7a89c, size: .8,
    transparent: true, opacity: .18, depthWrite: false });
  const clock = { value: 0 };
  smokeMat.onBeforeCompile = shader => {
    shader.uniforms.passTime = clock;
    shader.vertexShader = 'uniform float passTime; attribute float passPhase; varying float passSmokeAlpha;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float age = fract(passTime * 0.24 + passPhase);
        transformed += vec3(age * 2.8, age * 1.35, -age * 1.2);
        passSmokeAlpha = sin(age * 3.14159);`).replace('#include <project_vertex>', `#include <project_vertex>
        passSmokeAlpha *= 1.0 - smoothstep(36.0, 55.0, length(mvPosition.xyz));`);
    shader.fragmentShader = 'varying float passSmokeAlpha;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= passSmokeAlpha;');
  };
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  smokeGeo.computeBoundingSphere(); smokeGeo.boundingSphere.radius += 4;
  smoke.onBeforeRender = () => { clock.value = rt.t; };
  rt.scene.add(smoke);
  const dispose = rt.dispose;
  rt.dispose = function (...args) {
    rt.scene.remove(smoke); smokeGeo.dispose(); smokeMat.dispose(); smokeTex.dispose();
    for (const m of meshes) { rt.scene.remove(m); m.geometry.dispose(); m.dispose(); }
    mat.dispose();
    return dispose.apply(this, args);
  };
}

// 11/6 fixc2103_echizen（kaito「観音丸の守り手が塀の内・櫓から撃ってこない」城攻めの決まり）：観音丸の今の塀を狭間に借り、
//   木戸へ寄せる先手と本人へ鉄砲と矢を射かける（共通の城攻め部品 siege_kit。兵も塀も足さない。竹束と塀の陰は当たらない）。郭が落ちるまで。
echizen.siegeKit = (rt) => {
  const s = rt.flags.gateKannon?.struct?.seg;
  if (!s) return null;
  return {
    plan: { x: (s[0] + s[2]) / 2, z: (s[1] + s[3]) / 2, rot: Math.PI, W: 20, yokoya: false, moat: false, kirigishi: 0, umadashi: false, sakamogi: false, shiyori: false },
    build: { team: 1, gate: false, walls: false, bridge: false, umadashi: false, sakamogi: false, shiyori: false, heads: true,
      fire: { hurt: .3, near: 90, close: 26, base: .9, peak: 3.2, arrows: .5, needMen: true } },
    borrow: { r: 75, name: '観音丸城' },   // 撃つのは塀の近くに逃げずに残る守兵がいる間だけ（needMen）。落ちた後は皆退くので止む
  };
};

// 木戸前の下知は、味方だけの討取りや三十秒の時計では済ませない。
// 敵を味方が討ち切った時も、本人が木戸を打てば進める。
echizen.assault = function (rt) {
  if (!rt.flags.echOpeningHit) return;
  return kinome.assault.call(this, rt);
};

echizen.setup = function (rt) {
  const damage = rt.army.damage;
  rt.army.damage = function (target, amount, source, options) {
    const hp = target?.hp;
    const result = damage.call(this, target, amount, source, options);
    const elite = rt.flags.echElite;
    if (elite && !elite.done && source === rt.player.u && target?.group === elite.g && target.hp < hp)
      elite.foughtAt ??= rt.t;
    if (!rt.flags.step && source === rt.player.u && target?.team === 1 && target.hp < hp &&
        (target === rt.flags.gateKannon?.struct || target.group === rt.flags.gateSally?.real ||
         target.group === rt.flags.roadGuards?.[0]?.real)) rt.flags.echOpeningHit = true;
    // 郭に立つだけでは、四十秒後に守兵を退かせる時計を始めない。
    // 本人がその郭の守兵へ実際に一撃を当てた事を記録する。
    if (source === rt.player.u && target?.team === 1 && !target.isStruct && target.hp < hp &&
        rt.flags.defenders?.some(b => b.real === target.group)) {
      for (const key of PASS_COURTS) {
        if (rt.flags.C?.kuruwa?.[key]?.test(target.pos.x, target.pos.z)) rt.flags['breachHit_' + key] = true;
      }
    }
    return result;
  };
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); if (m && d > 0 && !rt.flags.step) return d * 0.35;   /* 11/9：開戦の木戸前で塀の上の鉄砲・弓に三十秒で討たれていた（遊び手の bot）。木戸前の間だけ矢玉を軽く */ return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }   // 11/1：刃の一太刀を def.cutFloor 倍に（共通の一太刀五割・六割は変えず、この戦だけ）
  // 資料本の足軽：黒褐色の貸し胴と草摺、赤茶の漆の陣笠。金色の総具足にはしない。
  // 既存の陣笠・桶側胴・素懸威を共用し、兵・形・材質の種類を増やさない。
  const addUnit = rt.army.addUnit;
  const armors = [0x302820, 0x3d2a23, 0x272522], hats = [0x602d24, 0x422c24, 0x292522];
  rt.army.addUnit = function (group, options) {
    if (['ashigaru', 'bow', 'gun'].includes(options.type) && !options.sohei && !options.name) {
      const v = group.initial % 3;
      options = { ...options, armor: armors[v], hat: 'jingasa', hatColor: hats[v],
        doStyle: v === 1 ? 'sugake' : 'okegawa', kote: 3, sode: false };
    }
    if (options.name === '阿波賀三郎') options = { ...options, flagScale: 2.2 };
    return addUnit.call(this, group, options);
  };
  // 長い戦名の最後の一文字だけが次の行へ落ちないよう、越前の札だけ整える。
  const layout = document.createElement('style');
  layout.textContent = `
  /* 負傷は画面の縁だけで知らせ、雨空と戦場の色を覆わない。 */
  body:has(#hud.echizen) #vignette.hurt,
  body:has(#hud.echizen) #vignette.dying {
    animation:none !important; background:none !important;
    box-shadow:inset 0 0 28px rgba(110,34,24,.25) !important;
  }
  /* 掛矢の札は字を消し、掛矢の形だけの釦にする（10/29 採点「打つ 長押し」）。押す・長押しの働きと進み具合の帯は残す。 */
  html body #hud.echizen #prompt[data-action="打つ"] [data-work] > :is(span, small) { display:none !important; }
  html body #hud.echizen #prompt[data-action="打つ"] [data-work] { min-width:56px !important; min-height:56px !important; }
  html body #hud.echizen #prompt[data-action="打つ"] [data-work]::before { content:''; display:block; width:40px; height:40px; margin:0 auto; background:center / contain no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M9 35L24 16' stroke='%2314120f' stroke-width='7' stroke-linecap='round'/%3E%3Cpath d='M9 35L24 16' stroke='%23fff3ba' stroke-width='3.5' stroke-linecap='round'/%3E%3Crect x='17' y='4' width='20' height='13' rx='3' transform='rotate(38 27 10.5)' fill='%23fff3ba' stroke='%2314120f' stroke-width='3'/%3E%3C/svg%3E"); }
  html body #hud.echizen #prompt[data-action="打つ"] > kbd, html body #hud.echizen #prompt[data-action="打つ"] > small { display:none !important; }
  /* 傷の長い文で格子の最小幅が広がると、残りと帯だけ墨の外へ出る。
     札の幅の中で傷を折り返し、命の帯も同じ幅へ収める。 */
  html body #hud.echizen .bl #h-hp.hp {
    grid-template-columns:max-content minmax(0, 1fr) !important;
    max-width:calc(100vw - 40px); min-width:0;
  }
  html body #hud.echizen .bl #h-hp.hp > :is(i,em) {
    min-width:0; max-width:100%; box-sizing:border-box;
  }
  /* 傷の印と「けがで 足がおそい」が同じ行に収まる幅を持たせる。 */
  html body #hud.echizen .bl #h-hp.hp:has(em:not([hidden])) {
    width:max(208px, calc(192px * var(--text-scale, 1) + 16px)) !important;
  }
  html body #hud.echizen .bl #h-hp.hp em {
    justify-self:stretch; white-space:normal !important;
    overflow-wrap:anywhere !important; word-break:normal !important;
    font-size:max(16px, calc(16px * var(--text-scale, 1))) !important;
    text-wrap:pretty;
  }
  html body #hud.echizen .bl #h-hp.hp em small {
    min-width:0; max-width:100%; white-space:normal;
    overflow-wrap:anywhere; word-break:normal;
  }
  /* 下知を読む間は、戦場の行き先札と頭上の描画を本文へ重ねない。 */
  #hud:has(#intro[data-battle="echizen"]:not([hidden])) :is(#mission-goal,#mission-target-lines,#mission-flag-frame,#overlay,.field-names) {
    visibility:hidden !important;
  }
  /* 開始札は最初の画面更新より先に出る。札自身の戦名で指定する。 */
  #hud #intro[data-battle="echizen"] .card .sides {
    font-size:max(15px, calc(16px * var(--text-scale, 1))); letter-spacing:0;
  }
  /* 日付・風雨・「もしも」を語の途中で切らず、まとまりごとに折り返す。 */
  #hud #intro[data-battle="echizen"] .card .date {
    font-size:max(13px, calc(13px * var(--text-scale, 1)));
    letter-spacing:.04em; line-height:1.6; white-space:normal;
    word-break:keep-all; overflow-wrap:normal; text-wrap:balance;
  }
  /* 勝つ条件の末尾一文字を次の行へ残さず、読む文の行長を整える。 */
  #hud #intro[data-battle="echizen"] .intro-reading p { text-wrap:pretty; }
  /* 本文の終わりを釦へ詰めず、送って読んだ後にも余白を残す。 */
  #hud #intro[data-battle="echizen"] .intro-reading {
    flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain;
    touch-action:pan-y; padding-bottom:12px; scroll-padding-bottom:12px;
  }
  #hud #intro[data-battle="echizen"] #intro-go { flex-shrink:0; }
  #hud #intro[data-battle="echizen"] .intro-people summary {
    box-sizing:border-box; min-height:44px; padding:10px 8px; margin-top:8px;
    color:#f2cd72; font-size:max(15px, calc(15px * var(--text-scale, 1)));
    line-height:1.6; text-decoration:underline; cursor:pointer;
  }
  #hud #intro[data-battle="echizen"] .intro-people summary:focus-visible {
    outline:3px solid var(--kin); outline-offset:-3px; box-shadow:0 0 0 2px #14120f;
  }
  /* 「今」と本文を並べる共通の横組みを戻し、本文へ札の全幅を渡す。 */
  html body #hud.echizen #battle-notices:not(.choosing) #objectives:not(.expand) li.cur {
    display:block !important; width:100%; box-sizing:border-box;
  }
  html body #hud.echizen #battle-notices #objectives:not(.expand) li.cur::before { display:none !important; }
  /* 行動欄を畳む退避中も本文を残す。共通の「行動あり」で本文まで消すと空札になる。 */
  html body #hud.echizen #battle-notices:not(.choosing) #objectives#objectives.keep-combat-task:not(.expand) #obj-list,
  html body #hud.echizen #battle-notices:not(.choosing) #objectives#objectives.keep-combat-task:not(.expand) #obj-list li.cur,
  html body #hud.echizen #battle-notices:not(.choosing) #objectives#objectives.keep-combat-task:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now) {
    display:block !important;
  }
  html body #hud.echizen #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now) {
    display:block; width:auto !important; min-width:0; max-width:100%;
    white-space:normal !important; overflow-wrap:anywhere; line-height:1.4 !important;
    text-wrap:pretty;
  }
  /* 退く札へ切り替わった間は、攻める補足と構えの重複札を畳む。
     任務の一覧を開けば本来の下知を読める。携帯・卓上端末で共通にする。 */
  /* 通れる退路がない時は travel-retreat が付かない。その間も同じ下知を二度出さない。 */
  html body #hud.echizen.retreat-priority #battle-notices #objectives:not(.expand) .battle-action,
  html body #hud.echizen.retreat-priority #battle-notices #objectives:not(.expand) li.cur > small:not(.goal-place),
  html body #hud.echizen.retreat-priority #battle-notices #objectives:not(.expand) .obj-cue {
    display:none !important;
  }
  @media (min-height:501px) {
    /* 勝つ条件が釦の上で切れないよう、背の高い画面でも読む幅を確保する。 */
    html body #hud #intro[data-battle="echizen"] > .card.card {
      width:min(620px, calc(100vw - 32px)); height:min(600px, 72dvh);
    }
    /* 人物紹介が下に続くことを、切れた字だけで知らせない。 */
    #hud #intro[data-battle="echizen"] > .card::after {
      content:none; order:1; flex:0 0 auto;
      font-size:max(13px, calc(13px * var(--text-scale, 1)));
      line-height:1.4; color:#ece4d2;
    }
    #hud #intro[data-battle="echizen"] #intro-go { order:2; }
    #hud #intro[data-battle="echizen"] .card .ttl { font-size:max(24px, calc(clamp(24px, 2.4vw, 32px) * var(--text-scale, 1))); line-height:1.4; letter-spacing:.04em; padding-left:0; text-wrap:balance; }
    /* 任務と声を左の一列へ。小地図と右上の回避案内を空ける。 */
    html body #hud.echizen.mission-visible #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
      left:16px !important; right:auto !important; top:104px !important;
      width:min(320px, 30vw) !important; max-height:calc(100% - 304px) !important;
    }
    html body #hud.echizen #battle-notices:not(.choosing) > :is(#objectives,#battle-message) {
      position:relative !important; inset:auto !important; transform:none !important;
      width:100% !important; height:auto !important; flex:0 0 auto; min-width:0;
    }
    /* 地面の印へ付く共通指定も戻す。札だけ右上や画面外へ抜けさせない。 */
    html body #hud.echizen #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
      position:relative !important; inset:auto !important; transform:none !important;
      width:100% !important; max-width:100% !important;
    }
    html body #hud.echizen #battle-notices #objectives:not(.expand) :is(li.cur,.obj-text,.obj-now,.battle-action) {
      white-space:normal !important; overflow-wrap:anywhere; height:auto !important;
      max-height:none !important; overflow:visible; line-height:1.4 !important;
    }
  }
  @media (orientation:landscape) and (max-height:500px) {
    /* 共通欄の三割の高さでは下段の歩数が切れる。今の札を上の一列へ収める。
       退避札もここに固定し、旗を追って命の表示へ重ならないようにする。 */
    html body #hud.echizen #battle-notices:not(.choosing):not(:has(#objectives.expand)) {
      position:fixed !important; left:calc(50% - 160px) !important; right:auto !important;
      top:calc(16px + env(safe-area-inset-top, 0px)) !important; bottom:auto !important;
      width:320px !important; max-width:calc(100vw - 32px) !important;
      height:auto !important; max-height:min(180px, calc(100dvh - 152px)) !important;
      overflow-y:auto; mask-image:none !important; -webkit-mask-image:none !important;
    }
    html body #hud.echizen.single-guide #battle-notices:not(.choosing) #objectives:not(.expand):is(.ground-order,.travel-retreat.destination-sign,.linked-destination) {
      position:relative !important; inset:auto !important; transform:none !important;
      width:100% !important; max-width:100% !important;
      height:auto !important; max-height:none !important; overflow:visible !important;
    }
    html body #hud.echizen #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list {
      height:auto !important; max-height:none !important; overflow:visible !important;
    }
    /* 兵の頭上の大札を指元へ移す。左利きの並びと文字拡大にも合わせる。 */
    html.touch body #hud.echizen #wait-guard {
      left:auto !important; right:calc(16px + env(safe-area-inset-right, 0px)) !important;
      top:auto !important; bottom:calc(112px + env(safe-area-inset-bottom, 0px));
      width:216px; min-height:72px; max-height:calc(100dvh - 200px);
      padding:6px; border-width:2px; border-radius:10px; overflow-y:auto;
      grid-template-columns:28px minmax(0, 1fr); column-gap:6px; row-gap:2px;
    }
    html.touch.tc-sw body #hud.echizen #wait-guard {
      right:auto !important; left:calc(16px + env(safe-area-inset-left, 0px)) !important;
    }
    html.touch body #hud.echizen #wait-guard svg:first-child { width:28px; height:40px; }
    html.touch body #hud.echizen #wait-guard svg + svg { display:none; }
    html.touch body #hud.echizen #wait-guard span {
      font-size:max(16px, calc(16px * var(--text-scale, 1))); white-space:normal;
      word-break:normal; overflow-wrap:anywhere;
    }
    html.touch body #hud.echizen #wait-guard small {
      font-size:max(13px, calc(13px * var(--text-scale, 1))); word-break:normal; overflow-wrap:anywhere;
    }
    html.touch body #hud.echizen.wait-guard-active #objectives:not(.expand) .battle-action:has(.guard-caption) {
      display:none !important;
    }
    /* 携帯でも、下知を送る操作の説明は重ねない。 */
    #hud #intro[data-battle="echizen"] > .card::after {
      content:none; order:1; flex:0 0 auto;
      font-size:max(13px, calc(13px * var(--text-scale, 1)));
      line-height:1.4; color:#ece4d2;
    }
    #hud #intro[data-battle="echizen"] #intro-go { order:2; }
    /* 下知の途中で釦に切られないよう、横幅と読む高さを確保する。 */
    html body #hud #intro[data-battle="echizen"] > .card.card {
      width:min(620px, calc(100vw - 32px));
      max-height:calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
      padding:8px 16px;
    }
    /* 携帯横でも札を一列へ戻す。地面の印に付く幅指定で操作名を切らない。 */
    html body #hud.echizen #battle-notices:not(.choosing) > :is(#objectives,#battle-message),
    html body #hud.echizen #battle-notices:not(.choosing) #objectives.ground-order:not(.expand) {
      position:relative !important; inset:auto !important; transform:none !important;
      width:100% !important; max-width:100% !important; box-sizing:border-box;
      height:auto !important; flex:0 0 auto; min-width:0;
    }
    html body #hud.echizen #battle-notices #objectives:not(.expand) li.cur {
      height:auto !important; max-height:none !important; overflow:visible !important;
    }
    /* 退く指図は任務欄へ集める。行動欄の同じ文を重ねず、一覧は開ける。 */
    html body #hud.echizen.retreat-priority #battle-notices #objectives.has-action:not(.expand) .battle-action:not([hidden]) {
      display:none !important;
    }
    html body #hud.echizen.retreat-priority #battle-notices #objectives.has-action:not(.expand) #obj-list {
      display:block !important;
    }
    /* 退避の共通欄は行動欄を隠す。本文まで畳んで旗だけを残さない。 */
    html body #hud.echizen.cover-guidance #battle-notices:not(.choosing) #objectives.travel-retreat:not(.expand),
    html body #hud.echizen #battle-notices #objectives.travel-retreat:not(.expand) #obj-list {
      display:block !important; visibility:visible !important;
    }
    /* 「味方と進め」の末尾と、退く指図を一行の札からはみ出させない。 */
    html body #hud.echizen #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now),
    html body #hud.echizen #battle-notices #objectives:not(.expand):not(.travel-retreat) .battle-action:not([hidden]) {
      min-width:0; max-width:100%; white-space:normal !important;
      overflow-wrap:anywhere !important; word-break:normal !important;
      height:auto !important; max-height:none !important;
      overflow:visible !important; text-overflow:clip; line-height:1.4 !important;
      display:block !important; -webkit-line-clamp:unset !important; line-clamp:unset !important;
    }
    #hud #intro[data-battle="echizen"] .card .ttl { font-size:max(20px, calc(24px * var(--text-scale, 1))); letter-spacing:.04em; }
    #hud #intro[data-battle="echizen"] .intro-reading p { margin:6px 0; }
    #hud #intro[data-battle="echizen"] .card .date { margin-bottom:4px; }
    #hud #intro[data-battle="echizen"] .card .rule { margin:6px auto; }
  }`;
  rt.hud.root.appendChild(layout);
  // 本道の印は三十秒後に作られる。作る時にも山道の指定を渡す。
  // 土の平場を建物の床と取り違えて「下の階」と案内しない。
  const marker = rt.marker;
  rt.marker = function (id, pos, label, options) {
    if (id === 'road' || id === '_gate' || id === 'ake')
      options = { ...options, groundGuide: true };
    if (id === 'road') options = { ...options, guideAlways: true };
    return marker.call(this, id, pos, label, options);
  };
  // 旧任務の距離・人数の補足を蓄えず、一行とピンに任せる。
  const progress = rt.objProgress;
  rt.objProgress = function (id) { return progress.call(this, id, ''); };
  // 携帯横の二行で読み切れる長さにする。台詞の枠は増やさない。
  const say = rt.say;
  rt.say = function (speaker, text, ...args) {
    if (speaker === '明智光秀') speaker = '組頭';
    // 11/6 fix4_echizen（言葉）：組頭が上の将を名で呼び捨てにしない。仕組みの言葉（構え）を台詞に入れない
    if (/海側は明智光秀・羽柴秀吉/.test(text)) text = '海の側は惟任殿・羽柴殿の手じゃ。我らはこの木戸を開く';
    if (text === '木戸を打つ者を守れ。矢玉は構えで防げぬ。竹束の陰へ！') text = '木戸を打つ者を守れ。矢玉が来る、竹束の陰へ！';
    if (text === '者ども、竹束を前へ！　押し立てて寄せよ！')
      text = '進み太鼓と法螺貝じゃ。竹束を前へ、木戸へ寄せよ！';
    // 別手への下知を、遊び手の本道の任務と取り違えさせない。
    if (text === '手前は先に東の尾根より、西光寺丸城を衝き申す')
      text = '別手は東の城へ向かう。おぬしの組は本道の次の木戸へ';
    if (text === '先に西の鉢伏城の高みの旗へ登れ')
      text = '別手は西の城へ向かう。おぬしの組は本道の次の木戸へ';
    if (text === '木戸が開いたぞ。槍をそろえ、中へ続け！' ||
        text === '次の木戸も開いた。味方と中の敵を討て') {
      // 木戸ごとの一度の下知に合わせる。普段の案内では鳴らし直さない。
      sfx('sig_kakari', .8);
      text = '懸かり太鼓じゃ。槍をそろえ、木戸の中へ！';
      rt.after(1.2, () => {
        if (!rt.over && !rt.flags.ending && rt.player.u.alive) sfx('toki', .65);
      });
    }
    if (text === 'これ以上は支えられぬ。組を集め、来た道を退け！') {
      sfx('sig_nobiki', .85);
      text = '退き太鼓じゃ。組を集め、来た本道を退け！';
      rt.obj('echizen-retreat', '退き太鼓。組を集め、来た本道を退け', 'order', true);
    }
    // 11/6 fix4_echizen：10/26 から戦の間の台詞が全部消え、杉津口の寝返りの知らせ・付け入り・殿の将の名が届かず、物語が分からなかった。
    //   物語の台詞（知らせ・名のある将・組頭の太鼓と付け入りと殿）だけ出す。共通の「前に出すぎ」「東の旗へ寄れ」などの指図と、崩れるたびの一言は出さない
    const story = speaker === '組頭' ? ECH_STORY_LINES.has(text) || /敦賀|惟任殿|穂先をそろえよ|付け入|木戸を閉め|太鼓じゃ|府中へ退く|西光寺|竹束/.test(text)
      : speaker !== '足軽' || /火縄/.test(text);
    // 11/6 fixc0917_echizen：殿へ懸かる柴田らが共通の崩れの一言（「無念」「固まって退け」）を言い、勝ち戦の中で味方の将が退くように聞こえた
    if (!rt.over && !rt.flags.ending && /無念|固まって退け|背を向けるな/.test(text)) return;
    // 11/6 fixc2103_echizen（critic60 57行）：開戦すぐ「者ども、ついて来い！」が1秒と5秒で二度続いた。同じ文は8秒に一度まで
    if (rt.over || rt.flags.ending || story) {
      const said = rt.flags._echSaid || (rt.flags._echSaid = new Map());
      if (said.get(text) > rt.t) return;
      said.set(text, rt.t + 8);
      return say.call(this, speaker, text, ...args);
    }
  };
  const objective = rt.obj;
  rt.obj = function (id, text, ...args) {
    if (id === 'main' && text === '本道を登れ。観音丸の木戸を破り、味方と中の敵を討て')
      text = '進み太鼓と法螺貝。竹束と木戸へ進み、味方と中の敵を討て';
    if (id === 'main' && (text === '木戸が開いた。味方と入り、観音丸の守りを崩せ' ||
        text === '木戸を通れ。味方と木戸内の守りを崩せ'))
      text = '観音丸の郭へ入り、味方と守兵を討て';
    // 11/5 fix61（kaito 三1）：任務の字に「崩す」を使わない。場所と行いで言う
    if (typeof text === 'string') text = text.replace(/崩せ/g, '討て').replace(/崩す/g, '討つ').replace(/門の外の守りの小勢/g, '木戸前に打って出た一揆勢');
    return objective.call(this, id, text, ...args);
  };
  // 既存の十秒後の手ほどき一回を、押す操作まで分かる言葉にする。
  const after = rt.after;
  rt.after = function (seconds, fn) {
    if (seconds === 10 && this.phase === 'brief') fn = () => {
      if (!rt.over && !rt.flags.ending && !rt.flags.step && rt.player.u.alive)
        rt.say('組頭', `穂先をそろえよ。${passGuardAction()}。列を離れず、味方と受けよ`, 5);
    };
    return after.call(this, seconds, fn);
  };
  try { kinome.setup.call(this, rt); } finally { rt.after = after; }
  passRoadEngage(rt);
  // 打って出る二十四人は passButai で始まりの札の前から準備し、後から重ねて足さない。
  // 開戦25秒（10/31）：木戸前に打って出た一揆勢は、先手と二十八秒まで崩れず揉み合い、互いの傷も浅い（兵の数は同じ）。後からは常の通り崩れて退く
  { const g = rt.flags.gateSally?.real;
    // 二十四人を本人一人へ集めない。後から兵を足す処理に頼らず、準備時に指定する。
    if (g) { g.noHunt = true; const dm = g.dmgMult; g.noRout = true; g.defMult = 1.8; g.dmgMult = (dm ?? 1) * 0.45;   // 長く揉み合う分、刃も浅く（本人が囲まれて倒れないように）
      rt.after(28, () => { g.noRout = false; g.defMult = 1; g.dmgMult = dm; }); } }
  // 木戸を打つ手の釦は一語だけ。「掛矢で観音丸城の木戸を打つ」の長い札が画面に残っていた（10/28）。
  { const add = rt.addInteract; rt.addInteract = function (id, pos, label, fn, o) { if (typeof label === 'string' && label.startsWith('掛矢で')) label = '打つ'; return add.call(this, id, pos, label, fn, o); }; }
  passCampScenery(rt);
  passEntranceScenery(rt);
  echGoalBoard(rt);
  // 峠道の殿：初めは峠道を固めて槍を構え、観音丸が落ちるまでは下りて来ない
  {
    const look = { armor: 0x3a342c, hat: 'hachimaki', lace: 0x5a5040, cloth: 0x4a4236 };
    rt.flags.echTail = enemyGroup(rt, { fixed: true, faction: 'ikko', flag: 'namu', name: '峠道の殿の一揆勢', anchor: { ...TAIL_AT }, facing: TAIL_FACING,
      formation: 'yari', yariRanks: 4, width: 7, order: 'hold', stay: true, aggro: 6, seekRange: 6, noRout: true, noHunt: true, fleeDir: { x: 0, z: 1 } },
    // 11/6 fix4_echizen：殿の将は石田の西光寺真敬（信長公記「木目峠、石田の西光寺」。福井県史：寺の由緒書に木ノ芽峠で戦死）。
    //   坊主の大将は馬上で、侍四人が旗本として囲む。討てば「討ち取ったり」（名のある将だけ）
    // 11/6 fixc0917_echizen（kaito「一揆勢が織田の足軽と同じ陣笠・黒い胴」）：門徒の槍・弓・鉄砲は素の小袖に鉢巻（長島の門徒と同じ作り）。侍だけ暗い腹巻
      [{ type: 'busho', n: 1, o: { ...look, name: '西光寺真敬', horse: true } }, { type: 'samurai', n: 4, o: { ...look } },
        ...[ ['ashigaru', 15], ['bow', 4], ['gun', 4] ].map(([type, n]) => ({ type, n, o: { ...IKKO_KOSODE } }))]);
    // 槍の列より先に将へ当たっても、名乗り前だけ命が多くならない。
    const lord = rt.flags.echTail.units.find(q => q.type === 'busho');
    if (lord) {
      lord.maxHp = Math.min(lord.maxHp || 320, 320);
      lord.hp = Math.min(lord.hp, lord.maxHp);
    }
  }
  // 身の回りの当時の場（timeslip_field.js）。板の間・台の上は床に隠れるので置かない。
  {
    const W = rt.world;
    const skip = (x, z) => groundAt(W, x, z, W.heightAt(x, z) + 30) > W.heightAt(x, z) + 0.25;
    echizen.timeslip.skip = skip;
    // 共用の定義から、終わった戦の地形・建物・兵を抱え込まない。
    // 古い支度を取り消す時は、次の戦が付けた判定を残す。
    rt.cleanupTasks.add(() => { if (echizen.timeslip.skip === skip) delete echizen.timeslip.skip; });
  }
  timeslipField(rt);
  // 11/4 p100_echizen：八月十五日、信長は敦賀にいて峠へは来ていない（翌十六日に府中へ。信長公記）。
  //   前は縮める前の座標（z -198）で一揆の本陣の脇に信長の本陣が立っていたので外した。
  // 11/5 fix61：大きな働きを褒める上役は、峠にいない明智光秀（海の側の杉津口）でなく、その場の組頭
  rt.flags.bossName = '組頭';
  rt.after(6, () => { if (!rt.over && !rt.flags.ending) rt.say('組頭', '殿は敦賀におわす。今日、峠の一揆を討って越前へ入る', 4.5); });
  // 11/4 jin_echizen（AV7・AW6・BH2）：峠口の二陣は滝川一益・蜂屋頼隆（敦賀の歴史）。馬上で、侍の旗本に囲まれて先手の後ろの本道に控え、
  //   観音丸の木戸が開いたら郭へ押し入る。峠口の大将の丹羽長秀は後ろの本陣で座る（echizen.taisho）。
  { const g0 = rt.flags.gateKannon?.struct?.seg, gx = g0 ? (g0[0] + g0[2]) / 2 : GATE_KANNON.x, gz = g0 ? (g0[1] + g0[3]) / 2 : GATE_KANNON.z;
    // 先手の真後ろ（木戸から見て先手の向こう十四歩）。本道の曲がりの外へ出さない
    const a0 = rt.flags.ake?.pos || { x: gx, z: gz - 12 }, al = Math.hypot(a0.x - gx, a0.z - gz) || 1;
    const back = [a0.x + (a0.x - gx) / al * 14, a0.z + (a0.z - gz) / al * 14];
    rt.flags.niJin = [['滝川一益', -4], ['蜂屋頼隆', 4]].map(([name, ox]) => allyGroup(rt,
      { faction: 'oda', name: `${name}の手`, fixed: true, fullStrength: true, noGuard: true, anchor: { x: back[0] + ox, z: back[1] }, facing: 0, width: 3, aggro: 6, order: 'hold' },
      [{ type: 'busho', n: 1, o: { name, invuln: true, horse: true } }, { type: 'samurai', n: 6 }]));
    rt.flags.niJinGate = { x: gx, z: gz }; }

  const opening = rt.flags.ake.pos;
  rt.flags.passOpeningPost = { x: opening.x, z: opening.z };
  passFortScenery(rt);
  passCedarAndLight(rt);
  // 下知の音は従来どおり鳴らし、指図の字幕だけを抑える。終幕の史実は残す。
  const shortBark = rt.bark;
  rt.bark = function (...args) {
    if (rt.over || rt.flags.ending) return shortBark.apply(this, args);
  };

  // 動く備えの注記は元の物を借りる。道・川の注記は準備時に一度だけ足す。
  // 共通定義が更新する mapNotes へ入れると、部隊の下知と取り違えるため別に持つ。
  rt.flags.echizenMapNotes = [...rt.flags.mapNotes,
    { pos: { x: ROAD[2][0], z: ROAD[2][1] }, text: '北陸道' },
    { pos: { x: -156, z: -950 }, text: '麓の谷川' },
  ];

  // 矢そのものと竹束で伝え、独立した指図の字幕を増やさない。
  rt.army.hooks.onArrowRain = () => {};

  // 郭の外へ出たら、近い口へ本道を逆にたどる。制圧前に先の曲がり角へ送らない。
  // 目印と自動操作は同じ点を使い、二つの案内が食い違わないようにする。
  const courtPoint = { x: 0, z: 0 }, courtMouth = { x: 0, z: 0 };
  let courtTarget = null;
  const courtEnemy = o => {
    const u = rt.player.u, zone = passZone(rt);
    return passFighter(o) && Math.abs(o.pos.y - u.pos.y) < 3 &&
      zone.test(o.pos.x, o.pos.z) && !rt.army.wallBetween(u.pos, -1, o.pos, false);
  };
  rt.flags.echizenCourtEnemy = courtEnemy;
  rt.flags.echizenCourtPoint = () => {
    // 制圧済みの観音丸へ残敵が戻った時も、札と同じ郭の口へ案内する。
    const pending = passZone(rt);
    const c = courts.find(c => rt.flags.SZ.byId[c.id] === pending), u = rt.player.u;
    const zone = pending;
    if (zone.test(u.pos.x, u.pos.z)) {
      // 中に入った後も「口へ」の札で遠い中心を指さない。
      // 見通せる守兵へ向き、守兵がいなければ中で味方を待つ。
      const enemy = courtTarget = rt.army.nearestEnemy(u, 180, courtEnemy);
      // 柵際で止まると、組の兵が郭外に残り続ける。守兵がいなければ中へ寄る。
      const center = zone.pos;
      // 守る人数がそろったら本人の場所で待つ。郭の中心まで走らせると
      // 「守れ、あと三秒」の最中にも遠い印へ誘導し、制圧が途切れる。
      const gather = !enemy && zone.friends < zone.need &&
        !rt.army.wallBetween(u.pos, -1, center, false);
      courtPoint.x = enemy ? enemy.pos.x : gather ? center.x : u.pos.x;
      courtPoint.z = enemy ? enemy.pos.z : gather ? center.z : u.pos.z;
      return courtPoint;
    }
    courtTarget = null;
    // 副郭・主郭を攻略する間も、済んだ木戸内へ引き返さない。
    if (!c) {
      const next = rt.world.def.runnerWay(rt.army, u, zone.pos);
      courtPoint.x = next.x; courtPoint.z = next.z;
      return courtPoint;
    }
    let nearest = Infinity;
    for (const [x, z] of c.mouths) {
      const d = Math.hypot(u.pos.x - x, u.pos.z - z);
      if (d >= nearest) continue;
      nearest = d; courtMouth.x = x;
      // 柵の線で止まらず、口の三メートル内側まで入る。
      courtMouth.z = z + (z < (c.z0 + c.z1) / 2 ? 3 : -3);
    }
    const next = rt.world.def.runnerWay(rt.army, u, courtMouth);
    courtPoint.x = next.x; courtPoint.z = next.z;
    return courtPoint;
  };
  rt.marker('echizen-court', rt.flags.echizenCourtPoint,
    () => {
      const zone = passZone(rt);
      if (zone.test(rt.player.u.pos.x, rt.player.u.pos.z)) {
        if (courtTarget) return `${zone.name}の守兵へ`;
        if (zone.enemies) return `${zone.name}の守兵を探せ`;
        return zone.friends < zone.need ? `${zone.name}に味方を集めよ` : `味方と${zone.name}を守れ`;
      }
      return `${zone.name}へ進め`;
    }, { h: 1, groundGuide: true, guideAlways: true, hideNear: 2, hideOnArrival: true });
  const roadMarker = rt.markers.find(m => m.id === 'road');
  if (roadMarker) { roadMarker.groundGuide = true; roadMarker.guideAlways = true; }

  const W = rt.world, pos = [], uv = [], indices = [];
  // 手前の板状の雨筋を省く。風雨・濡れ・射撃への影響は元の更新を使う。
  W.updateNearRain = function () { this.rainNear.visible = false; };
  // 半透明の線で奥行きを塞ぐと、後から描く旗や葉が雨筋の形に欠ける。
  W.rain.material.depthWrite = false;
  const updateWorld = W.update;
  W.update = function (dt, focus) {
    updateWorld.call(this, dt, focus);
    if (!this.rain.visible) return;
    this.rain.material.opacity *= .7;
    this.splashPts.geometry.setDrawRange(0, Math.floor(this.splashT.length / 2) * 6);
    this.splashPts.material.color.setHex(0x92938d);
    this.splashPts.material.opacity = .18 * this.rainLevel;
  };
  // 郭の奥口への直線は長屋の戸口を横切る。建物の四隅を設営時に取り、
  // 外壁を回る短い道を札と自動操作で共有する。室内へ入った時は戸口へ戻す。
  const passHalls = NAKA.list.filter(I => I.kind !== 'gate' && I.kind !== 'yagura' && !I.rot).map(I => {
    const lv = I.levels[0], x0 = I.x - lv.w / 2 - 1.2, x1 = I.x + lv.w / 2 + 1.2;
    const z0 = I.z - lv.d / 2 - 1.2, z1 = I.z + lv.d / 2 + 1.2;
    return { I, x0, x1, z0, z1, corners: [
      { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
    ] };
  });
  const crossesHall = (a, b, h) => {
    let lo = 0, hi = 1;
    for (let axis = 0; axis < 2; axis++) {
      const p = axis ? a.z : a.x, d = (axis ? b.z : b.x) - p;
      const min = (axis ? h.z0 : h.x0) + .65, max = (axis ? h.z1 : h.x1) - .65;
      if (Math.abs(d) < .00001) { if (p <= min || p >= max) return false; }
      else {
        const t0 = (min - p) / d, t1 = (max - p) / d;
        lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
      }
      if (lo >= hi) return false;
    }
    return true;
  };
  const hallPoint = { x: 0, z: 0, botRadius: .45 };
  const aroundHall = (u, want) => {
    for (const h of passHalls) {
      const I = h.I, lv = I.levels[0], p = u.pos;
      if (I.disabled || Math.abs(p.y - lv.y) > 4) continue;
      const atDoor = Math.abs(p.x - I.doorIn.x) < .4 &&
        (p.z - I.z) * I.door.side >= lv.d / 2 - .3 &&
        (p.z - I.z) * I.door.side < (I.doorOut.z - I.z) * I.door.side - .5;
      if (atDoor || Math.abs(p.x - I.x) < lv.w / 2 + .2 && Math.abs(p.z - I.z) < lv.d / 2 + .2) {
        // 奥の壁へ向けず、まず戸口の幅に体をそろえてから外へ歩く。
        hallPoint.x = I.doorIn.x;
        hallPoint.z = Math.abs(p.x - I.doorIn.x) > .35 ? I.doorIn.z : I.doorOut.z;
        return hallPoint;
      }
      if (!crossesHall(p, want, h)) continue;
      let best = Infinity, first = null;
      for (const a of h.corners) {
        if (crossesHall(p, a, h) || rt.army.wallBetween(p, -1, a, false)) continue;
        for (const b of h.corners) {
          if (crossesHall(a, b, h) || crossesHall(b, want, h) ||
              rt.army.wallBetween(a, -1, b, false) || rt.army.wallBetween(b, -1, want, false)) continue;
          const distance = Math.hypot(p.x - a.x, p.z - a.z) + Math.hypot(a.x - b.x, a.z - b.z) +
            Math.hypot(b.x - want.x, b.z - want.z);
          if (distance < best) {
            best = distance;
            first = Math.hypot(p.x - a.x, p.z - a.z) < .6 ? b : a;
          }
        }
      }
      if (first) { hallPoint.x = first.x; hallPoint.z = first.z; return hallPoint; }
    }
    return want;
  };
  const exitPoint = { x: 0, z: 0, botRadius: .6 };
  const roadWay = (u, want) => {
    const F = rt.flags;
    const goal = F.echAdv ? F.echExitAt : F.roadPoint;
    if (!u.isPlayer || !F.step || !goal ||
        Math.hypot(want.x - goal.x, want.z - goal.z) >= .1) return null;
    // 平場の中から遠い折れ目へ投影すると、横の柵へ向かったり入口へ戻る。
    // 確保した郭では先に奥の口の内側へ寄り、そのまま三メートル外へ抜ける。
    const held = F.souFell ? 'kinome_sou' : F.kannonFell ? 'kannon' : null;
    if (!F.echAdv && held && F.SZ.byId[held].test(u.pos.x, u.pos.z)) {
      const mouth = F.souFell ? EXIT_KINOME : EXIT_KANNON;
      exitPoint.x = mouth[0];
      exitPoint.z = mouth[1] + (Math.abs(u.pos.x - mouth[0]) < 2 && u.pos.z > mouth[1] - 4.2 ? 3 : -3);
      return aroundHall(u, exitPoint);
    }
    return kinome.world.runnerWay(rt.army, u, want,
      F.echAdv ? undefined : F.souFell ? kinomeForwardPaths : F.kannonFell ? kannonForwardPaths : undefined);
  };
  // 手当ての十字は既に柵・勾配を調べた行き先。本道へ再投影すると、
  // 安全な平場から柵際へ戻ってしまう。範囲の内側まで歩いて止まる。
  const retreatPoint = { x: 0, z: 0, botRadius: .45 };
  W.def.moveWay = (army, u, want) => {
    const cue = rt.hud.retreatGuide;
    if (u.isPlayer && cue?.active && cue.valid &&
        Math.hypot(want.x - cue.x, want.z - cue.z) < .1 &&
        echizen.botRetreatStepAllowed(rt, cue)) {
      retreatPoint.x = cue.x; retreatPoint.z = cue.z;
      return retreatPoint;
    }
    return roadWay(u, want) || kinome.world.moveWay(army, u, want);
  };
  // 札と地面の印も、自動操作と同じ道の芯・折れ目へ向ける。
  // 木戸内へ入る案内は既に途中の点なので、二重に経路を探さない。
  W.def.guideWay = (u, want) => roadWay(u, want) || want;
  W.def.guideMarkerWay = true;
  // 共通の山並みは目線を中心に半径330〜440mで動く。
  // 広い峠では実際の尾根の内側に入り、頭上に板の裏が見える。
  // この戦は実地形と、dressPass が地図の外へ置く山並みを使う。
  W.mountains.visible = false;
  // 六百メートルで高い山肌を切ると、切り口が空を横切る直線になる。
  // 地図の対角より先まで地面を描き、既存の霞と木・兵の間引きは保つ。
  const cameraFar = rt.camera.far;
  rt.camera.far = Math.max(cameraFar, W.half * 4);
  rt.camera.updateProjectionMatrix();
  // 空の球を遠方へ押すと、映り込み用の小さな球まで同じ深さになる。
  // 背景だけ画面を覆う三角形にし、雲・色・雨量は従来の入れ物を読む。
  // 視点の高さや遠方の切り取りに依存せず、毎コマ形や材質を作らない。
  const skyUniforms = { ...W.skyMat.uniforms,
    passProjection: { value: rt.camera.projectionMatrixInverse },
    passView: { value: rt.camera.matrixWorld } };
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: skyUniforms, depthTest: false, depthWrite: false, fog: false,
    vertexShader: `uniform mat4 passProjection, passView; varying vec3 vP;
      void main() {
        vP = mat3(passView) * (passProjection * vec4(position.xy, 1.0, 1.0)).xyz;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }`,
    fragmentShader: W.skyMat.fragmentShader,
  });
  W.sky.geometry.dispose();
  W.sky.geometry = new THREE.BufferGeometry();
  W.sky.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  W.sky.material = skyMaterial;
  W.sky.frustumCulled = false;
  W.sky.onBeforeRender = (renderer, scene, camera) => {
    skyUniforms.passProjection.value = camera.projectionMatrixInverse;
    skyUniforms.passView.value = camera.matrixWorld;
  };
  for (const c of courts) {
    const y = rt.flags.C.kuruwa[c.id].level, first = pos.length / 3;
    // 兵の足場は保ち、下の地面と同じ土・泥・草の斑を四メートルの格子で受ける。
    const nx = Math.ceil((c.x1 - c.x0) / 4), nz = Math.ceil((c.z1 - c.z0) / 4);
    for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
      const x = c.x0 + (c.x1 - c.x0) * ix / nx, z = c.z0 + (c.z1 - c.z0) * iz / nz;
      pos.push(x, y + .04, z); uv.push(x * .23, z * .23);
      if (ix < nx && iz < nz) {
        const a = first + iz * (nx + 1) + ix, b = a + nx + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    addDeck({ ...c, y: y + .04, name: '門内の土の平場' });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices); geo.computeVertexNormals();
  // 周囲の地表から混合率を補間し、別の茶色い長方形を貼り付けない。
  const sourceGeo = W.terrain.geometry, segments = sourceGeo.parameters.widthSegments;
  for (const name of ['splat', 'water', 'groundCover', 'color']) {
    const source = sourceGeo.attributes[name]; if (!source) continue;   // 色も写す（平場だけ明るい砂色の板に見えていた。10/28）
    const size = source.itemSize;
    const values = new Float32Array(pos.length / 3 * size);
    for (let i = 0; i < pos.length / 3; i++) {
      const gx = Math.max(0, Math.min(segments - .0001, (pos[i * 3] + W.half) / (2 * W.half) * segments));
      const gz = Math.max(0, Math.min(segments - .0001, (pos[i * 3 + 2] + W.half) / (2 * W.half) * segments));
      const ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
      const a = iz * (segments + 1) + ix, b = a + segments + 1;
      for (let j = 0; j < size; j++) values[i * size + j] =
        (source.array[a * size + j] * (1 - tx) + source.array[(a + 1) * size + j] * tx) * (1 - tz)
        + (source.array[b * size + j] * (1 - tx) + source.array[(b + 1) * size + j] * tx) * tz;
    }
    geo.setAttribute(name, new THREE.BufferAttribute(values, size));
  }
  // 大風雨に打たれた峠の土は暗く冷えた色。明るい黄土の板に見えていた（10/28）。郭の平場も同じ材質を写す。
  W.terrain.material.color.setRGB(.6, .58, .54);
  // 雨を吸った土は黄土でなく暗い焦げ茶。乾いた黄の土の段に見えていた（10/28）。草の緑は残し、土の色だけ沈める。
  { const m = W.terrain.material, compile = m.onBeforeCompile, key = m.customProgramCacheKey();
    m.customProgramCacheKey = () => `${key}|越前の濡れ土`;
    m.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('diffuseColor.rgb *= col;', `
        // 灰がかった土も土として沈める（霧の下で白い板に見えていた。10/28 二度目）。草の緑だけ残す。
        float passEarth = clamp((col.r - col.g) * 6.0 + 0.62, 0.0, 1.0) * (1.0 - clamp((col.g - col.r) * 8.0, 0.0, 1.0));
        float passLum = dot(col, vec3(0.3, 0.59, 0.11));
        col = mix(col, vec3(passLum) * vec3(0.8, 0.66, 0.5), passEarth * 0.6);
        col *= mix(0.9, 0.5, passEarth);
        // 10/31 点付け：木戸の前の敷石の升が石畳に見えた。峠の土の道に戻す（敷石の斑は描かない）。
        diffuseColor.rgb *= col;`);
      shader.uniforms.uEchGate = ECH_GATE;
      shader.fragmentShader = 'uniform vec3 uEchGate;\nfloat echPaved = 0.0;\n' + shader.fragmentShader;
      // 雨を吸った土は照りを持つ。草は艶を足さず、茶の地肌だけ粗さを下げて濡れた光を返す（乾いた一枚の土に見えた。10/29）。
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `
        {
          float wetEarth = clamp((diffuseColor.r - diffuseColor.g) * 14.0 + 0.35, 0.0, 1.0) * (1.0 - clamp((diffuseColor.g - diffuseColor.r) * 10.0, 0.0, 1.0));
          wetEarth = max(wetEarth, echPaved * 0.7);
          roughnessFactor = mix(roughnessFactor, min(roughnessFactor, 0.34), wetEarth * 0.85);
          diffuseColor.rgb *= mix(1.0, 0.82, wetEarth);
        }
        #include <normal_fragment_begin>`);
    };
    m.needsUpdate = true; }
  const soilMaterial = W.terrain.material.clone(), soilCompile = W.terrain.material.onBeforeCompile;
  const soilKey = W.terrain.material.customProgramCacheKey();
  soilMaterial.alphaTest = .5;
  soilMaterial.polygonOffset = true; soilMaterial.polygonOffsetFactor = -2; soilMaterial.polygonOffsetUnits = -2;
  const floor = new THREE.Mesh(geo, soilMaterial);
  // 土の縁を幅のある不揃いな斑へ。歩く床・柵・口は残す。
  const edgeSoil = courts.map(c => `
    passSoilEdge = max(passSoilEdge, smoothstep(0.0, 12.0, min(
      min(vPassSoil.x - ${c.x0.toFixed(4)}, ${c.x1.toFixed(4)} - vPassSoil.x),
      min(vPassSoil.y - ${c.z0.toFixed(4)}, ${c.z1.toFixed(4)} - vPassSoil.y))
      + sin(vPassSoil.x * 0.41) * sin(vPassSoil.y * 0.33) * 2.0));`).join('');
  floor.material.customProgramCacheKey = () => `${soilKey}|越前の平場の土の細かな縁`;
  floor.material.onBeforeCompile = function (shader, renderer) {
    soilCompile.call(this, shader, renderer);
    shader.vertexShader = 'varying vec2 vPassSoil;\n' + shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvPassSoil = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = 'varying vec2 vPassSoil;\n' + shader.fragmentShader.replace('#include <alphamap_fragment>',
      // 半分の濃さで一斉に切ると、縁がまた大きな一枚の板になる。
      // 一画素の抜きで下の土へなじませ、透過の描画順や面は増やさない。
      `#include <alphamap_fragment>\nfloat passSoilEdge = 0.0;${edgeSoil}
       float passSoilGrain = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
       if (passSoilEdge <= passSoilGrain) discard;`);
  };
  floor.receiveShadow = true; rt.scene.add(floor);

  // 土だけの霞では梢と幹が濃く残る。共有材質ごとに一度だけ森にも同じ霞を使う。
  const fogMaterials = new Set();
  const fogMesh = mesh => {
    if (!mesh?.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) if (!fogMaterials.has(mat)) {
      fogMaterials.add(mat); passSoilFog(mat);
      if (mat.map && mat.alphaTest > 0) {
        // 縮小された葉の薄い余白まで増幅すると、遠景に四角い板が残る。
        // 既存の葉の抜きだけを整え、幹・木の本数・描画回数は保つ。
        const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
        mat.customProgramCacheKey = () => `${key}|越前の遠い葉の余白`;
        mat.onBeforeCompile = function (shader, renderer) {
          compile.call(this, shader, renderer);
          shader.fragmentShader = shader.fragmentShader.replace(
            'diffuseColor.a *= 1.0 + mipL * 0.28;',
            'if (diffuseColor.a < 0.12) discard;\n diffuseColor.a *= 1.0 + min(mipL, 2.0) * 0.15;');
        };
      }
    }
  };
  for (const mesh of [floor, W.terrain, W.farLand, ...W.treeMeshes, ...(W.farTreeMeshes || [])]) fogMesh(mesh);
  for (const batch of W.cullList || []) for (const source of batch.orig) fogMesh(source.m);
  for (const mesh of rt.scene.children) {
    if (mesh.isMesh && mesh.geometry.attributes.color && mesh.material.vertexColors &&
        mesh.material.map === dirtTex() && mesh.material.side === THREE.DoubleSide) {
      // 二メートル刻みの道の帯は、地表の格子の折れ目をまたいで
      // 土へ埋まり、残った三角形が黒い板に見える。越前は地表に
      // 焼き込んだ道の色を使う。道筋・足場・肩の草石は保つ。
      mesh.visible = false;
    }
  }

  // 近い木の抜きを一画素の細かな粒へ。形も影も増やさず、遠い木は従来のまま。
  for (const mesh of W.treeMeshes) {
    const mat = mesh.material, compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
    mat.customProgramCacheKey = () => `${key}|越前の細かな葉抜き`;
    mat.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        'diffuseColor.a *= smoothstep(1.5, 4.5, length(vViewPosition));',
        `if (length(vViewPosition) < 4.5) {
          vec2 passPixel = floor(gl_FragCoord.xy);
          float passGrain = fract(52.9829189 * fract(dot(passPixel, vec2(0.06711056, 0.00583715))));
          if (passGrain > smoothstep(1.2, 4.5, length(vViewPosition))) discard;
        }`).replace(
        'fract((q.x * 2.0 + q.y * 3.0) * 0.2 + fract(q.y * 0.5) * 0.5)',
        'fract(52.9829189 * fract(dot(q, vec2(0.06711056, 0.00583715))))');
    };
    mat.needsUpdate = true;
  }
  // 据えた物と運ぶ物の両方に、越前だけの切り口を使う。三か所の縄は既存の形を残す。
  const plainTaba = tabaGeo(), passTaba = tabaGeo(false, true);
  rt.scene.traverse(mesh => { if (mesh.isMesh && mesh.geometry === plainTaba) mesh.geometry = passTaba; });

  // 木戸・物見・竹束が手前で目線を塞ぐ時に透かす。弾除けの働きは変えない。
  // 材質・箱・線は初めに用意し、動く竹束も同じ参照で調べる。
  const viewParts = [], viewGroups = [], viewMeshes = new Set(), F = rt.flags;
  const addViewPart = (mesh, group = null) => {
    if (!mesh.isMesh || !mesh.material || viewMeshes.has(mesh)) return;
    viewMeshes.add(mesh);
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(mat => {
      const copy = mat.clone(), compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
      const visibility = { value: 1 };
      copy.userData.passVisibility = visibility;
      // 網目の抜きは携帯で黒い幕に見える。遮る面だけ滑らかに薄くする。
      copy.transparent = true; copy.depthWrite = true; copy.alphaHash = false;
      copy.forceSinglePass = true;
      copy.customProgramCacheKey = () => `${key}|越前の門の薄い透かし`;
      copy.onBeforeCompile = function (shader, renderer) {
        compile.call(this, shader, renderer);
        shader.uniforms.passVisibility = visibility;
        shader.fragmentShader = 'uniform float passVisibility;\n' + shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          'diffuseColor.a *= passVisibility;\n #include <opaque_fragment>');
      };
      return copy;
    });
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    viewParts.push({ mesh, materials, group, blocked: false, faded: false });
  };
  for (const part of [F.gateKannon, F.gateKinome, F.gateSaikoji, F.gateHachibuse,
    F.towerKannon, F.towerKinome, F.towerSaikoji, F.towerHachibuse]) {
    // 柱だけが薄れ、屋根が宙に残らないよう、一つの建物は一緒に透かす。
    const group = { blocked: false };
    viewGroups.push(group);
    for (const root of [part.mesh, part.frame]) if (root) root.traverse(mesh => addViewPart(mesh, group));
  }
  for (const tb of F.tabas || []) addViewPart(tb.m);
  // 束ねた板塀は、描く面の拾い直しを待つと視点だけが外へ抜ける。
  // 歩行と同じ塀から薄い箱を一度作り、開いた口と壊れた塀は通す。
  const cameraWalls = F.C.walls.filter(s => s.seg).map(s => {
    const [ax, az, bx, bz] = s.seg, length = Math.hypot(bx - ax, bz - az);
    const foot = Math.min(W.heightAt(ax, az), W.heightAt(bx, bz));
    return { s, ax, az, length, tx: (bx - ax) / length, tz: (bz - az) / length,
      bottom: foot - .3, top: Math.max(W.heightAt(ax, az), W.heightAt(bx, bz)) + (s.h || 1.8) + .25 };
  });
  const cameraBlock = W.cameraBlockFraction;
  W.cameraBlockFraction = (from, to) => {
    let hit = cameraBlock?.call(W, from, to) ?? null;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    for (const w of cameraWalls) {
      if (!w.s.alive || w.s.opened || !w.length) continue;
      const x = from.x - w.ax, z = from.z - w.az;
      let lo = 0, hi = hit ?? 1;
      for (let axis = 0; axis < 3; axis++) {
        const p = axis === 0 ? x * w.tx + z * w.tz : axis === 1 ? -x * w.tz + z * w.tx : from.y;
        const d = axis === 0 ? dx * w.tx + dz * w.tz : axis === 1 ? -dx * w.tz + dz * w.tx : dy;
        const a = axis === 0 ? -.25 : axis === 1 ? -.35 : w.bottom;
        const b = axis === 0 ? w.length + .25 : axis === 1 ? .35 : w.top;
        if (Math.abs(d) < .000001) {
          if (p < a || p > b) { hi = -1; break; }
        } else {
          const t0 = (a - p) / d, t1 = (b - p) / d;
          lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
          if (lo > hi) break;
        }
      }
      if (lo <= hi && lo > .0001 && lo < 1) hit = lo;
    }
    return hit;
  };
  const cameraTick = rt.player.updateCamera, direction = new THREE.Vector3();
  const target = new THREE.Vector3(), eye = new THREE.Vector3(), candidate = new THREE.Vector3();
  const box = new THREE.Box3(), ray = new THREE.Ray(), hit = new THREE.Vector3();
  let downView = false, fadeT = 0;
  const cameraGround = {};
  F.echizenCameraGround = cameraGround;
  rt.player.updateCamera = function (dt, camera) {
    // 開始札の間は低い所からの引きを止め、竹束の後ろの兵へ潜らない。
    if (rt.hud.introWaiting) this.introT = 0;
    cameraTick.call(this, dt, camera);
    const u = this.u, p = camera.position;
    // 空の球も峠の目線へ上げる。地表から三百メートル登っても
    // 球の端と遠方の切り取りで空に三角の色違いを残さない。
    if (!rt.game.photo) {
      if (!u.alive) {
        if (!downView) {
          target.copy(u.pos); target.y += 1.4;
          let score = Infinity;
          // 深手では高さで斜面を避けない。低い位置から見通せる側へ回る。
          for (const radius of [6, 9, 12]) for (let i = 0; i < 16; i++) {
            const angle = this.yaw + Math.PI + i * Math.PI / 8;
            const x = u.pos.x + Math.sin(angle) * radius, z = u.pos.z + Math.cos(angle) * radius;
            const y = groundAt(W, x, z, u.pos.y) + 1.5;
            if (Math.abs(y - target.y) > radius * .3) continue;
            candidate.set(x, y, z);
            let clear = true;
            for (let j = 1; j <= 12; j++) {
              const f = j / 12, sx = target.x + (x - target.x) * f, sz = target.z + (z - target.z) * f;
              if (target.y + (y - target.y) * f < W.heightAt(sx, sz) + .3) { clear = false; break; }
            }
            if (!clear || this.camBlockHit(target, candidate) !== null) continue;
            const cost = Math.abs(y - target.y) + Math.min(i, 16 - i) * .3 + radius * .05;
            if (cost < score) { score = cost; eye.copy(candidate); }
          }
          if (score === Infinity) {
            // 狭い所でも真上へ逃がさず、倒れた場所から戦場へ目を向ける。
            eye.copy(u.pos); eye.y = groundAt(W, eye.x, eye.z, u.pos.y) + 1.5;
            target.set(eye.x + Math.sin(this.yaw) * 8, eye.y, eye.z + Math.cos(this.yaw) * 8);
          }
          downView = true;
        }
        p.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(target);
        this.camPos.copy(p);
      } else {
        downView = false;
        if (!rt.over && !this.aiming && this.fpK <= .5) {
          target.copy(u.pos); target.y += 1.4;
          if (passGroundView(W, target, p)) {
            const wall = this.camBlockHit(target, p);
            if (wall !== null) {
              p.lerpVectors(target, p, Math.max(0, wall - .25 / Math.max(.25, target.distanceTo(p))));
              passGroundView(W, target, p);
            }
            camera.up.set(0, 1, 0); camera.lookAt(target);
            this.camPos.copy(p);
          }
        } else if (!rt.over) {
          const y = groundAt(W, p.x, p.z, u.pos.y) + .8;
          if (p.y < y) {
            camera.getWorldDirection(direction); p.y = y;
            camera.up.set(0, 1, 0); direction.add(p); camera.lookAt(direction);
            this.camPos.copy(p);
          }
        }
      }
    }
    // 目の中心だけでなく手前の四隅も土の上へ。重傷の静止視点にも毎回適用する。
    if (!rt.game.photo) {
      if (u.alive && !this.aiming && this.fpK <= .5) {
        target.copy(u.pos); target.y += 1.4;
        const x = p.x, y = p.y, z = p.z;
        avoidCameraBodies(rt.army.units, u, target, p);
        if (p.x !== x || p.y !== y || p.z !== z) {
          passGroundView(W, target, p);
          camera.up.set(0, 1, 0); camera.lookAt(target);
        }
      }
      guardDrawCamera(W, camera, cameraGround);
      // 共通の補正は格子の地面だけを読む。重ねた土の手前の四隅も守る。
      camera.updateMatrixWorld();
      const e = camera.matrixWorld.elements;
      const h = camera.near * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
      let lift = 0;
      for (let i = 0; i < 5; i++) {
        const dx = i === 0 ? 0 : (i & 1 ? h : -h) * camera.aspect;
        const dy = i === 0 ? 0 : (i & 2 ? h : -h), dz = i === 0 ? 0 : -camera.near;
        const x = p.x + e[0] * dx + e[4] * dy + e[8] * dz;
        const y = p.y + e[1] * dx + e[5] * dy + e[9] * dz;
        const z = p.z + e[2] * dx + e[6] * dy + e[10] * dz;
        for (const c of courts) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1)
          lift = Math.max(lift, c.y + .12 - y);
      }
      if (lift > 0) { p.y += lift; camera.updateMatrixWorld(); }
      this.camPos.copy(p);
    }
    W.sky.position.copy(p);
    fadeT -= dt;
    if (fadeT > 0) return;
    fadeT = .12;
    camera.getWorldDirection(direction); ray.set(p, direction);
    for (const group of viewGroups) group.blocked = false;
    for (const part of viewParts) {
      const mesh = part.mesh;
      mesh.updateWorldMatrix(true, false);
      box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld).expandByScalar(.8);
      // 中心線の外の門柱も、目のすぐ脇で画面を覆う間は透かす。
      part.blocked = mesh.visible && (box.distanceToPoint(p) < 4 ||
        (ray.intersectBox(box, hit) !== null && hit.distanceToSquared(p) < 36));
      if (part.group && part.blocked) part.group.blocked = true;
    }
    for (const part of viewParts) {
      const faded = !rt.game.photo && part.mesh.visible && (part.group ? part.group.blocked : part.blocked);
      if (part.faded === faded) continue;
      part.faded = faded;
      // 目を遮る屋根と柱だけ薄くし、点々の幕を戦場へ重ねない。
      // 視点が離れたら全て戻す。材質の再作成・再コンパイルはしない。
      // 薄く残すと、内側から見た竹束や屋根が霧の中の透けた建物の絵として二重に重なる。遮る間は描かない。
      for (const mat of part.materials) {
        mat.userData.passVisibility.value = 1;
        mat.visible = !faded;
      }
    }
  };
  // 郭の守兵も開戦から索敵する。塀と本来の持ち場を保ち、時計で応戦を止めない。
  // 深手は出血の共通札一つに任せ、同じ退避の声を重ねない。
  rt.player.treatmentHint = true;
  rt.retreatCallN = 4;
  // 持ち場の手前の道肩に半ば埋まった岩と根の草、捨てた俵・材木、踏まれた泥（共通の stage_dress）。
  // 陣小屋・柵・幟は既にあるので足さない。道の上と篝火（大風雨）は置かない。
  // 開戦の旗（ake）の所から西の陣小屋を向く画面が最初の二十五秒に写る（10/28 の採点の画面）。
  dressStage(rt, { at: rt.flags.passOpeningPost, heading: -1.75, huts: 0, fence: false, flag: false, yagura: false, clutter: 5, fire: false, rocks: 0, wet: .9, // 角の立つ大岩が画面の右下を塞いだ（10/29 18:10 採点）。岩は置かない。
    avoid: (x, z) => ECHIZEN_PATHS.some(path => distToPolyline(x, z, path) < 4) });
  const dispose = rt.dispose;
  rt.dispose = function (...args) {
    layout.remove();
    rt.camera.far = cameraFar;
    rt.camera.updateProjectionMatrix();
    W.sky.geometry.dispose();
    skyMaterial.dispose();
    return dispose.apply(this, args);
  };
};

// 10/30：木戸の前の押し合いで、組の後ろの者を突っ立たせない（20人中1人しか動かなかった）。
// 先手と打って出た一揆勢の徒歩の兵だけ。届く者は今までどおり斬り、届かぬ者は斬り結ぶ前の味方の背へ詰めて押し、
// 前に味方のいない者は敵の脇へ出て槍を合わせる。兵・形・材質は足さず、行き先と見張る相手だけを替える。
function gatePress(rt) {
  const F = rt.flags, P = rt.player.u, A = rt.army;
  const groups = [F.ake?.real, F.gateSally?.real];
  if (!groups[1] || !groups[1].count || groups[1].routed) return;
  for (const g of groups) {
    if (!g || !g.count) continue;
    for (const u of g.units) {
      if (!u.alive || u.fleeing || u.mounted || u.woundOut || u.downed || u.gone || u.atk || u.swing || u.hit
        || u.type === 'gun' || u.type === 'bow' || u.dragging) continue;
      if (Math.abs(u.pos.x - P.pos.x) > 32 || Math.abs(u.pos.z - P.pos.z) > 32) continue;
      if (u.moveTo === u._pressPt) u.moveTo = null;
      if (u.pressBack?._pressBy === u) u.pressBack._pressBy = null;
      u.pressBack = null;
      const tg = u.target;
      // 共通の壁よけを、この押し合いの補助で上書きしない。
      // 塀の向こうや戦えない負傷兵へ寄せると、木戸前の列が壁に張り付く。
      const canPress = o => passFighter(o) && o.team !== u.team &&
        Math.abs(o.pos.y - u.pos.y) < 2 && !A.wallBetween(u.pos, -1, o.pos, false);
      const foe = canPress(tg) ? tg : A.nearestEnemy(u, 12, canPress);
      if (!foe) continue;
      const fx = foe.pos.x - u.pos.x, fz = foe.pos.z - u.pos.z, d = Math.hypot(fx, fz) || 1;
      const reach = u.reach || 2;
      if (tg === foe && d <= reach + 0.4) continue;
      // 前で斬り結ぶ同じ組の者（敵に自分より近い者）の背へ
      let fr = null, best = 20;
      for (const o of g.units) {
        if (o === u || !o.alive || o.fleeing || o.mounted || o.type === 'gun' || o.type === 'bow') continue;
        const ot = o.swing?.target || o.atk?.target || o.target;
        if (!ot?.alive || ot.isStruct || ot.team === o.team) continue;
        if (Math.hypot(ot.pos.x - o.pos.x, ot.pos.z - o.pos.z) > (o.reach || 2) + 1) continue;
        if (Math.hypot(foe.pos.x - o.pos.x, foe.pos.z - o.pos.z) > d - 0.6) continue;
        const k = (o.pos.x - u.pos.x) ** 2 + (o.pos.z - u.pos.z) ** 2;
        if (k < best && !(o._pressBy && o._pressBy !== u && o._pressBy.alive && o._pressBy.pressBack === o)) { best = k; fr = o; }
      }
      const pt = u._pressPt || (u._pressPt = { x: 0, z: 0 });
      u.watch = foe;
      if (fr) {
        const ot = fr.swing?.target || fr.atk?.target || fr.target;
        const bx = fr.pos.x - ot.pos.x, bz = fr.pos.z - ot.pos.z, bl = Math.hypot(bx, bz) || 1;
        pt.x = fr.pos.x + bx / bl * 1.05; pt.z = fr.pos.z + bz / bl * 1.05;
        u.pressBack = fr; fr._pressBy = u;
      } else {
        // 前が空いている：敵の脇（左右に一歩ずらす）の間合いへ出る
        const side = u.id % 2 ? 1 : -1, r = reach * 0.85;
        pt.x = foe.pos.x - fx / d * r + (-fz / d) * side * 0.9; pt.z = foe.pos.z - fz / d * r + (fx / d) * side * 0.9;
        u.pressBack = null;
      }
      if (A.wallBetween(u.pos, -1, pt, false) || !rt.world.walkable(pt.x, pt.z)) {
        if (fr && fr._pressBy === u) fr._pressBy = null;
        u.pressBack = null;
        continue;
      }
      u.moveTo = pt;
    }
  }
}

echizen.update = function (rt, dt) {
  // 郭へ進む下知を出す前に、木戸前の押し合いの借りた命令を返す。
  if (rt.flags.gateKannon && !rt.flags.gateKannon.struct.alive) endHeroFrontClash(rt);
  // 崖や出血で先に alive が落ちた時も、共通の重傷・やり直し・結果へ渡す。
  // 兵を立たせ直さず、既に出ているやり直しの札はそのまま待つ。
  if (!rt.player.u.alive) {
    if (!rt.over && !rt.flags.ending && !rt.retryOpen) rt.playerDown();
    return;
  }
  if (rt.flags.echAdv) {
    echizenAdvanceTick(rt);
    return;
  }
  const openingGuard = rt.flags.roadGuards?.[0];
  // 味方が敵と木戸を先に片付けた場合も、本人の入城で続けられる。
  // 開いた木戸の前で立つだけでは最初の下知を終えない。
  if (!rt.flags.step && rt.flags.gateKannon && !rt.flags.gateKannon.struct.alive &&
      rt.flags.SZ?.byId?.kannon?.test(rt.player.u.pos.x, rt.player.u.pos.z))
    rt.flags.echOpeningHit = true;
  if (!rt.flags.step && rt.flags.echOpeningHit &&
      (!openingGuard || openingGuard.aliveNominal() <= 0 || rt.t >= 30)) this.assault(rt);
  // 時計だけで本人の一撃を捏造しない。寄せは実際の命中か本人の入城で進める。
  {
    // 観音丸は味方の寄せだけでは落ちない：本人が郭の中で30秒戦うまでは、押さえの時間が数え始まらない。
    // 11/4 jin_echizen（AP8・BA3）：前は開戦から240秒まで待たせ、守兵のいない郭で二分立ち尽くしていた。待ちの時計はやめ、郭の守兵との斬り合いで長さを作る。
    const FF = rt.flags, kz = FF.SZ?.byId?.kannon, pu = rt.player.u;
    if (kz && !FF.kannonFell) {
      if (kz.test(pu.pos.x, pu.pos.z) && pu.alive) FF.kannonIn = (FF.kannonIn || 0) + dt;
      if (FF.kannonHold0 == null) FF.kannonHold0 = kz.hold;
      // 郭に立っているだけでは守兵を退かせない。本人の一撃も必要。
      // 味方が既に討ち切った場合は、本人の入城後すぐ本来の制圧時間を数える。
      // 空の郭で三十秒待たせず、郭の外にいる間は味方だけで制圧させない。
      const open = pu.alive && kz.test(pu.pos.x, pu.pos.z) &&
        (kz.enemies === 0 || (FF.kannonIn || 0) >= 30 && !!FF.breachHit_kannon);
      kz.hold = open ? FF.kannonHold0 : 1e9;
      if (!open) kz.holdT = 0;
      // 11/1：郭の内を味方が三倍で押さえたら、本道から駆け下りた小勢の残りは踏みとどまらず退く（郭が空かず時間切れになった）。
      if (open && kz.enemies && kz.friends >= 3 * kz.enemies && (FF._kzRoutT = (FF._kzRoutT || 0) - dt) <= 0) {
        FF._kzRoutT = 2;
        for (const g of rt.army.groups) {
          if (g.team !== 1 || g.routed || !g.units.some((q) => q.alive && !q.fleeing && kz.test(q.pos.x, q.pos.z))) continue;
          g.routed = true; g.order = 'flee'; g.morale = 0; g.focus = null;
          g.fleeDir = { x: 0, z: 1 };
          for (const q of g.units) { q.fleeing = true; q.target = null; q.aiT = 0; }
        }
      }
    }
  }
  kinome.update.call(this, rt, dt);
  passRoadEngage(rt);
  // 観音丸の寄せが七十秒を過ぎても郭が落ちない時、前田・佐々・不破の手が上がって来る（echizen/goryu.js）
  if (rt.flags.step && !rt.flags.kannonFell && !rt.flags.echGoryu && rt.t - (rt.flags.stepT ?? rt.t) > 70) EC_GORYU.start(rt, echGoryuCtx(rt));
  EC_GORYU.tick(rt, dt);
  EC_KURUWA.tick(rt, dt);   // 届かない守兵が残って郭が落ちない時（echizen/kuruwa.js）
  EC_SEIEI.tick(rt);        // 副郭へ打って出る一揆の精鋭（echizen/seiei.js）
  echizenAdvanceTick(rt);
  const F = rt.flags, u = rt.player.u;
  if (rt.over || F.ending || F.echAdv || !u.alive) return;
  huntPlayer(rt, dt);
  // 打って出る二十四人は passButai で準備済み。更新時に十二人を重ねて足さない。
  // 11/6 fixc0917_echizen（kaito 九2「味方だけで片付く散歩ゲーム」）：打って出た一揆勢と郭の守兵は、本人が刃の届く所へ来るまで固く受ける。
  //   本人が寄れば常の固さに戻る（何もしなければ①③は進まない。負けにもしない）
  { const sg = F.gateSally?.real;
    if (sg?.count && rt.t > 28) { const c = sg.center(); sg.defMult = Math.hypot(c.x - u.pos.x, c.z - u.pos.z) < 16 ? 1 : 5; }
    const kg = F.d?.kannon?.real, zone = passZone(rt);
    if (kg?.count && !F.kannonFell) { const inside = !!zone?.test(u.pos.x, u.pos.z); kg.defMult = inside ? 1 : 5; kg.noRout = !inside; } }
  // 郭の守兵は郭から引き出さない（引き出すと郭が空になり、一戦が一分半で終わった）。木戸が破れるまでの間だけ。
  heroFrontClash(rt, dt, { foeN: 42, allyN: 28, reach: 110, foeD: 12, allyD: 7, active: (r) => !!r.flags.gateKannon?.struct.alive,
    // 打って出る隊まで正面の待機へ借りると、攻撃の下知が半秒後に上書きされる。
    skip: (g, foe) => foe && (g === F.gateSally?.real || (F.defenders || []).some((b) => b?.real === g)) });
  // kaito 10/31：門外の二人と打って出た一揆勢を別々に当てず、開戦の下知と同時に一つの群れで先手へ打ちかかる。
  // 開戦直後から打って出る。十二秒の待機では、木戸前の兵が五秒以上立ち尽くしていた。
  if (!F.waveOpen && F.gateSally?.aliveNominal() > 0) { F.waveOpen = true; F.gateSally.order({ id: 'attack' }); }
  // 本道に四十五歩おきに立つ小勢も、一組ずつ待たせない。観音丸の木戸が破れたら、全部が一斉に本道を駆け下りる。
  if (!F.waveRoad && F.gateKannon && !F.gateKannon.struct.alive) {
    F.waveRoad = true;
    for (const b of F.roadGuards || []) if (!b._openingPost && b.aliveNominal() > 0) { b._roadEngaged = true; b.order({ id: 'attack' }); }
  }
  gatePress(rt);
  echizenTsukeiri(rt);
  // 二陣（滝川・蜂屋）は木戸が開いたら郭の中へ押し入る
  if (F.niJin && !F.niJinGo && F.gateKannon && !F.gateKannon.struct.alive) {
    F.niJinGo = true;
    const c = F.SZ?.byId?.kannon?.pos, G = F.niJinGate;
    F.niJin.forEach((g, i) => {
      g.order = 'path'; g.formation = 'column'; g.colW = 2; g.pathIdx = 0; g.dest = null; g.aggro = 10;
      g.path = [[G.x + (i ? 2 : -2), G.z - 4], [G.x + (i ? 2 : -2), G.z + 8], ...(c ? [[c.x * 0.4 + G.x * 0.6 + (i ? 4 : -4), c.z * 0.4 + G.z * 0.6]] : [])];
      g.onArrive = (q) => { q.order = 'hold'; };
    });
  }
  // 木戸を破られた郭の守りは、長くは踏みとどまらない（一揆勢は峠の奥へ退いた）。
  // 本人が守兵へ一撃を当て、郭の中で四十秒戦ったら残りを崩して奥へ退かせる。
  for (const [gate, fell, key] of [[F.gateKannon, F.kannonFell, 'kannon'], [F.gateKinome, F.souFell, 'kinome_sou']]) {
    if (fell || !gate || gate.struct.alive) continue;
    // 本人が郭へ入る前の経過時間だけで守兵を退かせない。
    const zone = F.C?.kuruwa?.[key];
    if (!F['breachHit_' + key] || !zone?.test(u.pos.x, u.pos.z)) continue;
    const fought = F['breachFight_' + key] = (F['breachFight_' + key] || 0) + dt;
    if (fought < 40 || F['broke_' + key]) continue;
    F['broke_' + key] = true;
    for (const b of F.defenders || []) {
      const g = b?.real;
      if (!g || g.routed || !g.units?.some((q) => q.alive && zone?.test(q.pos.x, q.pos.z))) continue;
      g.routed = true; g.order = 'flee'; g.morale = 0;
      g.fleeDir = { x: 0, z: 1 };
      for (const q of g.units) { q.fleeing = true; q.target = null; q.aiT = 0; }
    }
  }
  // 長い山道の列待ちを詰める。敵・味方の人数と斬り合いの速さは保つ。
  for (const b of F.attackers) if (b._route && b.real?.order === 'move') b.real.speed = 3.6;
  // 遠くでは寄る場所を伝え、実際に掛矢を使える範囲だけ操作を案内する。
  // 札の時刻を更新せず、同じ案内を声や知らせへ繰り返し流さない。
  F.gateGuideT = (F.gateGuideT || 0) - dt;
  if (F.gateGuideT <= 0) {
    F.gateGuideT = .25;
    // 十二秒で退避を打ち切った試し役も、その後に本当に手当て可能な
    // 場所へ着いたら布を使える。安全判定・待ち時間・布の枚数は保つ。
    if (rt.botTreatNext === Infinity && rt.player.treatmentReady) rt.botTreatNext = 0;
    const hand = rt.interacts.find(it => it.id === '_gram');
    if (hand && rt._gg?.cur?.alive) {
      const pos = typeof hand.pos === 'function' ? hand.pos() : hand.pos;
      const ready = pos && Math.hypot(pos.x - u.pos.x, pos.z - u.pos.z) < hand.r;
      const text = ready ? '木戸を打ち破れ' : '木戸の前へ。味方と進め';
      let changed = false;
      for (const o of rt.objectives) if (o.id === '_gate' && o.text !== text) { o.text = text; changed = true; }
      const order = rt.orderObjectives?.get('_gate');
      if (order && order.text !== text) { order.text = text; changed = true; }
      if (changed && rt.missionGuide) rt.missionGuide.scan = 0;
    }
    // 奥の二郭でも、守兵・味方の人数・守る時間を同じ任務札で伝える。
    const zoneId = !F.kannonFell ? 'kannon' : !F.souFell ? 'kinome_sou'
      : (F.SZ.byId.kinome_fuku.owner !== 'friend' || EC_SEIEI.active(rt)) ? 'kinome_fuku' : 'kinome_hon';
    const zone = F.SZ?.byId[zoneId];
    const gate = !F.kannonFell ? F.gateKannon : !F.souFell ? F.gateKinome : null;
    const name = zoneId === 'kannon' ? '観音丸' : zoneId === 'kinome_sou' ? '木戸内'
      : zoneId === 'kinome_fuku' ? '奥の曲輪' : '奥の本陣';
    const place = zoneId === 'kannon' ? `${name}の中` : name;
    if (F.step && zone && (!gate || !gate.struct.alive)) {
      const inside = zone.test(u.pos.x, u.pos.z);
      // 本道を取り終えた後の、別手を待つ下知を守備の秒数で上書きしない。
      const text = zoneId === 'kinome_hon' && zone.owner === 'friend' && F.fourCastleTask
        ? F.fourCastleTask
        : !inside ? `${place}へ。開いた口を通れ`
        : zone.enemies > 0 ? `${place}の守兵を討て（残り${zone.enemies}人）`
        : zone.friends < zone.need ? rt.squad.length
          ? `${name}で「ついて来い」。あと${zone.need - zone.friends}人集めよ`
          : `${name}で味方を待て。あと${zone.need - zone.friends}人`
        : `${name}を守れ。あと${Math.max(0, Math.ceil(zone.hold - zone.holdT))}秒`;
      let changed = false;
      for (const o of rt.objectives) if (o.id === 'main' && (o.text !== text || o.progress)) {
        o.text = text; o.progress = ''; changed = true;
      }
      const order = rt.orderObjectives?.get('main');
      if (order && (order.text !== text || order.progress)) { order.text = text; order.progress = ''; changed = true; }
      if (changed && rt.missionGuide) rt.missionGuide.scan = 0;
    }
  }
  if (u.hp <= u.maxHp * .4 && !F.dangerTip) {
    F.dangerTip = true;
    if (!(u.wounds?.bleed > .0001)) rt.bark('深手じゃ。構えたまま、味方の後ろへ退け', true);
  }
  if (!F.echizenGateCleared && !F.gateKannon.struct.alive) {
    F.echizenGateCleared = true;
    F.echizenIkkiCrowd?.retreat?.(30, 16); F.echizenIkkiHost?.retreat?.(40, 20);
    // 11/1：破った後、本人と味方は郭の中（乱戦の立つ所）へ入る。一揆勢が崩れて退いた後は乱戦ごと消し、道に軽い兵を残さない。
    for (const C of F.echizenFenceClash || []) { C.rout?.('B', { hideAfter: 8 }); rt.after(9, () => { if (C.mesh) C.mesh.visible = false; }); }
    // 11/1：破れた口へ本人が先に飛び込むと、味方が着くまで郭の守兵二十四人の刃を一人で受けて倒れた。味方が追いつく二十秒だけ刃を浅く。
    { const g = F.d?.kannon?.real;
      if (g && !g._breachSoft) { g._breachSoft = true; const dm = g.dmgMult; g.dmgMult = (dm ?? 1) * 0.3; rt.after(30, () => { g.dmgMult = dm; }); } }   // 11/1 rest_B：0.5・20秒でも act の bot が六秒で倒れた
    rt.objRemove('_gate');
    for (let i = rt.objectives.length - 1; i >= 0; i--) {
      const o = rt.objectives[i];
      if (/木戸を打ち破れ/.test(o.text) || /打つ/.test(o.text) && /長押し/.test(o.text)) rt.objRemove(o.id);
    }
    for (const [id, o] of rt.orderObjectives || [])
      if (/木戸を打ち破れ/.test(o.text) || /打つ/.test(o.text) && /長押し/.test(o.text)) rt.objRemove(id);
    if (!F.kannonFell) rt.obj('main', '観音丸の郭へ入り、味方と守兵を討て', 'main', true);
  }
};

// 11/4 p100_echizen（kaito 11/3 の手本 ref04〜07：山中城の付け入り）：大手の木戸の前へ打って出た一揆勢を迎え撃ち、
//   七割を討つと残りは木戸の内へ退く。退く敵の後ろについて、自分か味方が木戸の口まで追いすがれば木戸は閉まらず、そのまま郭へ入る。
//   三十秒のうちに誰も追いすがれなければ木戸を閉められ、掛矢で破る（今までの作り）。
function echizenTsukeiri(rt) {
  const F = rt.flags, g = F.gateSally?.real, st = F.gateKannon?.struct;
  if (!g || !st?.alive || F.tsukeiriDone || !F.waveOpen) return;
  if (!F.sallyBroke) {
    const all = g.units.length, up = g.units.filter((q) => q.alive && !q.fleeing).length;
    if (rt.t < 30 || up > all * 0.3) return;
    F.sallyBroke = true; F.sallyBrokeT = rt.t;
    const c = g.center(), dx = GATE_KANNON.x - c.x, dz = GATE_KANNON.z + 10 - c.z, L = Math.hypot(dx, dz) || 1;
    g.routed = true; g.order = 'flee'; g.morale = 0; g.noRout = false; g.focus = null; g.fleeDir = { x: dx / L, z: dz / L };
    for (const q of g.units) { q.fleeing = true; q.target = null; q.aiT = 0; }
    rt.say('組頭', '一揆勢が木戸へ退くぞ。後ろについて付け入れ！', 4);
    return;
  }
  const P = rt.player.u.pos, at = (q, r) => Math.hypot(q.x - GATE_KANNON.x, q.z - GATE_KANNON.z) < r;
  // 先手だけで付け入りを済ませず、本人も退く敵を追って木戸へ届く。
  const chase = rt.player.u.alive && at(P, 8);
  if (chase) {
    F.tsukeiriDone = F.tsukeiri = true;
    rt.army.damage(st, st.hp + 1, rt.player.u);
    rt.say('組頭', '木戸を閉めさせるな！　付け入ったぞ、郭へ押し込め！', 3.5);
  } else if (rt.t - F.sallyBrokeT > 30) {
    F.tsukeiriDone = true;
    rt.say('組頭', '木戸を閉められた！　掛矢で打ち破れ', 3.5);
  }
}

// 木戸を抜けた後、打ちかけてくる相手は受けるが、郭外の敵を追って制圧を中断しない。
// 印と同じ迂回路で敵へ寄る。堂や柵の向こうへ直進して、壁越しに突き続けない。
function passBotEnemyRoute(rt, inp, helpers, enemy) {
  const p = rt.player;
  if (!rt.army.wallBetween(p.u.pos, -1, enemy.pos, false)) return false;
  const way = rt.world.def.runnerWay(rt.army, p.u, enemy.pos);
  if (p.lock) inp.e.add('KeyQ');
  inp.runHeld = true;
  helpers.goTo(p, inp, way.x, way.z, .5, true);
  return true;
}
echizen.botBrain = function (rt, inp, helpers) {
  const F = rt.flags;
  if (F.echAdv) {
    const p = rt.player, u = p.u;
    inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
    inp.leftPressed = false; inp.chargeHold = false; inp.quickCmd = null;
    inp.guardHold = false; inp.runHeld = false;
    if (!u.alive || rt.over || F.ending) return;
    const foe = F.echExitAt ? null : echTailTarget(rt);
    if (foe) {
      if (passBotEnemyRoute(rt, inp, helpers, foe)) return;
      // 木戸内の殿へ寄せて突く
      const distance = Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
      p.yaw = Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
      helpers.goTo(p, inp, foe.pos.x, foe.pos.z, (p.weapon === 'sword' ? 1.9 : 2.8) * .85, true);
      helpers.patientStrike(p, inp, foe, distance);
      return;
    }
    if (p.lock) inp.e.add('KeyQ');
    if (!F.echExitAt) return;
    // 郭の堂と柵、北口の後ろの堀切をよけて、峠道の殿の前へ進む。
    const next = rt.world.def.moveWay(rt.army, u, F.echExitAt);
    inp.runHeld = true;
    helpers.goTo(p, inp, next.x, next.z, next.botRadius ?? 1, true);
    return;
  }
  // 本人の一撃が付け入りの条件。下知待ちの共通処理へ渡す前に、
  // 印と同じ打って出た隊へ寄る。味方が討ち切った時は木戸を打つ。
  if (!F.step && !F.echOpeningHit) {
    const p = rt.player, u = p.u;
    inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
    inp.leftPressed = false; inp.chargeHold = false; inp.quickCmd = null;
    inp.guardHold = false; inp.runHeld = false;
    if (!u.alive || rt.over || F.ending) return;
    const foe = passNearestFoe(rt);
    if (foe) {
      if (passBotEnemyRoute(rt, inp, helpers, foe)) return;
      const distance = Math.hypot(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
      if (p.lock && p.lock !== foe) inp.e.add('KeyQ');
      p.yaw = Math.atan2(foe.pos.x - u.pos.x, foe.pos.z - u.pos.z);
      helpers.goTo(p, inp, foe.pos.x, foe.pos.z, (p.weapon === 'sword' ? 1.9 : 2.8) * .85, true);
      helpers.patientStrike(p, inp, foe, distance);
      return;
    }
    const gate = F.gateKannon?.struct;
    if (gate?.alive) {
      if (p.lock) inp.e.add('KeyQ');
      const at = F.passOpeningGatePoint || (F.passOpeningGatePoint = { x: 0, z: 0 });
      at.x = (gate.seg[0] + gate.seg[2]) / 2 - gate.nx * 1.2;
      at.z = (gate.seg[1] + gate.seg[3]) / 2 - gate.nz * 1.2;
      const next = rt.world.def.runnerWay(rt.army, u, at);
      inp.runHeld = true;
      helpers.goTo(p, inp, next.x, next.z, .25, true);
      if (Math.hypot(u.pos.x - at.x, u.pos.z - at.z) < .6) {
        inp.k.delete('KeyW'); inp.runHeld = false;
        p.yaw = Math.atan2(gate.nx, gate.nz);
        const ram = rt.interacts.find(it => /^(_g)?ram/.test(it.id));
        const pos = ram && (typeof ram.pos === 'function' ? ram.pos() : ram.pos);
        if (pos && Math.hypot(pos.x - u.pos.x, pos.z - u.pos.z) < ram.r) inp.k.add('KeyE');
        else inp.leftPressed = !p.guard && p.time - (p.guardOffT ?? -9) > .45 && p.cd <= 0 && !p.pending;
      }
      return;
    }
  }
  // 札・ピンと同じ未制圧の郭へ向かう。副郭以降も遠い本道を追い越さない。
  const gate = passGate(rt);
  const zone = !gate?.struct.alive ? passZone(rt) : null;
  const followingRoad = F.kannonFell && gate?.struct.alive;
  if (!zone && !followingRoad) return kinome.botBrain(rt, inp, helpers);
  // 道脇から打ちかける兵も、退いた後までは追わない。
  // 共通の頭は十メートル以内の攻撃者へ寄るため、次の木戸へ移る間だけ
  // 構えて受けながら本道の印へ進む。
  const g = gate?.struct, p = rt.player, u = p.u;
  if (followingRoad && Math.hypot(u.pos.x - (g.seg[0] + g.seg[2]) / 2,
      u.pos.z - (g.seg[1] + g.seg[3]) / 2) > 12) {
    inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
    inp.leftPressed = false; inp.chargeHold = false; inp.quickCmd = null;
    inp.guardHold = false; inp.runHeld = false;
    if (!u.alive || F.ending) return;
    if (p.lock) inp.e.add('KeyQ');
    if (rt.squad.length && !(rt.botCmdT > rt.t) && rt.squadGroups.some(group => group.order !== 'follow')) {
      inp.quickCmd = 'follow'; rt.botCmdT = rt.t + 2;
    }
    let attacker = null, distance = 4;
    for (const enemy of rt.army.threats || []) {
      const attacks = enemy.atk && enemy.atk.target === u && !enemy.atk.bow ||
        enemy.swing && !enemy.swing.done && enemy.swing.target === u || enemy.charging && enemy.target === u;
      if (!attacks || !enemy.alive || enemy.fleeing || enemy.noTarget || enemy.type === 'gun' || enemy.type === 'bow' ||
          Math.abs(enemy.pos.y - u.pos.y) >= 3) continue;
      const d = Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z);
      const over = (enemy.wpnKind || enemy.lookWeapon) === 'spear' && d <= enemy.reach + .3;
      if (d >= distance || rt.army.wallBetween(u.pos, -1, enemy.pos, over)) continue;
      attacker = enemy; distance = d;
    }
    if (attacker) {
      // 次の木戸への移動中は、追手の振りかぶりのたびに立ち止まらない。
      // 守兵と戦う郭内は下の処理に任せ、本道では構えて味方と先へ抜ける。
      inp.guardHold = true;
      helpers.goTo(p, inp, F.roadPoint.x, F.roadPoint.z, 3);
    } else {
      inp.runHeld = true;
      helpers.goTo(p, inp, F.roadPoint.x, F.roadPoint.z, 3);
    }
    return;
  }
  if (zone && !zone.test(rt.player.u.pos.x, rt.player.u.pos.z)) {
    const p = rt.player, next = F.echizenCourtPoint();
    if (p.lock) inp.e.add('KeyQ');
    inp.guardHold = !!rt.army.nearestEnemy(p.u, 4);
    inp.runHeld = !inp.guardHold;
    // 既に口へ向かう経路の途中の点。再探索すると、口ではなく道の芯が目的地になる。
    inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
    inp.leftPressed = false; inp.chargeHold = false; inp.quickCmd = null;
    if (rt.squad.length && !(rt.botCmdT > rt.t) && rt.squadGroups.some(g => g.order !== 'follow')) {
      inp.quickCmd = 'follow'; rt.botCmdT = rt.t + 2;
    }
    helpers.goTo(p, inp, next.x, next.z, .6, true);
    return;
  }
  if (!zone) return kinome.botBrain(rt, inp, helpers);
  // 共通の反撃は郭外の攻撃者も追う。郭内では案内と同じ守兵だけへ寄せる。
  // 見通せる平場の移動を本道へ投影し直すと、遠い守兵へ寄る途中で郭を出てしまう。
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  inp.leftPressed = false; inp.chargeHold = false; inp.quickCmd = null;
  inp.guardHold = false; inp.runHeld = false;
  if (!u.alive || F.ending) return;
  if (rt.squad.length && !(rt.botCmdT > rt.t) && rt.squadGroups.some(group => group.order !== 'follow')) {
    inp.quickCmd = 'follow'; rt.botCmdT = rt.t + 2;
  }
  const enemy = rt.army.nearestEnemy(u, 180, F.echizenCourtEnemy);
  if (p.lock && p.lock !== enemy) inp.e.add('KeyQ');
  if (enemy) {
    if (passBotEnemyRoute(rt, inp, helpers, enemy)) return;
    const distance = Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z);
    p.yaw = Math.atan2(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z);
    helpers.goTo(p, inp, enemy.pos.x, enemy.pos.z, (p.weapon === 'sword' ? 1.9 : 2.8) * .85, true);
    helpers.patientStrike(p, inp, enemy, distance);
  } else {
    const next = F.echizenCourtPoint();
    helpers.goTo(p, inp, next.x, next.z, 2, true);
  }
};

const echGoryuCtx = (rt) => ({ gate: () => rt.flags.gateKinome?.struct, kannonIn: { x: KX(-6), z: KZ(-105) }, kannonGate: { x: KX(0), z: KZ(-126) } });
echizen.onZoneFall = function (rt, id) {
  // 目の前で押さえた郭の次の任務は、使番の到着を待たない。
  // 古い「守れ、あと一秒」と運搬中の札を、その場の下知で取り替える。
  // 遠い別手の知らせや、他の戦の使番は従来のままにする。
  const obj = rt.obj;
  rt.obj = function (key, text, kind, local) {
    return obj.call(this, key, text, kind, key === 'main' || local);
  };
  try { kinome.onZoneFall.call(this, rt, id); } finally { rt.obj = obj; }
  // 道の印と山道全体の残り距離も、制圧後の最初の更新でそろえる。
  rt.flags.statusAt = 0;
  // 観音丸だけで追撃へ飛ばさず、本道と東西の尾根を既存の隊で攻める。
  // 尾根道で前田・佐々・不破の手が合流し、崩れた先手に代わって木ノ芽峠城の木戸を破る（echizen/goryu.js）
  if (id === 'kannon' && rt.flags.kannonFell) EC_GORYU.onKannonFell(rt, echGoryuCtx(rt));
  if (id === 'kinome_fuku') EC_SEIEI.start(rt, { look: IKKO_KOSODE });   // 主防御線：主郭から一揆の精鋭が逆襲（echizen/seiei.js）
  if (id === 'kannon' && rt.flags.kannonFell) {
    this.releaseEast(rt);
    this.releaseWest(rt);
  }
};

echizen.win = function (rt) {
  const F = rt.flags;
  if (F.ending || rt.over || !rt.player.u.alive) return;
  const ids = ['kannon', 'kinome_sou', 'kinome_fuku', 'kinome_hon',
    'saikoji_mae', 'saikoji_hon', 'hachibuse_mae', 'hachibuse_hon'];
  if (ids.some(id => F.SZ.byId[id].owner !== 'friend' || F.SZ.byId[id].enemies > 0)) {
    // 本道を先に落としても、別手の城が残っていれば勝ちにしない。
    if (F.SZ.byId.kinome_hon.owner === 'friend') {
      // 本郭の旗だけで判断すると、前郭の残敵を無視して別の城へ案内する。
      const pending = ids.filter(id => F.SZ.byId[id].owner !== 'friend' || F.SZ.byId[id].enemies > 0);
      const names = pending.map(id => F.SZ.byId[id].name || F.C.kuruwa[id].name);
      const text = `${[...new Set(names)].join('・')}の残る守兵を討ち、味方と押さえる`;
      F.fourCastleTask = text;
      if (rt.objectives.find(o => o.id === 'main')?.text !== text) {
        rt.obj('main', text, 'main', true);
      }
    }
    return;
  }
  // 四城の制圧だけで終わらず、名指した殿との決着へ進む。
  echizenAdvance(rt);
};
// 11/1 kaito の紙（木ノ芽峠）：砦をいくつも攻める→一揆勢が敗走→府中へ進む。
// 観音丸を押さえた頃、杉津口で堀江景忠が寝返り、下間頼照らが逃げた（信長公記・8月15日）。峠の砦の一揆勢は府中へ崩れる。
// 11/5 fix61：本人は観音丸の北口から峠道を追い、九十九折りの折れ目の手前で踏みとどまる殿を崩す。殿が崩れた時が勝ち（時が過ぎただけでは勝ちにしない）。
// 殿の前の峠道（追う時の行き先）
const TAIL_FRONT = { x: TAIL_AT.x + Math.sin(TAIL_FACING) * 9, z: TAIL_AT.z + Math.cos(TAIL_FACING) * 9 };
// 11/6 fixc2147_echizen：殿は北口のすぐ先で、郭の内から二十八歩内に入る。郭の内にいるうちに⑤へ移ると、
//   印と本人が北の柵越しに殿へ向き、柵に張り付いたまま一分余り出られなかった（遊んだ写真 210 秒）。郭の内にいる間は北口の外を指す
const inKannon = (p) => p.z < EXIT_KANNON[1] + 1 && p.x > -112 && p.x < 12;
const KANNON_OUT = { x: EXIT_KANNON[0], z: EXIT_KANNON[1] + 4 };
function echizenAdvance(rt) {
  const F = rt.flags;
  if (F.echAdv || F.ending || rt.over || !rt.player.u.alive) return;
  F.echAdv = true; F.echAdvT = rt.t;
  for (const id of ['road', 'kannon', 'kinome', 'saikoji', 'hachibuse']) rt.unmark(id);
  rt.objDone('main');
  rt.award((t) => { t.special = { label: '木ノ芽峠の四城を押さえた', pts: 24 }; }, '観音丸・木ノ芽峠城・西光寺丸・鉢伏城を押さえた');
  sfx('kane', 0.5);
  rt.banner('木ノ芽峠の四城を押さえた', '');
  // 奥の砦が燃える（字でなく火と煙で、一揆勢が峠の砦を捨てたと見せる）。木ノ芽峠城の奥の郭・西光寺丸・鉢伏の本当の場所（峠道の上には置かない）
  // 木戸からの固定距離では郭の外で燃えてしまう。各郭の内側に置き、
  // 通り道を空けたまま、退く時に捨てた砦の火と分かる位置へそろえる。
  for (const id of ['kinome_fuku', 'saikoji_hon', 'hachibuse_hon']) {
    // 別手が先に退いた城には、既に火と黒煙がある。重ねて増やさない。
    if (F.echSideGone && id !== 'kinome_fuku') continue;
    const p = F.SZ.byId[id].pos;
    rt.world.addFire(p.x - 6, p.z, { size: 3.2, blackSmoke: true });
  }
  // 11/6 fixc0917_echizen（二2）：峠の一揆勢が退いたのは府中の龍門寺が焼かれた夜（信長公記）。観音丸を落とす頃に日が暮れ、知らせも夜の出来事の順にする
  rt.world.setTime?.('night');
  for (const id of ['kinome_sou', 'kannon']) {
    const p = F.SZ.byId[id].pos;
    rt.world.addFire(p.x - 6, p.z, { size: 3, blackSmoke: true });
  }
  if (!F.echSideGone) rt.say('使番', '杉津口は破れ、堀江景忠が寝返った！　府中の龍門寺にも火が掛かった！', 4.5);
  rt.after(5, () => rt.say('組頭', '背を突かれた一揆勢が、砦に火を掛けて府中へ退くぞ。峠道の西光寺真敬の殿を討て！', 4));
  // 峠道の殿は踏みとどまり、ほかの一揆勢は皆、府中の方（北・本道の座標が増える向き）へ逃げる
  const tail = F.echTail;
  if (tail?.count) { tail.seekRange = 10; tail.aggro = 10; }
  for (const g of rt.army.groups) {
    if (g.team !== 1 || g.routed || g === tail) continue;
    g.routed = true; g.order = 'flee'; g.morale = 0; g.focus = null; g.noRout = false;
    g.fleeDir = { x: 0, z: 1 };
    for (const q of g.units) { q.fleeing = true; q.target = null; q.aiT = 0; }
  }
  for (const a of rt.world.armies || []) if (a.team === 1) a.noWake = true;
  F.echizenIkkiCrowd?.retreat?.(60, 24); F.echizenIkkiHost?.retreat?.(80, 26);
  // 柴田勝家と、後に府中を預かる前田利家・佐々成政・不破光治が本道を上がってくる（頭上に名）
  const up = (name, x, list) => {
    // 11/4：観音丸の木戸の外から郭を抜けて北口へ（前は縮める前の座標で、一揆の本陣の前に湧いていた）
    const g = allyGroup(rt, { faction: 'oda', name, fixed: true, fullStrength: true, noGuard: true, anchor: { x: GATE_KANNON.x + x, z: GATE_KANNON.z - 14 }, facing: 0, width: 4, aggro: 4, formation: 'column' }, list);
    g.order = 'path'; g.formation = 'column'; g.colW = 2; g.pathIdx = 0; g.dest = null;
    // 北口から峠道の折れ目を歩き、殿の手前で止まる。尾根を真っすぐ抜けない
    g.path = [[GATE_KANNON.x + x, GATE_KANNON.z + 8], [EXIT_KANNON[0] + x, EXIT_KANNON[1]], [TAIL_FRONT.x + x, TAIL_FRONT.z]];
    g.onArrive = (q) => { q.order = 'hold'; };
    return g;
  };
  F.echUp = [
    up('柴田勝家の手', 3, [{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, horse: true } }, { type: 'samurai', n: 6 }]),
    // 11/6 fix4_echizen（一2）：名のある将は徒で足軽三人に混ぜず、馬上で侍の旗本に囲む
    // 前田・佐々・不破は尾根道で先に合流している（echizen/goryu.js）。その手を峠道の殿へ回す
    ...(F.echGoryu ? F.echGoryu.groups.filter((g) => g.count).map((g, i) => {
      const x = [-3, -8, 8][i] || 0;
      g.order = 'path'; g.formation = 'column'; g.colW = 2; g.pathIdx = 0; g.dest = null; g.assault = null;
      g.path = [[EXIT_KANNON[0] + x, EXIT_KANNON[1]], [TAIL_FRONT.x + x, TAIL_FRONT.z]];
      g.onArrive = (q) => { q.order = 'hold'; };
      return g;
    }) : [
      up('前田利家の手', -3, [{ type: 'busho', n: 1, o: { name: '前田利家', invuln: true, horse: true, weapon: 'spear' } }, { type: 'samurai', n: 4 }]),
      up('佐々成政の手', -8, [{ type: 'busho', n: 1, o: { name: '佐々成政', invuln: true, horse: true } }, { type: 'samurai', n: 4 }]),
      up('不破光治の手', 8, [{ type: 'busho', n: 1, o: { name: '不破光治', invuln: true, horse: true } }, { type: 'samurai', n: 4 }]),
    ]),
  ];
  // 峠口の先手も北口から峠道を追う（本人一人で殿に当たらない）
  for (const b of F.attackers || []) {
    const g = b?.real;
    if (!g?.count || g.routed) continue;
    b._route = null; b.assault = null;
    g.order = 'path'; g.formation = 'column'; g.pathIdx = 0; g.dest = null; g.stay = false;
    g.path = [[EXIT_KANNON[0], EXIT_KANNON[1]], [TAIL_FRONT.x, TAIL_FRONT.z]];
    g.onArrive = (q) => { q.order = 'attack'; };
  }
  rt.obj('fuchu', '峠道の登り口へ進み、西光寺真敬の殿を討つ', 'main', true);
  // 目標の金の▼（goals5.js）も同じ所。北口→峠道の登り口→殿の前と道の点を順に指し、殿に当たったら殿の兵を指す
  // 四城攻略後は本道の奥にいる。観音丸へ戻さず、通れる本道で殿へ向かう。
  F.echWay = [TAIL_FRONT];
  F.echWayI = 0; F.echExitAt = F.echWay[0];
  EC_KURUWA.chaseCut(rt, { front: TAIL_FRONT });   // 殿の手前まで場面替え（echizen/kuruwa.js）
}
// 殿の兵で、まだ戦える者
const tailFighters = (F) => (F.echTail?.units || []).filter(passFighter);
// 殿に当たった後、殿のうち本人にいちばん近い者（印・bot が同じ相手を指す）
function echTailTarget(rt) {
  const F = rt.flags;
  if (F.echTailBroke && F.echFuchu?.s === 1) {
    // 峠道で最後に踏みとどまる一揆勢（echizen/fuchu.js）
    const me = rt.player.u.pos;
    let best = Infinity, chosen = null;
    for (const q of F.echFuchu.g.units) {
      if (!passFighter(q)) continue;
      const d = (q.pos.x - me.x) ** 2 + (q.pos.z - me.z) ** 2 +
        (rt.army.wallBetween(me, -1, q.pos, false) ? 1e6 : 0);
      if (d < best) { best = d; chosen = q; }
    }
    return chosen;
  }
  if (!F.echGateReached || F.echTailBroke) return null;
  if (rt.t < F.echTailAt && passFighter(F.echTailU)) return F.echTailU;
  F.echTailAt = rt.t + .25;
  const me = rt.player.u.pos;
  let best = Infinity, chosen = null;
  for (const q of tailFighters(F)) {
    const d = (q.pos.x - me.x) ** 2 + (q.pos.z - me.z) ** 2 + (rt.army.wallBetween(me, -1, q.pos, false) ? 1e6 : 0);
    if (d < best) { best = d; chosen = q; }
  }
  return (F.echTailU = chosen);
}
function echizenAdvanceTick(rt) {
  const F = rt.flags, u = rt.player.u;
  if (!F.echAdv || F.ending || rt.over || !u.alive) return;
  if (!F.echGateReached) {
    // 峠道の点に着いたら次の点へ（印を尾根の斜面へ向けない）
    const w = F.echWay?.[F.echWayI];
    if (w && F.echWayI < F.echWay.length - 1 && Math.hypot(u.pos.x - w.x, u.pos.z - w.z) < 12) F.echExitAt = F.echWay[++F.echWayI];
    // 本人と味方の追手が、殿の前へ着いたかを調べる。
    const near = (q, r) => Math.hypot(q.x - TAIL_AT.x, q.z - TAIL_AT.z) < r;
    // 味方の追手にも応戦する。本人の到着と下知の達成は別に判定する。
    const tail = F.echTail;
    if (tail?.count && !tail.routed && tail.order === 'hold' &&
        (near(u.pos, 28) && !rt.army.wallBetween(u.pos, -1, TAIL_AT, false) ||
         rt.army.units.some(q => q.team === u.team && EC_FUCHU.pursuer(q) && near(q.pos, 28) &&
           !rt.army.wallBetween(q.pos, -1, TAIL_AT, false)))) {
      tail.seekRange = 40; tail.aggro = 40; tail.stay = false; tail.order = 'attack';
    }
    if (near(u.pos, 28) && !inKannon(u.pos)) {
      F.echGateReached = true;
      rt.objDone('fuchu');
      rt.obj('tail', '峠道の登り口で、西光寺真敬の殿を討つ', 'main', true);
      if (F.echTail) { F.echTail.seekRange = 40; F.echTail.aggro = 40; F.echTail.stay = false; F.echTail.order = 'attack'; }   // 殿は坂の上から槍を揃えて突き下ろし、追手を止めにかかる
      // 峠口の先手と柴田らの手も殿へ懸かる（本人一人に戦わせない）
      for (const g of [...(F.attackers || []).map(b => b?.real), ...(F.echUp || [])]) {
        if (!g?.count || g.routed) continue;
        g.order = 'attack'; g.seekRange = 60; g.aggro = 60; g.stay = false;
      }
      sfx('sig_kakari', .8);
      rt.say('組頭', '石田の西光寺が殿に踏みとどまっておる。槍をそろえ、突き崩せ！', 3.5);
      F.echExitAt = inKannon(u.pos) ? KANNON_OUT : null;
    }
    return;
  }
  if (F.echFuchu) { EC_FUCHU.tick(rt); return; }   // 殿の後の追撃と余韻（echizen/fuchu.js）
  if (F.echExitAt && !inKannon(u.pos)) F.echExitAt = null;
  if (!F.echTailBroke) {
    // 六割を討てば殿は崩れて府中へ退く（残りが散って斜面へ離れ、討ち切るまで終わらない事があった）
    // 11/6 fix4_echizen：数えるのは槍の前の列（侍・足軽）だけ。坂の上の弓・鉄砲と馬上の将は後ろに残るので、数に入れると終わらなかった。
    //   西光寺真敬を討てば、その場で殿は崩れる
    const front = q => q.type === 'samurai' || q.type === 'ashigaru';
    const all = (F.echTail?.units || []).filter(front).length, left = tailFighters(F).filter(front).length;
    const lord = F.echTail?.units.find(q => q.type === 'busho');
    // 将の準備が欠けた時も、討ち取っていない相手を勝ちに数えない。
    if (!lord) return;
    // 11/6 fixc0917_echizen（kaito「西光寺真敬の姿も名も出ない・▼の敵が立ったまま勝ち」）：槍の列が六割討たれたら、西光寺真敬が馬で本人へ懸かり一騎打ち。
    //   名札は十八歩内で出る。真敬を討った時だけ殿が崩れて勝ち（列が崩れただけでは勝ちにしない）
    // 敗走や狙い除外は討死ではない。命の残る真敬を討ち取りに数えない。
    if (lord?.alive) {
      if (all && left <= all * 0.4 && !F.echLordCame) {
        F.echLordCame = true;
        // 殿の組ごと本人へ向けると、北口の柵を挟んで向き合ったまま動けなかった。真敬は峠道で踏みとどまり、印と本人が真敬を指す
        F.echTail.noRout = true; F.echTailU = lord; F.echTailAt = rt.t + 1e6;
        // 命の上限は準備時にそろえる。名乗りで残りの命を切り落とさない。
        rt.say('西光寺真敬', '石田の西光寺真敬なり！　仏の敵、ここは一歩も通さぬ！', 4);
      }
      return;
    }
    if (!(lord.hp <= 0)) return;
    F.echLordDown = true;   // 勝ちの札を「西光寺真敬、討ち取ったり」にする（echizenWin）
    F.echTailBroke = true;
  }
  const g = F.echTail;
  if (g && !g.routed) {
    g.routed = true; g.order = 'flee'; g.morale = 0; g.noRout = false; g.focus = null; g.fleeDir = { x: 0, z: 1 };
    for (const q of g.units) { q.fleeing = true; q.target = null; q.aiT = 0; }
  }
  rt.objDone('tail');
  // すぐ結果へ行かず、峠道を追って最後に踏みとどまる一揆勢を崩し、余韻の後で勝ち（echizen/fuchu.js）
  rt.banner(F.echLordDown ? '西光寺真敬、討ち取ったり' : '峠道の殿を破った', '一揆勢は府中へ崩れる');
  EC_FUCHU.start(rt, { at: { x: KX(0), z: KZ(-60) }, look: IKKO_KOSODE, win: echizenWin });
}
function echizenWin(rt) {
  const F = rt.flags;
  if (F.ending || rt.over || !rt.player.u.alive) return;
  F.ending = true;
  rt.setPhase('end'); rt.objProgress('main', '');
  for (const id of ['road', 'kannon', 'kinome', 'saikoji', 'hachibuse']) rt.unmark(id);
  rt.objDone('main');
  rt.tracker.main = true;
  rt.award((t) => { t.main = true; t.special = { label: '峠口を破った', pts: 20 }; }, '任務達成・木ノ芽峠の四城と峠道の殿を破り、府中へ道を開いた');
  sfx('kane', 0.5);
  rt.after(15, () => { if (!rt.over) rt.banner('木ノ芽峠を越えた', '一揆勢は府中へ敗走'); });
  rt.after(17.5, () => { if (!rt.over) rt.say('柴田勝家', '峠は開いた。夜が明けたら府中へ下るぞ', 4); });
  rt.after(22.5, () => {
    if (rt.tracker.main) rt.say('史実', '峠から府中へ逃げた一揆勢は、その夜に羽柴・明智の手に討たれた（二千余）。府中は後に前田利家・佐々成政・不破光治が預かる。越前では多くの命が失われた', 7);
  });
  for (const b of F.attackers || []) if (b?.real && !b.real.routed && b.order) { b._route = null; b.assault = null; b.order({ id: 'hold' }); }
  rt.player.u.invuln = true;
  rt.finish({ scriptedEnd: true }, EC_FUCHU.LEN);
}
// 武将の名簿（bushou_roster.js）から、この戦に出てまだ場にいない武将を足す（11/01 bushou_17_32）。海側の明智・羽柴は出さない。杉浦玄任を足すと bot が負けたので出さない。
// 11/4 jin_echizen：名簿から足すと徒で旗本も無く本人の脇に立っていた（AV7）。峠口の将は setup で馬上・旗本付きで置く（滝川・蜂屋は二陣、柴田は観音丸の後に上がる）。
echizen.bushou = [];
// 峠口の大将は丹羽長秀（後ろの本陣で座る）。信長は敦賀、下間頼照は杉津口にいて峠にはいない（docs/battle_refs/echizen.md）
echizen.taisho = { a: { name: '丹羽長秀' }, b: null };
// 命懸けの戦場（lethal.js・docs/lethal_howto.md。11/9 係A：観音丸の前で bot が倒れる事があるので soft）
echizen.lethal = echizen.lethal ?? { soft: true };
export { echizen };
