import { useTerrain } from './asset_manifest.js';
// ======================================================================
// 尾張統一戦　稲生の戦い（弘治二年八月二十四日・1556）
// 信長の七百が、弟の信勝（信行）方の千七百（柴田勝家 千・林美作守 七百）と、於多井川（庄内川）の東の稲生の野で戦う。
// 足軽は信長の旗本の足軽。組頭の源八の下で、信長の旗のそばに立つ。
// 前半は集合・行軍・林の小戦で基本操作を教え、士気を見てから柴田隊との主戦へ進む。
// 後半は側面・指揮官を教え、信長の前進から部隊の崩れ・追撃・勝家の退きへつなぐ。
// 向き：x が東（+x）、z が南（+z）。北に信勝・林、集落、柴田。南に信長、その脇に佐久間と遊び手。
// 地形は国土地理院の標高（asset_dem_inou.js）。今の堤は高すぎるので、高さを丸めて昔の平らな野に寄せる。
// ======================================================================
import { nobori, jinCamp, hut, tawara, kagaribi, umatsunagi, umajirushi, hatazao } from './props.js';
import { sfx } from './audio.js';
import { victoryMoment, brushWord } from './victory_moment.js';
import { gauss, enemyGroup, allyGroup, nm, centerOf, unitPos } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { demSample } from './dem.js';
import { S as SETTINGS } from './settings.js';
import { usesTouchControls } from './touch.js';

// 六百四十メートル四方。会戦は中央の百五十メートルほどへ詰める（配置は設計の復元）。
const RIVER = [[-148, -320], [-144, -120], [-152, 20], [-142, 160], [-150, 320]];
const NOBU = { x: 0, z: 52 };
const FLANK = { x: 24, z: 18 }; // 右の畦から柴田隊の横へ
const NAZUKA = { x: -44, z: 62 };       // 佐久間の持ち場。砦は戦場へ持ち込まない
const SHIBA0 = { x: 0, z: -16 };
const HAYA0 = { x: -24, z: -46 };
const HAYA1 = { x: -24, z: 20 };
const VILLAGE = [[-12, -66, 0.2], [16, -72, -0.3], [-22, -78, 0.5], [30, -62, 0.1]];
// 土の街道と、田を区切る畦は同じ座標を描画と歩みに使う。
const PATHS = [{ pts: [[0, 320], [0, 60], [0, 20], [0, -40], [0, -100], [12, -320]], w: 6 }];
for (const x of [-96, -72, -48, -24, 24, 48, 72, 96]) PATHS.push({ pts: [[x, -120], [x, 120]], w: 2.4 });
for (const z of [-120, -100, -80, -60, -40, -20, 0, 20, 40, 60, 80, 100, 120]) PATHS.push({ pts: [[-112, z], [112, z]], w: 2.4 });
function paddy(x, z) {
  if (Math.abs(x) > 112 || Math.abs(z) > 120 || Math.abs(x) < 3) return 0;
  if (Math.abs(x) < 38 && z > -86 && z < -52) return 0; // 集落の庭と畑
  if (Math.hypot(x - NAZUKA.x, z - NAZUKA.z) < 12) return 0;
  const ex = Math.abs(x - Math.round(x / 24) * 24), ez = Math.abs(z - Math.round(z / 20) * 20);
  return Math.max(0, Math.min(1, (Math.min(ex, ez) - 1.2) / 0.8)) * 0.7;
}
function moveWay(army, u, want) {
  // 槍を合わせる間と目的地の近くでは自由に動く。行軍だけ近い畦へ寄る。
  const x = u.pos.x, z = u.pos.z, dx = want.x - x, dz = want.z - z;
  if (u.mounted || u.target || u.atk || u.swing || Math.abs(x) > 110 || Math.abs(z) > 118 || dx * dx + dz * dz < 144) return want;
  const q = u._inouWay; // 支度で用意し、毎コマは作らない
  if (!q || Math.abs(x) < 3 && Math.abs(dx) < 6) return want;
  const d = Math.hypot(dx, dz);
  q.x = x + dx / d * 6; q.z = z + dz / d * 6;
  // 前へ進む力を残し、畦への寄せは二歩まで。曲がり角で往復・停止させない。
  if (Math.abs(dz) > Math.abs(dx)) q.x += Math.max(-2, Math.min(2, (Math.round(x / 24) * 24 - x) * 0.6));
  else q.z += Math.max(-2, Math.min(2, (Math.round(z / 20) * 20 - z) * 0.6));
  return q;
}
function prepareMarch(g) {
  g.spacing = 1.25;
  for (const u of g.units) u._inouWay = { x: u.pos.x, z: u.pos.z };
}

// 信勝方は弁柄（赤茶の漆）の具足、信長方は黒漆に紺の威。ネオンにせず、近くでも遠くでも色の系統で分かる（kaito 10/22 稲生 3）。
// 彩度の低い茶は人の甲冑の色替えで無視されるため、弁柄の赤みを残す。
// 笠にも同じ漆色を通す。旗を読めない近さでも、黒漆の味方と弁柄の敵を見分ける。
// 指物は敵が縦長、味方が横広。旗の本数や材質を増やさず形でも区別する。
const SHIBA = { armor: 0x88432f, hatColor: 0x88432f, lace: 0x96583d, cloth: 0x715044, flag: 'kari', flagShape: 1 };
const HAYA = { armor: 0x834031, hatColor: 0x834031, lace: 0x8b503b, cloth: 0x68483e, flag: 'sujikai', flagShape: 1 };
const ODA = { hatColor: 0x121110, lace: 0x334f70, cloth: 0x293b51, flag: 'oda', flagShape: 2 };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || g.count === 0 || g.routed;
// 退き切った隊は、その場に立たせず戦場から消す（kaito 10/24「動かない味方と敵は一切排除」）。
function vanish(rt, g) { for (const u of g.units) if (u.alive && !u.isPlayer) rt.army.despawn(u); }

let dem = null;
useTerrain('dem_inou', (data) => { dem = data; });
// 現代の堤と標高差を弱め、会戦帯は低い田畑の平地にする。
function height(x, z) {
  let h = 0.25 * Math.sin(x * 0.04) * Math.cos(z * 0.035) + 0.2 * Math.sin(z * 0.06 + x * 0.02);
  // 小川べりは低く、佐久間の持ち場はわずかな微高地
  let d = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) { const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1]; if (z >= az && z <= bz) d = Math.abs(x - (ax + (bx - ax) * (z - az) / (bz - az))); }
  if (d < 30) h -= 1.4 * (1 - d / 30);
  h += 0.25 * gauss(x, z, NAZUKA.x, NAZUKA.z, 160);
  if (dem) h += (Math.min(9.5, demSample(dem, x, z)) - 7) * 0.12;
  return h;
}

// 教えの順と成功判定は保ち、操作の札は出さない。
function lesson(rt, k) {
  const F = rt.flags;
  if (F.lesson) lessonEnd(rt, F.lesson);
  F.lessonDone ||= {};
  F.lesson = k; F.lessonAt = rt.t; F.lessonHidden = true;
  if (k === 'move') F.move0 = rt.player.movedAcc;
}
function lessonEnd(rt, k) {
  const F = rt.flags;
  if (F.lesson !== k) return;
  F.lesson = null; rt.tutEnd();
}
function park(g) {
  g.noAI = true; g.aggro = 0; g.fire = false; g.order = 'hold';
  // 敵も狙える。控えの隊も、近づいた者とは打ち合う（kaito 10/23 稲生 17）。
}

// 深手で倒れた兵は生存中でも、追う相手・倒す残り人数には含めない。
const fighting = (u) => !!u?.alive && u.hp > 0 && !u.gone && !u.dying && !u.downed && !u.woundOut && !u.rearWound && !u.fleeing;
const advanceEnemy = (u) => fighting(u) && !u.noTarget && !u.isStruct && !u.civ && u.mesh?.visible !== false;
function advanceOnArrival(g) {
  g.order = 'attack'; g.focus = null; g.fire = true; g.seekRange = 80;
  g.inouAdvance = true;
  // 到着後の待ちは置かず、その回の判断から近い敵へ向かわせる。
  for (const u of g.units) { u.aiT = 0; u.settled = false; }
}
function practiceLeft(rt) {
  let n = 0;
  for (const u of rt.flags.practice?.units || []) if (fighting(u)) n++;
  return n;
}
// 追う一人を保ち、札・ピン・到着判定で共有する。群れの中心を毎コマ作らない。
function approachUnit(rt) {
  const F = rt.flags;
  const group = F.step === 1 ? F.shiba1 : F.chase || F.training >= 0 && F.training < 5 ? F.practice : F.haya1;
  if (!group) return null;
  // 任務の隊へ実際に届く一人を、ピンと頭上の▼でも共通に使う。
  const reachable = rt.player.inRange && rt.player.rangeCueTarget;
  if (advanceEnemy(reachable) && group.units.includes(reachable)) {
    F.approachGroup = group; F.approachUnit = reachable;
    return reachable;
  }
  // 接近中は同じ兵を追い、攻撃が届く別の兵か、追えなくなった時だけ選び直す。
  const previous = F.approachGroup === group && advanceEnemy(F.approachUnit) ? F.approachUnit : null;
  // 生きている同じ一人を追う。歩くたびに林・杖・旗へ目印を渡さない。
  if (previous) return previous;
  let chosen = null, best = Infinity;
  for (const u of group.units) {
    if (!advanceEnemy(u)) continue;
    const d = Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z);
    if (d < best) { chosen = u; best = d; }
  }
  F.approachGroup = group; F.approachUnit = chosen;
  return chosen;
}
// 名札と赤い▼の一人へ、実際の攻撃判定に合わせて案内する。
function inouEnemyOrder(rt, fallback, name = rt.def.missionEnemyLabel(rt)) {
  const enemy = rt.def.missionSignTarget(rt), p = rt.player;
  if (!fighting(enemy)) return fallback;
  const touch = usesTouchControls();
  // 武将の名と白い縁の印をそろえ、同じ一人へ案内する。
  const target = `${name}（白い縁の赤い▼）`;
  if (p.inRange && p.rangeCueTarget === enemy) return touch
    ? `${target}へ「${p.weapon === 'sword' ? 'きる' : 'つく'}」を押して離せ`
    : `${target}を左クリックで${p.weapon === 'sword' ? '斬れ' : '突け'}`;
  const dx = enemy.pos.x - p.u.pos.x, dz = enemy.pos.z - p.u.pos.z;
  // 前進と同じ視点の向きで案内する。画面の右の兵へ前進し続けさせない。
  const yaw = p.yaw + (p.camYawOff || 0);
  const angle = Math.atan2(Math.sin(Math.atan2(dx, dz) - yaw), Math.cos(Math.atan2(dx, dz) - yaw));
  if (Math.abs(angle) > 2.4) return '白ふちの▼は後ろ・振り向け';
  if (Math.abs(angle) > .35) return angle < 0 ? '白ふちの▼へ右を向け' : '白ふちの▼へ左を向け';
  if (Math.hypot(dx, dz) <= p.meleeReach(p.previewMeleeKind() || 'thrust')) {
    if (Math.cos(Math.atan2(dx, dz) - p.u.heading) < .9) return '白ふちの▼へ向け';
    return '白ふちの▼へ もう一歩';
  }
  // 前の直しの歩数も同じ一人の間合いから求め、進む操作と一行で伝える。
  const move = touch ? '左の画面を前へなぞり続けろ' : '前進キーを押し続けろ';
  return `白ふちの▼へ${move}（あと${enemySteps(rt, enemy)}歩）`;
}
// 兵本人ではなく頭上の▼を案内する。距離は槍が届く所までの歩数。
function enemySteps(rt, enemy) {
  const p = rt.player;
  const distance = Math.hypot(enemy.pos.x - p.u.pos.x, enemy.pos.z - p.u.pos.z);
  return Math.max(0, Math.ceil((distance - p.meleeReach(p.previewMeleeKind() || 'thrust')) / .75));
}
function pinPoint(rt, pos, radius, hide, unit = null, name = '') {
  const pin = rt.flags.goalPin;
  pin.x = pos.x; pin.z = pos.z; pin.r = radius; pin.hide = hide;
  pin.unit = unit; pin.name = name; pin.enemy = !!unit && unit.team !== rt.player.u.team;
  pin.approach = false; pin.silent = true; pin.arrow = false; pin.always = false;
  return pin;
}

// 柴田勢と佐久間勢は、柴田が動く時に初めて置く。待つ間に立ち並ぶ兵を作らない（kaito 10/24「動かない味方と敵は一切排除」）。
function spawnShiba(rt) {
  const F = rt.flags, W = rt.world;
  const S0 = { x: SHIBA0.x, z: SHIBA0.z - 22 }; // 北の霧の中から寄せてくる
  // ---- 信勝方：集落の南に密集する柴田勢 ----
  // 前列の長槍、中央の徒歩武者、後列の弓。勝家も徒歩で中央の前寄り。
  F.shiba1 = enemyGroup(rt, { faction: 'nobukatsu', name: '柴田の長槍隊', anchor: { ...S0 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 12, noRout: true, formation: 'yari', dmgMult: 0.85, defMult: 1.2, morale: 95 },
    dress([{ type: 'ashigaru', n: 22, o: { spear: 'nagae' } }], SHIBA));   // 湧く数を抑える（iPhone 12 で耐える段に落ちた。テストプレイの声 10/24）。前列の密度は保つ
  F.shibaG = enemyGroup(rt, { faction: 'nobukatsu', name: '柴田勝家の徒歩武者', anchor: { x: 0, z: S0.z - 9 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 10, noRout: true, formation: 'line', dmgMult: 0.85, defMult: 1.2, morale: 98 },
    dress([{ type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true, keep: true } }, { type: 'samurai', n: 1, o: { name: '宮井勘兵衛' } }, { type: 'ashigaru', n: 18 }], SHIBA));
  F.shibaU = F.shibaG.units.find((u) => u.type === 'busho');
  F.shibaU.maxHp *= 1.4; F.shibaU.hp = F.shibaU.maxHp;
  // 勝家を殴り続けても、共通の深手による単独離脱を起こさない。
  F.shibaU.onWound = () => { F.shibaU.hp = Math.max(F.shibaU.hp, F.shibaU.maxHp * 0.35); };
  F.miyaiU = F.shibaG.units.find((u) => u.name === '宮井勘兵衛');
  F.miyaiU.noTarget = true;
  F.shibaU.pos.z = S0.z - 5;
  F.shibaU.pos.y = W.heightAt(F.shibaU.pos.x, F.shibaU.pos.z);
  F.shibaU.mesh.position.copy(F.shibaU.pos);
  F.shibaBow = enemyGroup(rt, { faction: 'nobukatsu', name: '柴田の後ろ弓', anchor: { x: 0, z: S0.z - 20 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 12, noRout: true, formation: 'line', dmgMult: 0.65, morale: 92 },
    dress([{ type: 'bow', n: 6 }], SHIBA));
  F.shiba = [F.shiba1, F.shibaG, F.shibaBow];
  for (const g of F.shiba) park(g);
  // 後列の六人は追いを止める控え。前半に全員を討たせず、既存の兵を使う。
  F.rearSpears = F.shiba1.units.slice(-6);
  for (const g of F.shiba) prepareMarch(g);
}
function spawnNazuka(rt) {
  const F = rt.flags;
  F.nazuka = allyGroup(rt, { name: '佐久間勢', anchor: { x: -72, z: 36 }, facing: 1.87, width: 12, aggro: 6, noRout: true, formation: 'yari' },
    dress([{ type: 'samurai', n: 1, o: { name: '佐久間大学', invuln: true } }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 4 }], ODA));
  KIT.markRecyclable(F.nazuka);
  prepareMarch(F.nazuka);
}

const inou = {
  scriptedLessons: true, // 共通の手ほどきを重ねず、この戦の順番で出す
  noCouriers: true,  // 戦に加わらない伝令の騎馬は置かない（kaito 10/24「動かない味方と敵は一切排除」）
  teach: true,           // 操作を教える戦（battle.js の teachOn）。ほかの戦は操作のやり方を出さない
  compactIntro: true,
  introTaskFirst: true,
  introPeopleFolded: true,
  // 導入は筋書きとして読める文に（意見帳 10/22・kaito の決め）。勝家は討てない・林美作守は討死、の史実に合わせる。
  introText: () => '信長の弟・信勝（のぶかつ）を家の主にしようと、柴田勝家（しばたかついえ）と林秀貞（はやしひでさだ）らが兵を集めた。林美作守（はやしみまさかのかみ）は秀貞の弟で、信勝方の武将。今は林勢が退き始め、信長方が追う場面。あなたは信長方の足軽（あしがる）＝歩いて戦う兵として、まず歩く・視点・槍を試してからはやしの兵を追う。',
  introPeople: [
    { id: '信長', name: '織田信長', note: '家督を継いだ兄。佐久間勢や前田利家らと戦う。' },
    { id: '信勝', name: '織田信勝と柴田勝家', note: '信勝は信長の弟。勝家は信勝を支え、この戦では敵となる。' },
    { id: '林', name: '林秀貞と林美作守', note: '織田家の家臣の兄弟。弟の美作守は通具とも伝わる。この戦で討死し、兄の秀貞は退く。' },
    { id: '史実', name: '史実と遊びの範囲', note: '『信長公記』などをもとに再現。兵数には諸説あり、配置・旗印・足軽の働きや操作の練習は遊びのための推定。' },
  ],
  rearAdviceText: () => usesTouchControls() ? '右の画面をなぞって振り向き、「かまえる」を押す' : `手元の操作器を横へ動かして振り向き、${SETTINGS.guardToggle ? '右押しで構える' : '右押しを押し続ける'}`,
  keepTaskLabel: true,
  keepGuardTaskLabel: true,
  keepDestinationTask: true,
  immediateTaskChanges: true,
  nearAllyWholeOcclusion: true,
  nearAllySolidBody: true,
  nearAllySightWidth: 1.1,
  nearAllyHorseFade: true,
  nearLongWeaponRadius: 10, // 後列から肩越しへ伸びる長槍・旗竿も、描く間だけ避ける。
  nearSpearBatchRadius: 10, // 避けた持ち主の槍を、遠景の束へ残さない。
  nearGroundSpearRadius: 10, // 討ち取り後に視線を横切る落ち槍も既存の視線判定で避ける。
  nearSpearFade: false, // 槍だけを縮めて透かさず、持ち主と同じ形を保つ。
  missionPinCaption: '',
  hideArmyPeek: true, // 初陣は行き先・敵の▼・任務一行に絞る。
  guideMarker: (rt) => rt.flags.ending ? null : rt.flags.training === 11 || rt.flags.training === 12 ? 'flank' : rt.flags.step === 0 ? rt.flags.chase ? 'chase' : null : 'holdFlag',
  // 任務は一行。頭上の▼と呼び方をそろえ、距離や向きで文を切り替えない。
  missions: ['赤い▼の林美作守の兵（信勝方）を倒せ', '赤い▼の林美作守の兵（信勝方）を倒せ', '耐えろ', '▼の林美作守を倒せ'],
  missionHeading(rt) {
    const F = rt.flags;
    if (F.step === 0) {
      const name = F.training === 8 ? '▼の林美作守の小隊長' : '赤い▼の林美作守の兵（信勝方）';
      const left = F.training <= 4 ? practiceLeft(rt) : 0;
      return left ? `${name}を倒せ（残り${left}人）` : `${name}を倒せ`;
    }
    if (F.step === 1) {
      if (F.training === 11 && !F.flankReached || F.training === 12 && !gone(F.shiba1)) return '柴田の兵を倒せ';
      return '耐えろ';
    }
    if (F.step === 2) {
      return '柴田の兵を倒せ';
    }
    return this.missions[this.missionOf(rt)];
  },
  enemyOrder: inouEnemyOrder,
  commanderTarget: (rt) => rt.flags.step === 0 && rt.flags.training === 8 ? rt.flags.hayaLead :
    rt.flags.step === 3 ? rt.flags.hayaU : null,
  // 控えや追跡中の兵も敵の姿として見分けられる。攻撃できるかで▼を消さない。
  foeMarkVisible: () => true,
  missionSignTarget: (rt) => rt.flags.step === 0 && rt.flags.training >= 0 && rt.flags.training <= 8 ?
    rt.flags.training === 8 ? rt.flags.hayaLead :
      approachUnit(rt) :
        rt.flags.step === 1 && rt.flags.training === 12 && !gone(rt.flags.shiba1) ? approachUnit(rt) :
          rt.flags.step === 3 ? rt.flags.hayaU : null,
  missionEnemyLabel: (rt) => rt.flags.step === 3 ? '林美作守' : rt.flags.step === 1 ? '柴田の兵' :
    rt.flags.training === 8 ? '林の隊長' : '林の兵',
  missionEnemySteps: enemySteps,
  meleeResult(rt, target, result) {
    const F = rt.flags;
    // 命中・討ち取りは実際に命が減った時の知らせを保つ。
    if (result === 'miss' && rt.t >= (F.missNoticeNext || 0)) {
      const enemy = rt.def.missionSignTarget(rt), p = rt.player;
      const near = fighting(enemy) && Math.hypot(enemy.pos.x - p.u.pos.x, enemy.pos.z - p.u.pos.z) <= p.meleeReach(p.previewMeleeKind() || 'thrust');
      F.combatResult = near ? '空振り。白縁の▼へ向け' : '空振り。白縁の▼へ近づけ';
      F.combatResultUntil = rt.t + 2;
      F.missNoticeNext = rt.t + 8;
    } else if (target && target.team !== rt.player.u.team && (result === 'block' || result === 'armor')) {
      // 防がれた本人の▼を潰し、任務の一行は保つ。
      if (fighting(target)) {
        target.inouBlockUntil = rt.t + .7;
        target.inouHitUntil = 0;
      }
      F.combatResult = result === 'block' ? '防がれた。敵の横へ回れ' : '鎧に当たった。もう一度突け';
      F.combatResultUntil = rt.t + 2;
    }
  },
  missionOf: (rt) => { const F = rt.flags; return F.step === 0 ? (F.training <= 4 ? 0 : 1) : F.step === 1 ? 2 : 3; },
  minutes: 9,
  // 初陣の見分けだけ二枚。追う兵と味方を、色のほかに字と形で示す。
  fieldSigns: (rt) => {
    const F = rt.flags;
    if (F.step !== 0 || F.ending || F.training === 0) return null;
    const signs = F.fieldSigns;
    if (F.signPhase === F.training && rt.t < F.signNext && signs[1].unit?.alive && !signs[1].unit.gone) return signs;
    F.signPhase = F.training; F.signNext = rt.t + 0.3;
    const ally = F.chase && F.chaseA ? F.chaseA : F.hata;
    const foe = F.training >= 5 ? F.haya1 : F.practice || F.haya1;
    for (let i = 0; i < 2; i++) {
      const group = i === 0 ? (F.chase ? null : ally) : foe;
      let best = (i ? 120 : 55) ** 2, chosen = null;
      if (!group) { signs[i].unit = null; continue; }
      for (const u of group.units) {
        if (!u.alive || u.gone || u.mesh?.visible === false || u === rt.player.u || u.name) continue;
        const d = (u.pos.x - rt.player.u.pos.x) ** 2 + (u.pos.z - rt.player.u.pos.z) ** 2;
        if (d < best) { best = d; chosen = u; }
      }
      signs[i].unit = chosen;
    }
    return signs;
  },
  // 討つ本人へ案内する。札・ピン・頭上の▼は同じ一人を使う。
  missionPin(rt) {
    const F = rt.flags;
    // 林兵への案内は頭上の札一本。地面へ別の矢印を重ねない。
    if (F.ending || F.step === 0) return null;
    const enemy = this.missionSignTarget(rt);
    // 描画を省いた兵にも案内を残す。見えない間は同じ相手への方向矢印になる。
    if (fighting(enemy)) {
      const p = rt.player, me = p.u.pos;
      const dx = me.x - enemy.pos.x, dz = me.z - enemy.pos.z, d = Math.hypot(dx, dz);
      const reach = p.meleeReach(p.previewMeleeKind() || 'thrust') * .8;
      if (d <= reach || p.inRange && p.rangeCueTarget === enemy) return null;
      const pin = pinPoint(rt, enemy.pos, .2, .2, enemy);
      pin.approach = true;
      return pin;
    }
    if (F.step === 3) return null;
    if (F.step === 1) {
      if (F.training === 11 && !F.flankReached) {
        return pinPoint(rt, FLANK, 8);
      }
      if (F.training === 12 && !gone(F.shiba1)) return null;
      let lead = F.nobuU?.alive ? F.nobuU.pos : NOBU;
      // 自分が遠く離れた時は、信長の方へ十歩の所を行き先にする（信長と旗本も寄って来る）。敵中を長く戻らせない。
      const me = rt.player.u.pos, far = Math.hypot(lead.x - me.x, lead.z - me.z);
      if (far > 22) { const k = 10 / far; F.holdNear = F.holdNear || { x: 0, z: 0 }; F.holdNear.x = me.x + (lead.x - me.x) * k; F.holdNear.z = me.z + (lead.z - me.z) * k; lead = F.holdNear; }
      const pin = pinPoint(rt, lead, 20, 20);
      pin.always = true;
      return pin;
    }
    if (F.step === 2) return pinPoint(rt, F.nobuU?.alive ? F.nobuU.pos : NOBU, 10);
    return null;
  },
  // 周りの味方が今なにをしているか（左上の進みの札の一行。kaito 10/22 稲生 2）
  allyDoing: (rt) => {
    const F = rt.flags;
    if (F.step === 0) return F.training <= 1 ? 'にげるはやしの兵を追って前へ走っている' : F.training <= 4 ? '先ではやしの兵と向き合っている' : 'はやしの兵と槍で戦っている';
    if (F.step === 1) return F.centerBack ? '中央も下がり、列を立て直している' : F.leftBack ? '左が崩れ、中央の脇が空いている' : F.training === 11 || F.training === 12 ? '正面を押さえ、右の畦から回っている' : '柴田隊の寄せを受け止めている';
    if (F.step === 2) return '信長について前へ出ている';
    if (F.step === 3) return '林美作守の備を攻めている';
    if (F.step === 4) return '崩れた林の備を追っている';
    return '深追いせず、柴田隊の退きを見ている';
  },
  noWinCrane: true,
  // 倒す相手の頭上に赤い▼（字なし。味方には出さない。kaito 10/23「ビジュアルで」）。
  foeMarks: true,
  enemyTriangleSigns: true,
  // 追いつくまでは攻撃対象外だが、追っている林兵三人の印は消さない。
  enemyTriangleGroup: (rt) => rt.flags.chase ? rt.flags.practice : null,
  foeMarkRange: 30,
  learningFight: true,   // 新しく始めた人の初陣。傷を軽くする
  playerTaken: 0.6,      // 最初の戦は受ける傷を六割に（テストプレイの声 10/24）
  playerRegen: 0.02,     // 戦っていない時は一秒に命の二分ずつ戻る
  noTaisho: true,        // 殿（信長）と大将の流れは、この定義が持つ
  noReserve: true,
  pacingWait: () => true, // 教えと勝家の退きを、共通の八分打ち切りで飛ばさない。
  lordHata: { spear: 30 },
  foeHit: 0.85,
  spawn: { x: NOBU.x + 4, z: NOBU.z + 5, heading: Math.PI },
  lordSpawn: { x: NOBU.x, z: NOBU.z, heading: Math.PI },
  lordAt: { x: NOBU.x, z: NOBU.z, r: 20, why: '信長の旗本（稲生原の南）' },
  world: {
    seed: 1556,
    groundHalf: 320,
    moveLim: 312,
    mountainScale: 0.13,
    mountainBase: -2,
    noGroundRipples: true,
    softEarthCrust: true,
    sparseEarthCrust: true,
    noFootShadows: true,
    solidSpearView: true,
    closeCombatAssist: true, // 穂先の幅だけの判定を避け、見た目どおり正面の兵を突ける。
    time: 'day',
    muddy: 0.2,
    paths: PATHS,
    moveWay,
    height,
    tint(x, z, h, c) {
      let d = Infinity;
      for (let i = 0; i < RIVER.length - 1; i++) { const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1]; if (z >= az && z <= bz) d = Math.abs(x - (ax + (bx - ax) * (z - az) / (bz - az))); }
      if (d < 14) { const k = 1 - d / 14; c.setRGB(c.r * (1 - 0.45 * k) + 0.26 * k, c.g * (1 - 0.45 * k) + 0.25 * k, c.b * (1 - 0.45 * k) + 0.2 * k); }
    },
    clear: (x, z) => Math.abs(x) < 116 && Math.abs(z) < 126,
    fieldStage: 'ripe',   // 秋の田。水浸しにせず、田の中だけ既存の足場補正で少し遅くする。
    paddy,
    streams: [{ pts: RIVER, w: 3, depth: 0.45 },
      { pts: [[72, -130], [72, -40], [72, 20], [96, 20], [96, 140]], w: 0.7, depth: 0.2 }],
    trees: 220,
    tufts: 2800,
    treeDensity: (x, z) => (Math.abs(x) > 118 || Math.abs(z) > 132 ? 1 : 0),
    groves: [{ x: -52, z: -76, r: 9, n: 10 }, { x: 52, z: -88, r: 12, n: 14 }, { x: -80, z: 88, r: 10, n: 10 }],
    fleeOut: (x, z, team) => team === 1 && z < -138,

  },

  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    const lord = !!rt.G.lord;
    const thinkNow = rt.army.thinkNow;
    rt.army.thinkNow = function (u) {
      thinkNow.call(this, u);
      const g = u.group;
      // 先に着いた兵を、隊の六割がそろうまで待たせない。
      if (!F.ending && !g.routed && g.onArrive === advanceOnArrival && g.dest &&
          Math.hypot(g.dest.x - g.anchor.x, g.dest.z - g.anchor.z) < 0.3 &&
          advanceEnemy(u) && u.moveTo && Math.hypot(u.moveTo.x - u.pos.x, u.moveTo.z - u.pos.z) < 1.6) {
        g.onArrive = null;
        advanceOnArrival(g);
      }
      if (F.ending || !g.inouAdvance || g.order !== 'attack' || !advanceEnemy(u) ||
          u.isPlayer || u.target || u.atk || u.swing || u.bind || u.escort || u.dragging ||
          u.stdPickup || u.climb || u.perch || u.pinT > this.time || u.stagger > 0 || g.routed) return;
      const enemy = this.nearestEnemy(u, 640, advanceEnemy);
      if (enemy) { u.target = enemy; u.watch = null; u.moveTo = null; u.settled = false; }
    };
    F.step = 0; F.ek = 0; F.ak = 0;
    F.goalPin = { x: 0, z: 0, r: 7, hide: 7 };
    F.fieldSigns = [{ label: '', unit: null }, { label: '', unit: null }]; // 味方は印なし・追う相手は字なしの赤い▼（kaito 10/23）
    // ---- 信長方：直属の槍隊・少ない家臣団・若い前田利家・佐久間勢 ----
    F.hata = allyGroup(rt, { name: '信長の旗本', anchor: { ...NOBU }, facing: Math.PI, width: 14, aggro: 6, noRout: true, formation: 'yari', fullStrength: true },
      dress([{ type: 'samurai', n: 1, o: { name: '組頭 源八', invuln: true } }, { type: 'ashigaru', n: 11 }], ODA));
    // 本陣には信長と旗本（馬廻の騎馬・槍・旗持ち）を置く（kaito 10/23 稲生 19）。ほとんどは足軽。
    const HATAMOTO = [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 10 }];   // 10/24 kaito「足軽ばかりに」。本陣で並ぶだけの兵は置かず、信長と共に前へ出る
    F.nobuGroup = allyGroup(rt, { name: '信長の本旗', anchor: { x: NOBU.x - 6, z: NOBU.z - 8 }, facing: Math.PI, width: 10, aggro: 0, noRout: true, fullStrength: true, formation: 'yari' },
      dress(lord ? HATAMOTO : [{ type: 'busho', n: 1, o: { name: '織田信長', invuln: true } }, ...HATAMOTO], ODA));
    F.nobuU = lord ? rt.player.u : F.nobuGroup.units[0];
    F.genU = F.hata.units.find((u) => u.name === '組頭 源八');
    F.mori = allyGroup(rt, { name: '森可成の手', anchor: { x: NOBU.x - 22, z: NOBU.z - 8 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '森可成', invuln: true, hat: 'kabuto_s' } }, { type: 'ashigaru', n: 12 }], ODA));
    F.sassa = allyGroup(rt, { name: '佐々孫介の手', anchor: { x: NOBU.x + 22, z: NOBU.z - 8 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 1, o: { name: '佐々孫介', invuln: true } }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 2 }], ODA));
    F.sassaU = F.sassa.units.find((u) => u.name === '佐々孫介');
    F.inu = allyGroup(rt, { name: '前田利家', anchor: { x: NOBU.x + 10, z: NOBU.z + 8 }, facing: Math.PI, width: 6, aggro: 10, noRout: true },
      dress([{ type: 'samurai', n: 1, o: { name: '前田利家', invuln: true, keep: true } }, { type: 'ashigaru', n: 2 }], ODA));
    F.friends = [F.hata, F.mori, F.sassa, F.inu];
    for (const g of F.friends) { g.defMult = 1.15; }
    // 主人公は槍を持つ足軽。配下や借り物の鉄砲・弓は付けない。
    const P = rt.player;
    F.yaw0 = P.yaw; F.look = 0;
    // 空振りも数える（攻撃の札は敵がいなくても試せる）。この戦の自分にだけ包む。
    F.strikeN = 0;
    const strike0 = P.strike.bind(P);
    P.strike = (...a) => {
      const swing = P.u.swing, assist = P.assistImpact, result = strike0(...a);
      if (!a[2] && !a[3] && (P.u.swing !== swing || P.assistImpact && P.assistImpact !== assist)) F.strikeN++;
      return result;
    };
    // 命中・受け止め・討ち取りを本人の▼だけで返す。空振りと味方には反応しない。
    const damage = rt.army.damage;
    rt.army.damage = function (t, amount, src, ...rest) {
      const hp = t?.hp;
      const result = damage.call(this, t, amount, src, ...rest);
      if (t && src?.isPlayer && t.team !== src.team) {
        if (rest[0]?.out?.res === 'block' && t.alive) {
          t.inouBlockUntil = rt.t + .7;
          t.inouHitUntil = 0;
        } else if (t.hp < hp) {
          t.inouHitUntil = rt.t + 2.4;
          t.inouBlockUntil = 0;
        }
        // 最後の命中からの経過に依存させず、倒れた時から印を閉じる。
        if (t.hp < hp && (!t.alive || t.dying || t.hp <= 0 || t.downed || t.woundOut || t.rearWound)) {
          t.inouDefeatUntil = rt.t + .45;
          F.combatResult = '一人倒した。次の白縁の▼へ'; F.combatResultUntil = rt.t + 2;
        }
      }
      return result;
    };
    F.training = -1;
    for (const g of [...F.friends, F.nobuGroup]) park(g);

    // 林美作守の先手だけが小戦を担う。北の旗本は後半まで控える。
    F.haya1 = enemyGroup(rt, { faction: 'nobukatsu', name: '林美作守の先手', anchor: { x: 0, z: 20 }, facing: 0, fleeDir: { x: -1, z: -1 }, width: 6, noRout: true, formation: 'yari', dmgMult: 0.4, defMult: 0.8, morale: 65 },
      dress([{ type: 'samurai', n: 1, o: { name: '林の小隊長' } }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 2 }], HAYA));
    park(F.haya1);
    F.hayaLead = F.haya1.leader;
    // 小隊長も最初から狙える（斬れば斬り返す）。

    // ---- 陣と旗 ----
    // 信長方の本陣：幕だけで空にしない。奥に床几と軍配、地図の机と使いの者（jinCamp と camp_life）、篝火、馬つなぎ、馬印と旗竿（kaito 10/22 稲生 8）。
    rt.scene.add(jinCamp(W, NOBU.x - 16, NOBU.z, { w: 12, d: 9, gap: 4, mon: 'oda', people: false }));
    for (const [x, z] of [[NOBU.x - 21, NOBU.z + 6], [NOBU.x - 11, NOBU.z + 6]]) rt.scene.add(kagaribi(W, x, z));
    rt.scene.add(umatsunagi(W, NOBU.x - 16, NOBU.z + 11, 0, 7));
    rt.scene.add(umajirushi(W, NOBU.x - 9, NOBU.z - 3, 0));
    rt.scene.add(hatazao(W, NOBU.x - 23, NOBU.z - 2, Math.PI / 2, 5, 'oda'));
    for (const [x, z, k] of [[NOBU.x - 4, NOBU.z - 6, 'oda'], [NOBU.x - 4, NOBU.z + 6, 'oda'], [NOBU.x + 10, NOBU.z - 24, 'tsuru'], [NAZUKA.x, NAZUKA.z - 4, 'oda']]) rt.scene.add(nobori(W, x, z, k, 5));
    // 小集落は北の本隊と柴田勢の間。大きな砦や城は置かない。
    for (const [x, z, r] of VILLAGE) rt.scene.add(hut(W, x, z, 7, 5, r, { roof: 0x6a5c44 }));
    for (const [x, z] of [[-18, -60], [22, -80]]) rt.scene.add(tawara(W, x, z, 0, 3));
    // 柴田の旗
    for (const [x, z] of [[SHIBA0.x + 6, SHIBA0.z - 10], [SHIBA0.x + 6, SHIBA0.z + 10], [SHIBA0.x + 24, SHIBA0.z - 4]]) rt.scene.add(nobori(W, x, z, 'kari', 5.5));

    // 立って待つだけの軽い合戦・遠くの止まった列は置かない（kaito 10/24「動かない味方と敵は一切排除」）。会戦は柴田が動く時に組み合った形で出す。
    rt.scene.add(nobori(W, 18, -56, 'kari', 5));
    for (const g of [...F.friends, F.nobuGroup, F.haya1, ...rt.squadGroups]) prepareMarch(g);

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '赤い▼の兵を倒せ', 'main');
    rt.obj('stay', '信長の旗のそばで戦う', 'side');
    rt.marker('holdFlag', () => F.nobuU?.alive ? F.nobuU.pos : NOBU, '信長の旗',
      { guideArea: 'guard', guideFlag: true, guideDefend: true, guideRadius: 20 });
    rt.marker('genpachi', unitPos(F.genU), '組頭 源八', { minor: true, guideRadius: 9 });
    // 始まってすぐ、自分以外の味方は退く林の手を追ってまっすぐ前へ走る（Yuto の流れ・kaito 10/22）。自分のまわりから味方がいなくなる。
    rt.say('組頭 源八', '前へ二メートル歩いてみよ。できたら次の操作だ。', 5);
    for (const g of [...F.friends, F.nobuGroup]) {
      g.order = 'move'; g.speed = 3.2; g.aggro = 0;
      g.dest = { x: g === F.nobuGroup ? -10 : g.anchor.x, z: g === F.hata ? 6 : g === F.nobuGroup ? 14 : 10 };
      g.onArrive = advanceOnArrival;
    }
    F.rear = [[-8, -4], [-24, -2], [24, -2]].map(([x, z]) => {
      const g = enemyGroup(rt, { faction: 'nobukatsu', name: '林の殿', anchor: { x, z: z - 14 }, facing: 0, fleeDir: { x: 0, z: -1 }, width: 5, aggro: 10, seekRange: 22, noAI: true, noRout: true, order: 'move', formation: 'yari', dmgMult: 0.2, defMult: 3, morale: 90 },
        dress([{ type: 'ashigaru', n: 5 }], HAYA));
      for (const u of g.units) { u.maxHp *= 5; u.hp = u.maxHp; }
      prepareMarch(g); g.speed = 2.6; g.dest = { x, z };
      g.onArrive = (q) => { q.order = 'attack'; };
      return g;
    });
    F.haya1.order = 'move'; F.haya1.speed = 2.2; F.haya1.dest = { x: 0, z: -4 };
    F.haya1.onArrive = advanceOnArrival;
    rt.after(6, () => rt.say('足軽', '柴田様まで向こうについたらしいぞ', 4));
    this.trainingPhase(rt, 0);
  },

  // 優先設計の段零〜八。説明を隠しても実戦の人数と順番は変えない。
  trainingPhase(rt, phase) {
    const F = rt.flags;
    if (F.training >= phase || F.step !== 0) return;
    if (F.lesson) lessonEnd(rt, F.lesson);
    F.training = phase; F.trainT = rt.t;
    F.blocks0 = rt.stats.blocks + rt.stats.parries;
    if (phase === 0) {
      // 初めから追う林兵を見せる。練習が終わっても同じ三人を使い、印の先を替えない。
      const p = rt.player.u.pos;
      const at = { x: p.x + 2, z: p.z - 14 };
      const g = enemyGroup(rt, { faction: 'nobukatsu', name: '林の遅れ兵', anchor: { ...at }, facing: Math.PI, width: 3, aggro: 0, noAI: true, noRout: true, order: 'hold', dmgMult: 0.25, focus: rt.player.u },
        dress([{ type: 'ashigaru', n: 3 }], HAYA));
      g.speed = 0.8;
      // 赤い▼の兵には初めから攻撃が当たる。教えの待ち時間を無敵の敵にしない。
      for (const u of g.units) { u.hp = u.maxHp = Math.max(30, rt.player.u.dmg * 2.2); u.cdBase *= 1.8; }
      const a = allyGroup(rt, { name: '追う味方', anchor: { x: at.x + 4, z: at.z + 2 }, facing: Math.PI, width: 2, aggro: 0, noAI: true, noRout: true, order: 'hold' },
        dress([{ type: 'ashigaru', n: 2 }], ODA));
      a.speed = 0.8;
      prepareMarch(g); prepareMarch(a);
      F.practice = g; F.chaseA = a; F.chase = true;
      rt.say('組頭 源八', '赤い▼は敵だ。白ふちの一人を追え！', 4);
      rt.marker('chase', () => approachUnit(rt)?.pos || g.anchor, '林の遅れ兵', { red: true, guideRadius: 7 });
      rt.after(3, () => { if (F.training === 0) { F.trainT = rt.t; lesson(rt, 'move'); } });
      return;
    }
    if (phase === 1) {
      // 操作を試す間に討った兵を、追う相手として待ち続けない。
      if (!practiceLeft(rt)) {
        F.chase = false; rt.unmark('chase');
        vanish(rt, F.chaseA);
        this.trainingPhase(rt, 3); return;
      }
      rt.setPhase('march');
      rt.obj('main', '赤い▼の兵を倒せ', 'main');
      for (const g of [F.practice, F.chaseA]) {
        g.order = 'move'; g.dest = { x: g.anchor.x, z: g.anchor.z - 8 };
      }
      lesson(rt, 'chase'); return;
    }
    if (phase >= 2 && phase <= 4) {
      rt.setPhase('practice');
      const count = phase === 3 ? 2 : 1;
      const pp = rt.player.u.pos;
      const g = enemyGroup(rt, { faction: 'nobukatsu', name: '林の先駆け', anchor: { x: pp.x + 3, z: pp.z - 7 }, facing: 0, width: 3, aggro: 12, seekRange: 30, noAI: true, noRout: true, order: 'attack', dmgMult: phase === 4 ? 0.4 : 0.25, focus: rt.player.u },
        dress([{ type: 'ashigaru', n: count }], HAYA));
      F.practice = g;
      prepareMarch(g);
      for (const u of g.units) { u.hp = u.maxHp = Math.max(30, rt.player.u.dmg * 2.2); u.cdBase *= 1.8; }
      rt.obj('main', '赤い▼の兵を倒せ', 'main');
      // 構える・避けるは教えない（自分で判断できる。kaito 10/23 稲生 4）。
      if (phase === 2) lesson(rt, 'thrust'); return;
    }
    if (phase === 5) {
      rt.setPhase('hayashiSkirmish');
      rt.obj('main', '赤い▼の林美作守の兵を倒せ', 'main');
      rt.say('組頭 源八', '赤い▼が敵だ。味方と戦い、白い縁の印の兵をねらえ！', 4);
      F.hata.aggro = 8; F.hata.order = 'attack'; F.hata.seekRange = 24;
      F.haya1.aggro = 6; F.haya1.fire = true;
      for (const u of F.haya1.units) u.noTarget = u === F.hayaLead;
      F.haya1.order = 'move'; F.haya1.dest = { x: 0, z: 14 }; F.haya1.speed = 2.2;
      F.hata.order = 'hold';
      rt.after(4, () => rt.say('足軽', 'はやしの兵がこっちを向いた！　隊長の所で戦っておる', 4));
      F.haya1.onArrive = advanceOnArrival;
      lesson(rt, 'together'); return;
    }
    if (phase === 6) { lesson(rt, 'identify'); return; }
    if (phase === 7) {
      // 一人目には出さず、小戦で敵が増えてから狙い定めを教える。
      lesson(rt, 'lock'); return;
    }
    if (phase === 8) {
      F.hayaLead.noTarget = false;
      rt.obj('main', '赤い▼の隊長を倒せ', 'main');
      rt.say('組頭 源八', '赤い▼の隊長をたおせ！', 4);
      lesson(rt, 'morale');
    }
  },

  // 段九以降：林の小隊が崩れてから、柴田隊がまとまって寄せる
  shibaCome(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    if (F.lesson) lessonEnd(rt, F.lesson);
    F.step = 1; F.stepT = rt.t; F.training = 9;
    spawnShiba(rt); spawnNazuka(rt);
    rt.unmark('genpachi');
    rt.setPhase('shibata');
    // 合成の法螺貝は間抜けに聞こえる（テストプレイの声 10/24）。陣太鼓の短い二つ打ちだけ。
    sfx('taiko', 1); rt.after(0.45, () => sfx('taiko', 0.85));
    rt.banner('柴田勝家隊が動く', '長槍の列、徒歩の武者、後ろの弓。味方と並んで受け止めよう');
    rt.obj('main', '信長の旗で、来た敵を止めよう', 'main');
    rt.say('足軽', '柴田様だ……本当にあの方と戦うのか', 4);
    rt.after(5, () => rt.say('組頭 源八', '突出するな！味方と並べ！', 4));
    rt.after(6, () => lesson(rt, 'stay'));
    for (const g of [...F.friends, F.nobuGroup]) { g.fire = true; g.aggro = 8; g.order = 'attack'; g.seekRange = 28; }
    // 佐久間勢は西の名塚から横へ駆け込み、着いたらそのまま斬り合う。
    F.nazuka.aggro = 10; F.nazuka.fire = true; F.nazuka.order = 'move'; F.nazuka.speed = 3; F.nazuka.dest = { x: -22, z: 16 };
    F.nazuka.onArrive = (g) => { g.order = 'attack'; g.seekRange = 45; };
    for (const g of F.shiba) { for (const u of g.units) u.noTarget = false; g.noAI = true; g.fire = true; g.aggro = 12; g.order = 'attack'; g.seekRange = 65; g.speed = 2; }
    // 後ろの六人も立たせず斬り合う。前半に討たれ切らないよう命だけ厚くする。
    for (const u of F.rearSpears) { u.maxHp *= 2; u.hp = u.maxHp; }
    F.miyaiU.noTarget = true;
    // 殿は柴田と入れ替わりに北へ退き、戦場から消える。
    for (const g of F.rear) if (!gone(g)) { g.order = 'retreat'; g.aggro = 0; g.dest = { x: g.anchor.x, z: -110 }; g.onArrive = (q) => vanish(rt, q); }
    // 長槍も立ち止まらず、味方の列まで寄せてから斬り合う。
    F.shiba1.order = 'move'; F.shiba1.dest = { x: 0, z: 2 }; F.shiba1.onArrive = (g) => { g.order = 'attack'; g.seekRange = 80; };
    F.shibaG.order = 'move'; F.shibaG.dest = { x: 0, z: 30 };
    F.shibaBow.order = 'move'; F.shibaBow.dest = { x: 0, z: 14 };
    F.shibaBow.onArrive = advanceOnArrival;
    F.shibaG.onArrive = advanceOnArrival;
    rt.marker('shiba', centerOf(F.shiba1), () => '柴田の長槍隊', { red: true, group: F.shiba1 });
    // 軽い隊だけを中央の会戦へ寄せる。近くで戦う兵は増やさず、前列を横一線に当てる。はじめから組み合う。
    F.front = clash(rt, { x: 26, z: 18, facing: Math.PI, w: 22, gap0: 0, seed: 1556, noRout: true, killRate: 0.25, noReserve: true, noWake: true, host: false,
      A: { flag: 'oda', armor: KIT.ARMOR.oda, count: 36, kind: 'spear', team: 0, faction: 'oda', flagRate: 0.15 },
      B: { flag: 'kari', armor: SHIBA.armor, count: 54, kind: 'spear', team: 1, faction: 'nobukatsu', flagRate: 0.15 } });
    F.front.go();
  },

  // 段十三。林の備と、その横を支える中央の備は別々に退く。
  hayaCome(rt) {
    const F = rt.flags;
    if (F.hayaG) return;
    F.training = 13;
    lesson(rt, 'commander');
    rt.say('組頭 源八', '旗と護衛の集まる所を見よ。侍大将が兵を支えておる', 4);
    // 従来の旗本十六人を二つの備へ分ける。兵の総数は増やさない。
    F.hayaG = enemyGroup(rt, { faction: 'nobukatsu', name: '林美作守の旗本', anchor: { x: -24, z: -8 }, facing: 0, fleeDir: { x: -0.3, z: -1 }, aggro: 6, width: 7, noAI: true, noRout: true, morale: 75, formation: 'yari', dmgMult: 0.55, defMult: 1.2 },
      dress([{ type: 'busho', n: 1, o: { name: '林美作守', invuln: true, horse: true, hat: 'kabuto_m' } }, { type: 'ashigaru', n: 8 }], HAYA));
    F.hayaU = F.hayaG.leader;
    F.hayaU.dmg *= 0.5; F.hayaU.noTarget = true;
    F.hayaCenter = enemyGroup(rt, { faction: 'nobukatsu', name: '林の中央の備', anchor: { x: -10, z: -12 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 6, width: 7, noAI: true, noRout: true, morale: 75, formation: 'yari', dmgMult: 0.55 },
      dress([{ type: 'ashigaru', n: 8 }], HAYA));
    F.haya = [F.hayaG, F.hayaCenter];
    for (const g of F.haya) {
      prepareMarch(g);
      g.order = 'move'; g.dest = { x: g.anchor.x, z: 24 }; g.speed = 1.6;
      g.onArrive = advanceOnArrival;
    }
    F.kuroda = allyGroup(rt, { name: '黒田半平', anchor: { x: -18, z: 46 }, facing: Math.PI, width: 6, aggro: 8, noAI: true, noRout: true, order: 'move' },
      dress([{ type: 'samurai', n: 1, o: { name: '黒田半平', invuln: true, keep: true } }, { type: 'ashigaru', n: 3 }], ODA));
    prepareMarch(F.kuroda);
    // 黒田は着いて待たず、林の備へそのまま当たる。
    F.kuroda.dest = { x: -20, z: 30 }; F.kuroda.speed = 3;
    F.kuroda.onArrive = (g) => { g.order = 'attack'; g.seekRange = 30; };
    rt.marker('hayaU', unitPos(F.hayaU), '林美作守', { red: true, h: 3.4 });
  },

  // 段十四。味方左翼、中央の順に下がった後、若い信長が中央の前へ出る。
  daionjo(rt) {
    const F = rt.flags;
    if (F.step !== 1 || !F.centerBack) return;
    F.step = 2; F.stepT = rt.t; F.training = 14;
    if (F.lesson) lessonEnd(rt, F.lesson);
    rt.unmark('flank');
    rt.setPhase('daionjo');
    if (!rt.G.lord) {
      F.nobuGroup.order = 'move'; F.nobuGroup.aggro = 2; F.nobuGroup.speed = 3;
      F.nobuGroup.dest = { x: -12, z: 30 };
      F.nobuGroup.onArrive = advanceOnArrival;
    }
    sfx('taiko', 1); rt.after(0.4, () => sfx('taiko', 0.9));
    rt.banner('信長、自ら中央の前へ', '若い主の大声に、味方が踏みとどまる');
    if (F.nobuU?.alive) { rt.army.play('eshout', F.nobuU.pos, 2); F.nobuU.cheer = 2; }
    rt.say('織田信長', '押せ！ここで退けば終わりぞ！', 4);
    rt.after(5, () => rt.say('織田信長', '退くな！ここを破れば終わりぞ！', 4));
    for (const g of F.friends) {
      g.morale = Math.min(100, g.morale + 25);
      if (g === F.inu && !F.miyaiFell) continue;
      g.order = 'move'; g.dest = { x: g === F.inu ? 12 : g.anchor.x, z: 36 };
      g.onArrive = advanceOnArrival;
    }
    F.front.push('A', 0);
    rt.obj('main', '信長と列を立て直し、林の備を崩そう', 'main');
    rt.award((t) => { t.side.push('味方と柴田の寄せを受け止めた'); }, '柴田の寄せを受け止めた');
    rt.after(10, () => { F.training = 15; lesson(rt, 'recovery'); });
    rt.after(20, () => {
      F.training = 16;
      if (rt.player.hasKatana) lesson(rt, 'switch');
      else if (F.lesson) lessonEnd(rt, F.lesson);
    });
    rt.after(30, () => {
      if (F.lesson) lessonEnd(rt, F.lesson);
      F.step = 3; F.stepT = rt.t; F.training = 17;
      rt.setPhase('hayashi');
      F.hayaU.noTarget = false; F.hayaU.invuln = false;
      F.hayaMorale = F.hayaG.morale;
      F.kuroda.order = 'attack'; F.kuroda.focus = F.hayaU; F.kuroda.seekRange = 45;
      for (const g of [F.hata, F.mori]) { g.order = 'attack'; g.focus = F.hayaU; g.seekRange = 35; }
      if (!rt.G.lord) { F.nobuGroup.order = 'attack'; F.nobuGroup.focus = F.hayaU; }
      rt.say('組頭 源八', '黒田殿が林美作守と斬り合っておる。味方と押せ！', 4);
      rt.obj('main', '味方と攻め、林美作守の備を崩そう', 'main');
    });
  },

  // 段十七。討死直後は林の備だけが下がり、時間差で隣へ伝わる。
  hayaFell(rt) {
    const F = rt.flags;
    if (F.step !== 3 || F.hayaU.alive) return;
    F.step = 4; F.stepT = rt.t;
    rt.setPhase('hayafell');
    rt.unmark('hayaU');
    rt.banner('林美作守、討死', '大将を失った備が下がり、中央の脇が開く');
    brushWord(rt, '林美作守 討ち取ったり', { hold: 2.2 });
    sfx('taiko', 1); rt.after(0.3, () => sfx('taiko', 0.9));
    // 共通の討死処理にも士気低下があるため、直前の値から四十だけ下げる。
    F.hayaG.morale = Math.max(0, F.hayaMorale - 40);
    F.hayaG.order = 'retreat'; F.hayaG.dest = { x: -32, z: -72 };
    F.hayaG.onArrive = (g) => vanish(rt, g); F.hayaG.speed = 1.8;
    F.hayaG.aggro = 1; F.hayaG.fire = false;
    lesson(rt, 'chain');
    rt.after(9, () => {
      F.centerOpen = true;
      const g = F.hayaCenter;
      g.morale = Math.max(0, g.morale - 30); g.aggro = 1; g.fire = false;
      g.order = 'retreat'; g.dest = { x: -8, z: -80 }; g.speed = 1.8;
      g.onArrive = (q) => vanish(rt, q);
      rt.say('組頭 源八', '林の備が下がった！中央の脇が開いたぞ。味方と前へ！', 4);
      for (const q of [F.hata, F.mori, F.sassa, F.nazuka]) if (!gone(q)) {
        q.focus = null; q.order = 'move'; q.dest = { x: q.anchor.x, z: 4 };
        q.onArrive = advanceOnArrival;
      }
      F.kuroda.focus = null; F.kuroda.order = 'attack'; F.kuroda.seekRange = 35;
      F.nobuGroup.focus = null; F.nobuGroup.order = 'attack'; F.nobuGroup.seekRange = 30;
      F.front.push('B', 0.6);
    });
    rt.after(21, () => {
      F.mainBroken = true; F.training = 18;
      F.front.rout('B', { hideAfter: 40 });
      for (const g of F.haya) { g.noRout = false; }
      lesson(rt, 'pursuit');
      rt.obj('main', '味方と追撃し、柴田の槍隊には近づきすぎない', 'main');
      rt.award((t) => { t.special = { label: '稲生原で部隊の崩れを連ねた', pts: 18 }; }, '林の備から中央を崩した');
    });
    rt.after(32, () => this.shibaRetreat(rt));
  },

  // 段十九。弓、武者、しんがりの長槍。勝家は最後まで槍隊のそばに残る。
  shibaRetreat(rt) {
    const F = rt.flags;
    // 林の主力が崩れたら退く。宮井を誰が討ったかや、利家との接触を進行条件にしない。
    if (F.step !== 4 || !F.mainBroken) return;
    F.step = 5; F.stepT = rt.t; F.training = 19;
    if (F.lesson) lessonEnd(rt, F.lesson);
    rt.unmark('shiba');
    rt.setPhase('shibataRetreat');
    rt.banner('柴田隊、孤立', '周りの備が崩れても、槍の列を崩さず退く');
    rt.after(4, () => rt.say('足軽', '柴田様の隊が下がっていく……。押し返したぞ！', 4));
    rt.say('柴田勝家', '退け！', 3);
    for (const g of F.shiba) {
      g.focus = null; g.onArrive = null; g.noRout = true; g.morale = Math.max(60, g.morale);
      g.fire = false; g.aggro = 2; g.speed = 1.8;
    }
    F.retreatSpear = { x: F.shiba1.anchor.x, z: -108 };
    F.retreatWarrior = { x: F.shibaG.anchor.x, z: -120 };
    F.shibaBow.order = 'retreat'; F.shibaBow.dest = { x: 0, z: -130 }; F.shibaBow.onArrive = (g) => vanish(rt, g);
    // 勝家の武者は立ち止まらず、ゆっくり下がり始める。
    F.shibaG.order = 'retreat'; F.shibaG.dest = F.retreatWarrior; F.shibaG.speed = 1.2;
    F.shiba1.order = 'yari'; F.shiba1.facing = 0;
    for (const u of F.rearSpears) { u.noTarget = false; u.aiT = 0; }
    rt.after(6, () => {
      F.shiba1.order = 'retreat'; F.shiba1.dest = F.retreatSpear;
    });
    // 勝家本人の最終の下がりは、槍隊が十分離れてから。
    F.shibaU.noTarget = true; F.shibaU.target = null; F.shibaU.atk = null;
    F.shibaU.moveTo = null;
    rt.obj('main', '深追いせず、柴田隊が退くのを見届けよう', 'main');
    // 味方は立って見送らず、退く柴田の後ろを押す。
    for (const g of [...F.friends, F.nobuGroup, F.kuroda, F.nazuka]) if (!gone(g)) { g.focus = null; g.order = 'attack'; g.aggro = 6; g.seekRange = 60; }
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending || !F.mainBroken || !F.commanderRetired) return;
    F.ending = true; F.training = 20;
    if (F.lesson) lessonEnd(rt, F.lesson);
    rt.setPhase('end');
    rt.unmark('holdFlag');
    rt.objDone('main');
    rt.tracker.main = true;
    if (!F.strayed) rt.objDone('stay');
    // 勝った瞬間：鬨の声と太鼓・短い止まり・味方の勝ち鬨・筆文字の「勝」。自分と味方を映したまま三秒で結果へ（テストプレイの声 10/24）。
    rt.player.u.invuln = true;
    for (const g of F.friends) { g.order = 'hold'; g.focus = null; }
    victoryMoment(rt, '勝');
    rt.say('組頭 源八', '勝ったぞ！　勝ち鬨をあげよ！', 3);
    rt.finish({ scriptedEnd: true }, 3.2);
  },

  update(rt, dt) {
    const F = rt.flags;
    const p = rt.player.u.pos;
    if (F.ending) return;
    KIT.backTick(rt);
    // 赤い▼の本人への道を、既存の道譲りと共有する。囲みの札は要らない。
    rt.army.guideWayEnemy = this.missionSignTarget(rt);
    rt.army.guideWayAt = rt.army.time;
    // 札の成功は今の段だけを見る。先に押した操作で後の段を済ませない。
    const P = rt.player;
    // 移動・視点を試す間も敵は斬れるが、初めの三人からは打ち込まれない。
    if (F.step === 0 && F.training === 0) rt.army.playerCounterUntil = rt.army.time + 0.3;
    if (F.lesson === 'look') {
      F.look += Math.abs(((P.yaw - F.yaw0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      F.yaw0 = P.yaw;
      if (F.look > 1.6) rt.tutMark('look');
    }
    if (F.lesson === 'lock' && P.lock) rt.tutMark('lock');
    if (F.lesson === 'block' && rt.stats.blocks + rt.stats.parries > F.blocks0) {
      rt.tutMark('block');
      F.counterHp = F.practice.units.reduce((n, u) => n + Math.max(0, u.hp), 0);
      lesson(rt, 'counter');
    }
    if (F.lesson === 'counter' && F.practice.units.reduce((n, u) => n + Math.max(0, u.hp), 0) < F.counterHp) rt.tutMark('counter');
    // 説明は五秒で引く。成功・進行の監視は札が消えても続ける。
    if (F.lesson && rt.t - F.lessonAt > 5 && !F.lessonHidden) { F.lessonHidden = true; rt.hud.renderTut(null); }
    if (F.step === 0) {
      const elapsed = rt.t - F.trainT;
      if (F.training === 0) {
        // 移動 → 視点 → 攻撃。操作を試せたら早めに次へ（目安：移動23秒・視点8秒・攻撃6秒）。
        const since = rt.t - (F.lessonAt || 0);
        if (F.lesson === 'move' && (P.movedAcc - F.move0 >= 2 || F.lessonDone?.move || since > 23)) { rt.tutMark('move'); F.view0 = SETTINGS.view; lesson(rt, 'view'); F.strike0 = F.strikeN; }
        else if (F.lesson === 'view' && (SETTINGS.view !== F.view0 || since > 8)) {
          F.viewSuccess = SETTINGS.view !== F.view0;
          if (F.viewSuccess) rt.tutMark('view');
          P.switchWeapon('spear');
          F.strike0 = F.strikeN; lesson(rt, 'swing');
        }
        else if (F.lesson === 'swing' && (F.strikeN > F.strike0 || since > 6)) {
          if (F.strikeN > F.strike0) rt.tutMark('swing');
          this.trainingPhase(rt, 1);
        }
      } else if (F.training === 1) {
        const g = F.practice, u = approachUnit(rt);
        if (!F.caught && u && Math.hypot(p.x - u.pos.x, p.z - u.pos.z) <= 7) {
          // 追いついた：味方二人は横へ抜け、林兵三人が向き直る。
          F.caught = rt.t; F.strikeCaught = F.strikeN;
          rt.unmark('chase'); F.chase = false;
          const ac = F.chaseA.center();
          F.chaseA.dest = { x: ac.x + 40, z: ac.z - 30 }; F.chaseA.speed = 3.2;
          F.chaseA.onArrive = (q) => vanish(rt, q);
          g.order = 'attack'; g.aggro = 12; g.seekRange = 30; g.speed = 1.6;
          for (const u of g.units) u.noTarget = false;
          rt.obj('main', '赤い▼の林美作守の兵を倒せ', 'main');
          rt.say('組頭 源八', usesTouchControls() ? '白ふちの赤い▼が追う兵だ。槍が届くまで近づき、「つく」を押して離せ！' : '白ふちの赤い▼が追う兵だ。槍が届くまで近づき、左押しで攻撃だ！', 4);
          lesson(rt, 'kill');
        }
        if (F.caught && !F.firstHitAt && F.strikeN > F.strikeCaught) F.firstHitAt = rt.t;
        // 初めの攻撃から三十秒は、敵は自分へ打ち込まない（打ち込む前も待つ）。
        if (F.caught && (!F.firstHitAt || rt.t < F.firstHitAt + 30)) rt.army.playerCounterUntil = rt.army.time + 0.3;
        if (P.u.alive) P.u.hp = Math.max(P.u.hp, P.u.maxHp * 0.7);
        if (F.caught && !practiceLeft(rt)) { rt.tutMark('kill'); rt.say('組頭 源八', 'よし、討ったな！　まだ来るぞ', 3); this.trainingPhase(rt, 3); }
        // 追跡先を突然移さず、少し退いたら同じ場所で待つ。
        else if (!F.caught && !F.chaseStopped && rt.t - F.trainT > 8) {
          F.chaseStopped = true;
          for (const group of [g, F.chaseA]) {
            group.order = 'hold'; group.dest = null;
            for (const u of group.units) u.moveTo = null;
          }
        }
      } else if (F.training >= 2 && F.training <= 4) {
        // 最初の実戦は死なせず、一度に敵を足さない。
        if (P.u.alive) P.u.hp = Math.max(P.u.hp, P.u.maxHp * 0.7);
        if (false) {
          // 先に敵を倒した人にも、防御の次に反撃する順番を残す。
          F.counterHp = 0; lesson(rt, 'counter');
        }
        if (!practiceLeft(rt) && elapsed > 6 && (F.training !== 3 || rt.t - F.lessonAt > 5)) this.trainingPhase(rt, F.training + 1);
        else if (elapsed > 90) {
          F.hata.aggro = 12; F.hata.order = 'attack'; F.hata.seekRange = 30;
          rt.objProgress('main', '組頭のそばで、味方と敵を止めよう');
        }
      } else if (F.training === 5) {
        if (elapsed > 12) { rt.tutMark('together'); this.trainingPhase(rt, 6); }
      } else if (F.training === 6 && elapsed > 7) {
        rt.tutMark('identify'); this.trainingPhase(rt, 7);
      } else if (F.training === 7 && (F.lessonDone?.lock && elapsed > 6 || elapsed > 20)) this.trainingPhase(rt, 8);
      else if (F.training === 8) {
        if (!F.hayaLead.alive && !F.smallRout) {
          F.smallRout = rt.t;
          F.haya1.noRout = false; F.haya1.morale = Math.max(0, F.haya1.morale - 40);
          F.haya1.order = 'retreat'; F.haya1.dest = { x: -24, z: 8 };
          F.haya1.onArrive = advanceOnArrival;
          for (const u of F.haya1.units) u.cdBase *= 1.5;
          rt.say('組頭 源八', '侍大将を失った部隊は士気が下がる。敵が下がったぞ', 4);
          rt.tutMark('morale');
        }
        if (F.smallRout && rt.t - F.smallRout > 10) this.shibaCome(rt);
      }
    }
    // 勝家の近くは強気、離れると元へ戻る。一秒に一度・既存の三隊だけ。
    if (F.step === 1 && !(F.auraAt > rt.t)) {
      F.auraAt = rt.t + 1;
      const strong = F.shibaU.alive && !F.shibaU.woundOut && !F.shibaU.fleeing;
      for (const g of F.shiba) {
        if (gone(g)) continue;
        const c = g.center();
        const near = strong && Math.hypot(c.x - F.shibaU.pos.x, c.z - F.shibaU.pos.z) < 24;
        g.aggro = near ? 14 : 8; g.dmgMult = near ? 1 : 0.75;
        if (near && !F.flankSuccess) g.morale = Math.max(g.morale, 88);
      }
    }
    // 側面へ回る間は、組頭の命令どおり動いた人を離脱扱いにしない。
    const lead = F.nobuU?.alive ? F.nobuU.pos : NOBU;
    if (!rt.G.lord && F.step >= 1 && F.step < 5 && !F.strayed && F.training !== 11 && F.training !== 12) {
      const d = Math.hypot(p.x - lead.x, p.z - lead.z);
      F.strayT = d > 52 ? (F.strayT || 0) + dt : 0;
      if (F.strayT > 10) { F.strayed = true; rt.violation('味方を離れたため、手柄が減った', ['組頭 源八', '味方と並べ。まだ負けではないぞ']); rt.objFail('stay'); }
    } else F.strayT = 0;
    // 耐える段で自分が信長から遠く離れたら、信長と旗本が自分のそばへ来る。戻る道で敵中に取り残さない（テストプレイの声 10/24）。
    if (!rt.G.lord && F.step === 1 && !(F.followAt > rt.t) && F.nobuU?.alive &&
        !(F.training === 11 && !F.flankReached) && !(F.training === 12 && !gone(F.shiba1))) {
      F.followAt = rt.t + 1;
      const d = Math.hypot(p.x - F.nobuU.pos.x, p.z - F.nobuU.pos.z);
      if (d > 22) {
        const tx = p.x * 0.75 + F.nobuU.pos.x * 0.25, tz = p.z + 5;
        for (const g of F.centerBack ? [F.nobuGroup] : [F.nobuGroup, F.hata]) {
          if (gone(g) || g.dest && Math.hypot(g.dest.x - tx, g.dest.z - tz) < 6 && g.order === 'move') continue;
          // 寄る間は足を止めて斬り合わない。着いたら戦う。
          g.order = 'move'; g.speed = 4.2; g.aggro = 0; g.dest = { x: tx + (g === F.hata ? 4 : 0), z: tz };
          for (const u of g.units) { u.target = null; u.moveTo = null; u.settled = false; }
          g.onArrive = (q) => { q.order = 'attack'; q.aggro = 8; q.seekRange = 28; };
        }
      }
    }
    if (F.step === 1) {
      const elapsed = rt.t - F.stepT;
      if (elapsed > 6 && F.training < 10) F.training = 10;
      if (elapsed > 24 && F.training < 11) {
        F.training = 11; lesson(rt, 'side');
        rt.marker('flank', FLANK, '右の畦道', { guideRadius: 8 });
        rt.obj('main', '味方が正面を押さえる間に、右の畦へ回ろう', 'main');
        rt.say('組頭 源八', '右へ回れ！横から崩せ！', 4);
        F.inu.order = 'move'; F.inu.dest = { ...FLANK }; F.inu.onArrive = advanceOnArrival;
      }
      // ピン（右の畦）に着いたら、時を待たずに横からの攻めへ進む（行き先と判定を合わせる）。
      if (F.training === 11 && !F.flankReached && Math.hypot(p.x - FLANK.x, p.z - FLANK.z) < 8) F.flankReached = true;
      if ((elapsed > 42 || F.flankReached && elapsed > 26) && F.training < 12) {
        F.training = 12; lesson(rt, 'flank');
        F.flankHp = F.shiba1.units.reduce((n, u) => n + Math.max(0, u.hp), 0);
      }
      if (F.training === 12 && !(F.flankAt > rt.t)) {
        F.flankAt = rt.t + 1;
        const g = F.shiba1, c = g.center();
        const hp = g.units.reduce((n, u) => n + Math.max(0, u.hp), 0);
        if (!F.flankSuccess && p.x > c.x + 7 && Math.hypot(p.x - c.x, p.z - c.z) < 20 && hp < F.flankHp) {
          F.flankSuccess = true;
          g.morale = Math.max(25, g.morale - 18); g.facing = Math.atan2(p.x - c.x, p.z - c.z);
          g.order = 'retreat'; g.dest = { x: c.x - 3, z: c.z - 5 };
          g.onArrive = advanceOnArrival;
          rt.tutMark('flank');
          rt.award((t) => { t.side.push('味方と側面から柴田の槍を崩した'); }, '側面攻撃 成功');
        }
        F.flankHp = hp;
      }
      if (elapsed > 48 && !F.miyaiDuel) {
        F.miyaiDuel = true;
        F.miyaiU.noTarget = false; F.miyaiU.onWound = () => {};
        F.inu.order = 'attack'; F.inu.focus = F.miyaiU;
      }
      if (elapsed > 66 && F.training < 13) this.hayaCome(rt);
      if (elapsed > 86 && !F.leftBack) {
        F.leftBack = true;
        F.mori.morale = Math.max(25, F.mori.morale - 30);
        F.mori.order = 'retreat'; F.mori.dest = { x: -24, z: 52 };
        F.mori.onArrive = advanceOnArrival;
        F.front.push('A', 0.5);
        rt.say('足軽', '左が崩れた！中央の脇が空くぞ！', 4);
      }
      if (elapsed > 98 && !F.centerBack) {
        F.centerBack = true;
        F.hata.morale = Math.max(30, F.hata.morale - 20);
        F.hata.order = 'retreat'; F.hata.dest = { x: 0, z: 56 };
        F.hata.onArrive = advanceOnArrival;
        rt.say('組頭 源八', '中央も下がる！列を切らすな！', 4);
      }
      if (elapsed > 112) this.daionjo(rt);
    }
    // 宮井がほかの者に討たれても、段を止めない（全員が打ち合うので、利家より先に倒れる事がある）。
    if (F.miyaiU && !F.miyaiFell && !F.miyaiU.alive && F.step < 5) { F.miyaiFell = true; F.inu.focus = null; }
    if (F.miyaiDuel && !F.miyaiFell && F.miyaiU.alive && F.step < 5) {
      const toshi = F.inu.units[0];
      if (toshi?.alive && Math.hypot(toshi.pos.x - F.miyaiU.pos.x, toshi.pos.z - F.miyaiU.pos.z) < 3.5) {
        F.miyaiFell = true;
        F.miyaiU.invuln = false; F.miyaiU.hp = 0; rt.army.kill(F.miyaiU, toshi);
        F.inu.focus = null;
        rt.banner('前田利家、宮井勘兵衛を討つ', '若い利家が槍を振るい、味方の脇を支えた');
      }
    }
    if (F.step === 3) {
      // 討死前の士気を保存する。共通処理との二重の引き下げを防ぐ。
      if (F.hayaU.alive) F.hayaMorale = F.hayaG.morale;
      // 味方との接触を待ち、遠くにいる美作守を台詞だけで討たない。
      const elapsed = rt.t - F.stepT;
      const nobu = F.nobuU;
      if (F.hayaU.alive && elapsed > 55 && nobu?.alive && Math.hypot(nobu.pos.x - F.hayaU.pos.x, nobu.pos.z - F.hayaU.pos.z) < 4) {
        F.hayaU.hp = 0; rt.army.kill(F.hayaU, nobu);
      }
      if (!F.hayaU.alive) this.hayaFell(rt);
    }
    if (F.step === 5) {
      const elapsed = rt.t - F.stepT;
      // 近くの追い手を一秒に一度だけ見る。止める時間を区切り、またまとまって退く。
      if (!(F.guardAt > rt.t)) {
        F.guardAt = rt.t + 1;
        const g = F.shiba1;
        const guard = g.units.find((u) => u.alive && !u.woundOut);
        const pursuer = guard && rt.army.nearestEnemy(guard, 13, (u) => !u.fleeing && !u.noTarget);
        if (F.guardUntil && rt.t >= F.guardUntil) {
          F.guardUntil = 0; F.guardNext = rt.t + 12;
          g.order = 'retreat'; g.dest = F.retreatSpear;
          if (F.lastWithdraw) { F.shibaG.order = 'retreat'; F.shibaG.dest = F.retreatWarrior; }
        } else if (elapsed > 6 && elapsed < 75 && pursuer && !F.guardUntil && !(F.guardNext > rt.t)) {
          F.guardUntil = rt.t + 5;
          g.order = 'yari'; g.facing = Math.atan2(pursuer.pos.x - guard.pos.x, pursuer.pos.z - guard.pos.z);
          rt.say('組頭 源八', '追いすぎるな！槍が向き直るぞ！', 4);
        }
      }
      if (elapsed > 18 && !F.lastWithdraw && !F.guardUntil) {
        F.lastWithdraw = true;
        F.shibaG.order = 'retreat'; F.shibaG.dest = F.retreatWarrior;
      }
      // 追い手に絡まれて下がり切れない時も、七十秒で退き終えた扱いにする（止まったまま終わらない戦にしない）。
      if (F.lastWithdraw && (F.shibaU.pos.z < -105 || elapsed > 70) && (F.shiba1.count === 0 || F.shiba1.center().z < -88 || elapsed > 60)) {
        F.commanderRetired = true;
        this.win(rt);
      }
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    if (v === F.miyaiU) { F.miyaiFell = true; F.inu.focus = null; }
    if (v === F.hayaU && F.step === 3) this.hayaFell(rt);
  },

  onRout(rt, g) {
    const F = rt.flags;
    if (g.team !== 1) return;
    if (g === F.shiba1 && F.step === 1) rt.say('足軽', '柴田の先手が崩れたぞ！', 2.5);
    else if (g === F.haya1 && F.step === 3) rt.say('足軽', '林の先手が崩れた！　旗本が裸じゃ！', 2.5);
  },
};

inou.taisho = { a: null, b: null };
inou.rts = true;
inou.sides = { a: { name: '信長方', mon: 'oda' }, b: { name: '信勝方', mon: 'kari' } };
inou.introSides = { a: '信長方 約七百', b: '信勝方 約千七百' };
// 信長公記の数：信長方 七百足らず、信勝方 柴田勝家 千・林美作守 七百
inou.force = (rt) => {
  const F = rt.flags;
  // 左・中央が崩れた時は味方の棒が押し戻される（押されているのが上の棒で見える）。
  return { a: Math.max(0, 700 - (F.ak || 0) * 4 - (F.leftBack ? 90 : 0) - (F.centerBack ? 90 : 0)), a0: 700, b: Math.max(0, 1700 - (F.ek || 0) * 6 - (F.centerOpen ? 350 : 0) - (F.mainBroken ? 350 : 0) - (F.commanderRetired ? 500 : 0)), b0: 1700 };
};
inou.canSkip = () => ''; // 説明を隠しても戦の段取りは飛ばさない
inou.skip = () => {};
inou.date = () => '弘治二年八月二十四日　秋・晴・昼';
inou.history = '弘治二年（1556）八月二十四日、尾張の稲生の野で、織田信長と弟の信勝（信行）の兵が戦った。父の信秀が亡くなった後、家老の林秀貞・林美作守の兄弟と柴田勝家は信勝を立てようとした。信長は佐久間大学（盛重）に名塚に砦を築かせ、於多井川（庄内川）を渡って東へ出た。『信長公記』は、柴田勢千ほど、林美作守の七百ほどに対し、信長方は七百に足らなかったと記す。はじめ柴田勢に押され、佐々孫介らが討たれ、信長のまわりは四十ほどになった。信長が大声で怒鳴ると、柴田の兵は主の声に恐れて逃げたという。信長は林勢へ向かい、黒田半平と斬り合う美作守を自ら討った。前田利家が宮井勘兵衛を討ったとも伝わる。信勝は母の土田御前のとりなしで許されたが、のちに再び背き、清洲で討たれた。信長はこの後、浮野の戦いで岩倉の織田家も破り、尾張をほぼ一つにまとめた。兵の細かな配置、林勢の寄せ口、旗印、名塚の砦の形、短い時間は遊びのための推定。地形は国土地理院の標高を丸めて使った。';

// 素直な遊び手：組頭と進み、右の畦から攻め、敵主力と指揮官の退きを見届ける
inou.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  if (!u.alive || F.ending) return;
  if (u.hp < u.maxHp * 0.55) b.botRest = true;
  if (b.botRest && u.hp > u.maxHp * 0.85) b.botRest = false;
  const lead = F.step === 0 && F.genU?.alive ? F.genU.pos : F.nobuU && F.nobuU.alive && F.nobuU !== u ? F.nobuU.pos : NOBU;
  if (b.botRest) { inp.guardHold = false; goTo(p, inp, lead.x - 6, lead.z, 2); return; }
  if (F.step >= 5) { inp.guardHold = false; goTo(p, inp, lead.x + 5, lead.z + 4, 3); return; }
  if (F.step === 1 && (F.training === 11 || F.training === 12)) {
    if (Math.hypot(u.pos.x - FLANK.x, u.pos.z - FLANK.z) > 5) { goTo(p, inp, FLANK.x, FLANK.z, 3); return; }
  }
  if (F.step === 0 && F.training === 1 && F.chase) { const c = F.practice.center(); goTo(p, inp, c.x, c.z + 2, 2); return; }
  if (F.step === 0 && F.training <= 0) { goTo(p, inp, p.u.pos.x, p.u.pos.z - 3, 1); return; }
  const e = b.army.nearestEnemy(u, F.step === 0 ? 35 : 10, (o) => !o.noTarget && !o.fleeing && !o.invuln && (F.step !== 0 || F.training > 4 || o.group === F.practice) && Math.hypot(o.pos.x - lead.x, o.pos.z - lead.z) < 40);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.6) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.85;
    if (F.step === 0 && F.training === 3 && F.lesson === 'block') { inp.guardHold = true; inp.leftPressed = false; }
    if (F.step === 0 && F.training === 4 && e.atk) inp.k.add('Space');
    return;
  }
  inp.guardHold = false;
  if (F.step === 3) { const t = F.haya.find((g) => !gone(g)); if (t) { const c = t.center(); if (Math.hypot(c.x - lead.x, c.z - lead.z) < 36) { goTo(p, inp, c.x, c.z, 2); return; } } }
  goTo(p, inp, lead.x + 6, lead.z + 3, 3);
};

export { inou };
