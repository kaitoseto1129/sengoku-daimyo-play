// 旧越前の入口も、実寸の木ノ芽峠の定義を使う。
// 縮めた二砦・敵だけ弱い傷・時刻による救済・本陣への斬り込みは重ねない。
import { kinome, kinomeCourtLevel } from './b_kinome.js';
import * as THREE from 'three';
import { dirtTex } from './nature.js';
import { KINOME_PLAN, KINOME_ROADS, ROAD, EXIT_KANNON, EXIT_KINOME } from './castles/kinome.js';
import { distToPolyline } from './world.js';
import { distToSeg } from './units.js';
import { addDeck, groundAt } from './floors.js';
import { tabaGeo } from './taketaba.js';
import { drawGroundAt, guardDrawCamera, avoidCameraBodies } from './render_camera.js';
import { sfx } from './audio.js';
import { isTouch } from './touch.js';
import { S } from './settings.js';
import { NAKA } from './naka.js';

// 実際の構え方に合わせる。携帯と切替式では長押しを強いない。
function passGuardAction() {
  return isTouch ? '「構え」を押す' : S.guardToggle ? '右クリックで構える' : '右クリックを押し続ける';
}

// 山肌だけが空色へ消えると、道と木が空中に浮いて見える。
// 土と樹木を同じ距離の霞へそろえる。高さによる濃淡の差で幹だけ残さない。
function passSoilFog(mat) {
  const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => `${key}|越前の地面と森の霞の抜け`;
  mat.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment)
      // 共通の霞に補正が足されても、高さを使う式全体を差し替える。
      // 古い式との完全一致では補正が外れ、谷の土だけ先に抜けてしまう。
      .replace(/float fogFactor = [^;\n]*\bfogPath\b[^;\n]*;/,
        'float fogFactor = 1.0 - exp(-fogPath / fogVis * 1.2);')
      // 霞み切った土も不透明のままだと、遠い地形の三角形が空を切る。
      // 色の霞がほぼ白くなるまで待つと、嵐でも八百メートル先の山の面が残る。
      // 見通しの距離で土と森を一緒に抜き、遠い尾根の直線を空へなじませる。
      .replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );',
        `gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
         float passHazeGrain = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
         if (smoothstep(fogVis * 0.9, fogVis * 1.8, fogD) > passHazeGrain) discard;`);
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

const echizen = Object.defineProperties({}, Object.getOwnPropertyDescriptors(kinome));
// 『信長公記』巻八：十五日は風雨。光秀・秀吉は海側、信長は敦賀。
// https://ja.wikisource.org/wiki/信長公記#巻八（七）越前御進発賀越両国被仰付之事
// 峠口の各備を特定の将に割り振る根拠はないので、共通の織田の旗にする。
echizen.passAttackFlag = 'oda';
// 観音丸の入口は土の坂を見せる。推定の敷石を黒い横板として重ねない。
echizen.earthenGateApproach = true;
echizen.jinkei = kinome.jinkei.map(plan => plan.team === 0 ? {
  ...plan, name: '峠口の寄せ（配置・人数は推定）',
  sonae: plan.sonae.map(s => ({ ...s, flag: 'oda', mon: 'oda', general: '織田の将（名は不明）' })),
} : plan);
// 数を減らしたり全軍の史料値に置き換えず、この持ち場の仮の数だと札で示す。
echizen.sides = {
  a: { name: '峠の先手（推定）', mon: 'oda' },
  b: { name: '一揆勢（推定）', mon: 'namu' },
};
echizen.mapNotes = rt => rt.flags.echizenMapNotes;
echizen.history = kinome.history + 'この持ち場の織田の各備は特定の将への所属を断定しない。人数札は局地の仮の人数を示す。北陸道と麓の谷川の細かな道筋・流路は推定として地図に記す。';
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
echizen.introText = () => `まず味方の旗で${passGuardAction()}。退く時は構えたまま、敵を向いて後ろへ歩け。進み太鼓で本道の印へ。木戸が開いたら味方と中へ。矢は竹束の陰で避けよ。深手なら十字へ退き、「手当て」を三秒長押し。`;
// 背の低い横画面でも、人物紹介より先に最初の下知と勝つ条件を読む。
echizen.introTaskFirst = true;
// 人物名だけが釦の上で切れないよう、紹介は自分で開いて読む。
echizen.introPeopleFolded = true;
// 横画面で用語の説明が軍名を押し下げないよう、開始札だけ短くする。
echizen.introSides = { a: '織田の先手（推定）', b: '一揆勢（推定）' };
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
    return '本道から木ノ芽峠城へ';
  if (text === '進み太鼓と法螺貝。竹束と木戸へ進み、味方と中を押さえよ')
    return '竹束と木戸へ。開いたら味方と中へ';
  // 届かない所で長押しを促さない。掛矢に届いた時の指図だけ操作名へ替える。
  if (text === '木戸の前へ。味方と進め') return '木戸へ。味方と進め';
  if (text === '「打つ」を長押しして木戸を破れ') return '木戸で「打つ」を長押し';
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
  const gate = F.kannonFell ? F.gateKinome : F.gateKannon;
  if (F.souFell || !gate || gate.struct.alive) return 'road';
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

echizen.world = {
  ...kinome.world,
  paths: ECHIZEN_PATHS,
  // 逃げる細道を木で塞がず、里の家や谷川の当たりはそのまま読む。
  clear: (x, z) => kinome.world.clear(x, z) || peoplePathDistance(x, z) < 4,
  compactScenery: true,
  infantryWeight: true,
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
  raggedNeedles: true,
  brokenNeedleTiers: true,
  unevenCrowns: true,
  // 遠景も枝の輪郭を崩し、雑木の重複頂点は一緒に動かして樹冠を裂かない。
  softFarNeedles: true,
  closedFarCrowns: true,
  // 木や据え物を置く前から、描く地面の三角形と同じ高さを読む。
  terrainTriangles: true,
  // 携帯でも足場と同じ格子を描く。粗い別の三角形が目線を覆わないようにする。
  keepTerrainGrid: true,
  height(x, z) {
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
  },
  // 土色だけから草の量を逆算すると、道の外まで裸の斜面になる。
  // 数は増やさず、道の肩に低い草の群落と湿った裸地を交互に残す。
  grassMix(x, z, pathDistance) {
    const edge = Math.max(0, Math.min(1, (pathDistance - 1.2) / 2.8));
    const patch = .5 + .5 * Math.sin(x * .31 + Math.sin(z * .17)) * Math.cos(z * .23);
    return edge * (.22 + .58 * patch);
  },
  tint(x, z, h, color) {
    let d = Infinity;
    for (const road of ECHIZEN_PATHS) d = Math.min(d, distToPolyline(x, z, road));
    // 道の肩を草地へなじませ、坂に貼った一枚の板のような境を減らす。
    const t = Math.max(0, Math.min(1, (d - 5) / 6));
    const blend = t * t * (3 - 2 * t);
    color.setRGB(.52 - .14 * blend, .40 + .06 * blend, .25 + .02 * blend);
  },
};

echizen.setup = function (rt) {
  // 長い戦名の最後の一文字だけが次の行へ落ちないよう、越前の札だけ整える。
  const layout = document.createElement('style');
  layout.textContent = `
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
     任務の一覧を開けば本来の下知を読める。携帯・パソコンで共通にする。 */
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
      content:'続きは上下に送って読めます'; order:1; flex:0 0 auto;
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
    /* 途中で切れた下知に続きがある事を、釦のすぐ上で伝える。 */
    #hud #intro[data-battle="echizen"] > .card::after {
      content:'下知は上下に送って読めます'; order:1; flex:0 0 auto;
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
  // 次の折れ目の距離は行き先の札にある。任務には山道全体の距離だけを残す。
  const progress = rt.objProgress;
  rt.objProgress = function (id, text) {
    if (id === 'main') text = text.replace(
      /^(観音丸|木ノ芽峠城)の木戸まで あと(\d+)メートル。次の道の印まで\d+メートル$/,
      (_, name, meters) => `${name === '観音丸' ? '最初の木戸' : '次の木戸'}まで、山道をあと${meters}メートル`);
    return progress.call(this, id, text);
  };
  // 携帯横の二行で読み切れる長さにする。台詞の枠は増やさない。
  const say = rt.say;
  rt.say = function (speaker, text, ...args) {
    if (speaker === '明智光秀') speaker = '組頭';
    if (/海側は明智光秀・羽柴秀吉/.test(text)) text = '海側は光秀・秀吉に任せる。我らは木戸を開く';
    if (text === '者ども、竹束を前へ！　押し立てて寄せよ！')
      text = '進み太鼓と法螺貝じゃ。竹束を前へ、木戸へ寄せよ！';
    // 別手への下知を、遊び手の本道の任務と取り違えさせない。
    if (text === '手前は先に東の尾根より、西光寺丸城を衝き申す')
      text = '別手は東の城へ向かう。おぬしの組は本道の次の木戸へ';
    if (text === '先に鉢伏城の高みを押さえよ。西へ回れ')
      text = '別手は西の城へ向かう。おぬしの組は本道の次の木戸へ';
    if (text === '木戸が開いたぞ。槍をそろえ、中へ続け！' ||
        text === '次の木戸も開いた。味方と中を押さえよ') {
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
    return say.call(this, speaker, text, ...args);
  };
  const objective = rt.obj;
  rt.obj = function (id, text, ...args) {
    if (id === 'main' && text === '本道を登れ。観音丸の木戸を破り、味方と中を押さえよ')
      text = '進み太鼓と法螺貝。竹束と木戸へ進み、味方と中を押さえよ';
    if (id === 'main' && (text === '木戸が開いた。味方と入り、観音丸の守りを崩せ' ||
        text === '木戸を通れ。味方と木戸内の守りを崩せ'))
      text = '懸かり太鼓。木戸を通り、味方と守兵を崩せ';
    return objective.call(this, id, text, ...args);
  };
  // 既存の十秒後の手ほどき一回を、押す操作まで分かる言葉にする。
  const after = rt.after;
  rt.after = function (seconds, fn) {
    if (seconds === 10 && this.phase === 'brief') fn = () => {
      if (!rt.over && !rt.flags.ending && !rt.flags.step && rt.player.u.alive)
        rt.say('組頭', '槍は敵へ向けよ。「構え」を押し続け、味方のそばで受けよ', 5);
    };
    return after.call(this, seconds, fn);
  };
  try { kinome.setup.call(this, rt); } finally { rt.after = after; }

  // 動く備えの注記は元の物を借りる。道・川の注記は準備時に一度だけ足す。
  // 共通定義が更新する mapNotes へ入れると、部隊の下知と取り違えるため別に持つ。
  rt.flags.echizenMapNotes = [...rt.flags.mapNotes,
    { pos: { x: ROAD[2][0], z: ROAD[2][1] }, text: '北陸道（道筋は推定）' },
    { pos: { x: -156, z: -950 }, text: '麓の谷川（流路は推定）' },
  ];

  // 矢の独立札を既存の三枠へまとめ、行き先の札と重ならせない。
  // 「影」は落下範囲の印と物陰を取り違えやすいので、退く場所を伝える。
  rt.army.hooks.onArrowRain = function (volley, under) {
    if (!under || volley.team === rt.player.u.team || rt.t < 5 || rt.over || rt.ended || !rt.player.u.alive) return;
    rt.hud.notices.push('▲ 矢が降る。竹束の後ろへ退け', 110,
      Math.max(3, volley.T + .4), 'warn', () => !rt.over && !rt.ended && rt.player.u.alive);
  };

  // 郭の外へ出たら、近い口へ本道を逆にたどる。制圧前に先の曲がり角へ送らない。
  // 目印と自動操作は同じ点を使い、二つの案内が食い違わないようにする。
  const courtPoint = { x: 0, z: 0 }, courtMouth = { x: 0, z: 0 };
  let courtTarget = null;
  const courtEnemy = o => {
    const u = rt.player.u, zone = rt.flags.SZ.byId[rt.flags.kannonFell ? 'kinome_sou' : 'kannon'];
    return !o.noTarget && !o.fleeing && !o.invuln && Math.abs(o.pos.y - u.pos.y) < 3 &&
      zone.test(o.pos.x, o.pos.z) && !rt.army.wallBetween(u.pos, -1, o.pos, false);
  };
  rt.flags.echizenCourtEnemy = courtEnemy;
  rt.flags.echizenCourtPoint = () => {
    const c = courts[rt.flags.kannonFell ? 1 : 0], u = rt.player.u;
    const zone = rt.flags.SZ.byId[c.id];
    if (zone.test(u.pos.x, u.pos.z)) {
      // 中に入った後も「口へ」の札で遠い中心を指さない。
      // 見通せる守兵へ向き、守兵がいなければ中で味方を待つ。
      const enemy = courtTarget = rt.army.nearestEnemy(u, 180, courtEnemy);
      // 柵際で止まると、組の兵が郭外に残り続ける。守兵がいなければ中へ寄る。
      const center = rt.flags.C.kuruwa[c.id].centroid;
      // 守る人数がそろったら本人の場所で待つ。郭の中心まで走らせると
      // 「守れ、あと三秒」の最中にも遠い印へ誘導し、制圧が途切れる。
      const gather = !enemy && zone.friends < zone.need &&
        !rt.army.wallBetween(u.pos, -1, center, false);
      courtPoint.x = enemy ? enemy.pos.x : gather ? center.x : u.pos.x;
      courtPoint.z = enemy ? enemy.pos.z : gather ? center.z : u.pos.z;
      return courtPoint;
    }
    courtTarget = null;
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
      const zone = rt.flags.SZ.byId[rt.flags.kannonFell ? 'kinome_sou' : 'kannon'];
      if (zone.test(rt.player.u.pos.x, rt.player.u.pos.z)) {
        if (courtTarget) return '木戸内の守兵へ';
        if (zone.enemies) return '味方と木戸内を探せ';
        return zone.friends < zone.need ? '木戸の中で味方を集めよ' : '味方と木戸内を守れ';
      }
      return rt.flags.kannonFell ? '口を通って木戸内へ' : '口を通って観音丸へ';
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
    if (!u.isPlayer || !F.step || !F.roadPoint ||
        Math.hypot(want.x - F.roadPoint.x, want.z - F.roadPoint.z) >= .1) return null;
    // 平場の中から遠い折れ目へ投影すると、横の柵へ向かったり入口へ戻る。
    // 確保した郭では先に奥の口の内側へ寄り、そのまま三メートル外へ抜ける。
    const held = F.souFell ? 'kinome_sou' : F.kannonFell ? 'kannon' : null;
    if (held && F.SZ.byId[held].test(u.pos.x, u.pos.z)) {
      const mouth = F.souFell ? EXIT_KINOME : EXIT_KANNON;
      exitPoint.x = mouth[0];
      exitPoint.z = mouth[1] + (Math.abs(u.pos.x - mouth[0]) < 2 && u.pos.z > mouth[1] - 4.2 ? 3 : -3);
      return aroundHall(u, exitPoint);
    }
    return kinome.world.runnerWay(rt.army, u, want,
      F.souFell ? kinomeForwardPaths : F.kannonFell ? kannonForwardPaths : undefined);
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
  for (const name of ['splat', 'water', 'groundCover']) {
    const source = sourceGeo.attributes[name], size = source.itemSize;
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
      for (const mat of part.materials) {
        mat.userData.passVisibility.value = faded ? .06 : 1;
        mat.depthWrite = !faded;
      }
    }
  };
  // 最初は門外の二人を受ける。人数は共通の枠に任せ、郭内の兵をさらに減らさない。
  rt.flags.echizenOpening = [];
  for (const b of rt.flags.defenders) {
    if (b._openingPost || !b.real) continue;
    rt.flags.echizenOpening.push({ group: b.real, seekRange: b.real.seekRange, aggro: b.real.aggro });
  }
  // 深手は出血の共通札一つに任せ、同じ退避の声を重ねない。
  rt.player.treatmentHint = true;
  rt.retreatCallN = 4;
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

echizen.update = function (rt, dt) {
  // 崖や出血で先に alive が落ちた時も、共通の重傷・やり直し・結果へ渡す。
  // 兵を立たせ直さず、既に出ているやり直しの札はそのまま待つ。
  if (!rt.player.u.alive) {
    if (!rt.over && !rt.flags.ending && !rt.retryOpen) rt.playerDown();
    return;
  }
  kinome.update.call(this, rt, dt);
  const F = rt.flags, u = rt.player.u;
  if (rt.over || F.ending || !u.alive) return;
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
      const text = ready ? '「打つ」を長押しして木戸を破れ' : '木戸の前へ。味方と進め';
      let changed = false;
      for (const o of rt.objectives) if (o.id === '_gate' && o.text !== text) { o.text = text; changed = true; }
      const order = rt.orderObjectives?.get('_gate');
      if (order && order.text !== text) { order.text = text; changed = true; }
      if (changed && rt.missionGuide) rt.missionGuide.scan = 0;
    }
    // 奥の二郭でも、守兵・味方の人数・守る時間を同じ任務札で伝える。
    const zoneId = !F.kannonFell ? 'kannon' : !F.souFell ? 'kinome_sou'
      : F.SZ.byId.kinome_fuku.owner !== 'friend' ? 'kinome_fuku' : 'kinome_hon';
    const zone = F.SZ?.byId[zoneId];
    const gate = !F.kannonFell ? F.gateKannon : !F.souFell ? F.gateKinome : null;
    const name = zoneId === 'kannon' ? '観音丸' : zoneId === 'kinome_sou' ? '木戸内'
      : zoneId === 'kinome_fuku' ? '奥の曲輪' : '奥の本陣';
    const place = zoneId === 'kannon' ? `${name}の中` : name;
    if (F.step && zone && (!gate || !gate.struct.alive)) {
      const inside = zone.test(u.pos.x, u.pos.z);
      const text = !inside ? `${place}へ。開いた口を通れ`
        : zone.enemies > 0 ? `${place}の守兵を崩せ（残り${zone.enemies}人）`
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
  // 門外の敵を退けて先手が進んだら、三十秒前でも共通の下知に従って守る。
  // 一度戻した後は、待ち時間の条件だけで再び守兵を止めない。
  if (F.echizenOpening && !F.step && rt.t < 30) for (const b of F.defenders) {
    if (b._openingPost || !b.real) continue;
    b.real.stay = true; b.real.seekRange = 0; b.real.aggro = 0;
  }
  else if (F.echizenOpening) {
    for (const o of F.echizenOpening) {
      o.group.seekRange = o.seekRange; o.group.aggro = o.aggro;
    }
    F.echizenOpening = null;
  }
  if (u.hp <= u.maxHp * .4 && !F.dangerTip) {
    F.dangerTip = true;
    if (!(u.wounds?.bleed > .0001)) rt.bark('深手じゃ。構えたまま、味方の後ろへ退け', true);
  }
  if (!F.echizenGateCleared && !F.gateKannon.struct.alive) {
    F.echizenGateCleared = true;
    rt.objRemove('_gate');
    for (let i = rt.objectives.length - 1; i >= 0; i--) {
      const o = rt.objectives[i];
      if (/打つ/.test(o.text) && /長押し/.test(o.text)) rt.objRemove(o.id);
    }
    for (const [id, o] of rt.orderObjectives || [])
      if (/打つ/.test(o.text) && /長押し/.test(o.text)) rt.objRemove(id);
    if (!F.kannonFell) rt.obj('main', '懸かり太鼓。木戸を通り、味方と守兵を崩せ', 'main', true);
  }
};

// 木戸を抜けた後、打ちかけてくる相手は受けるが、郭外の敵を追って制圧を中断しない。
echizen.botBrain = function (rt, inp, helpers) {
  const F = rt.flags;
  const gate = F.kannonFell ? F.gateKinome : F.gateKannon;
  const zone = !F.souFell && gate && !gate.struct.alive
    ? F.SZ.byId[F.kannonFell ? 'kinome_sou' : 'kannon'] : null;
  const followingRoad = F.kannonFell && !F.souFell && gate?.struct.alive;
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
    const distance = Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z);
    p.yaw = Math.atan2(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z);
    helpers.goTo(p, inp, enemy.pos.x, enemy.pos.z, (p.weapon === 'sword' ? 1.9 : 2.8) * .85, true);
    helpers.patientStrike(p, inp, enemy, distance);
  } else {
    const next = F.echizenCourtPoint();
    helpers.goTo(p, inp, next.x, next.z, 2, true);
  }
};

echizen.onZoneFall = function (rt, id) {
  // 目の前で押さえた郭の次の任務は、使番の到着を待たない。
  // 古い「守れ、あと一秒」と運搬中の札を、その場の下知で取り替える。
  // 遠い別手の知らせや、他の戦の使番は従来のままにする。
  const obj = rt.obj;
  rt.obj = function (key, text, kind, local) {
    return obj.call(this, key, text, kind, key === 'main' || local);
  };
  try { kinome.onZoneFall.call(this, rt, id); } finally { rt.obj = obj; }
  if (id === 'kannon' && rt.flags.kannonFell && !rt.flags.ending && !rt.over)
    rt.obj('main', '本道の印へ。次の木戸へ進め', 'main', true);
  // 道の印と山道全体の残り距離も、制圧後の最初の更新でそろえる。
  rt.flags.statusAt = 0;
};
export { echizen };
