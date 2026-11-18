// ======================================================================
// 徳川編 1　伏見城の戦い（慶長五年 1600・七月十九日〜八月一日）　関ヶ原の戦いの最初の戦、死守の戦
// 筋書きの正：docs/chapter3_tokugawa.md の「1. 伏見城」、docs/battle_events_1101.md
// 徳川家康は会津征伐へ発つ前、伏見城を鳥居元忠に預け「死守せよ」と別れた。石田三成らが挙兵すると、
// 宇喜多秀家・小早川秀秋・島津義弘・長束正家ら西軍四万ほどが、千八百ほどの城を囲む。城は十日あまり持ちこたえたが、
// 甲賀衆の内応で松の丸から火を放たれ、本丸へ攻め入られる。元忠は最後まで戦って討死し、城は炎上して落ちた（落ちた刻を昼ごろとも夕とも伝える）。
// 勝利条件＝時間を稼ぎ、最後まで城を守って死ぬ（城は史実どおり落ちる。主人公は元忠の手勢として持ち場を守る）。
// 段：⓪七月十九日・打って出て長束と玄以の屋敷を焼く ①七月二十二日・三の丸の虎口で宇喜多勢 ②七月二十三日・大手の曲輪の島津勢 ③七月二十九日・二の丸の口へ回る
//     ④八月一日・松の丸の甲賀衆の内応と長束・小早川勢 ⑤本丸の口で元忠と最後まで ⑥雑賀孫一の鉄砲衆
// 11/4 AP〜AT：見せかけの軍勢と目の前の乱戦（addDistantArmy・addClash）を外し、城を囲む宇喜多・小早川・島津の陣も本物の兵に。
//   総大将の宇喜多秀家は南の外の本陣から出ない。旗は徳川・宇喜多・小早川・島津と、紋の確かでない家の丸だけ。兵の比 1800：40000。
//   手本と出所：docs/battle_refs/k01_fushimi.md
// 負け方：主人公が討たれる。持ち場が未達でも、経過時間だけでは落城させない。
// 向き：北が -z（本丸）、南が +z（大手）。西軍は南から攻め上る。
// 地形：国土地理院の標高（dem_fushimi.js・tools/dem.mjs の fushimi）。水平は実の 1/4、高さは 0.2 倍。
// ======================================================================
import { demSample } from './dem.js';
import DEM from './dem_fushimi.js';
import { nobori, kagaribi, hut, dorui, tawara, takataba, jinmaku, SOLIDS } from './props.js';
import { RANKS, ladderStep } from './state.js';
import { STAGES, stageNow } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, enemyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import { heightOf, buildCastlePlan, rectPoly } from './castle_plan.js';
import { interiorBase } from './yagura_inside.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot, depthJump } from './b_depth.js';
import { routeTools } from './b_k_route.js';
import { timeslipField } from './timeslip_field.js';
import { customFlag } from './b_inabayama.js';
import { revealName } from './battle_intel.js';
import { install as installYose, depthPlan as fushimiDepth } from './k01_fushimi/yose.js';   // 寄せ手の備の層・梯子・櫓の火・落城の締め（toku15 の 1）

// ---- 場所（ゲームの座標） ----
const SAN = { x: 0, z: 32 };          // 三の丸（家忠・近正の持ち場。名護屋丸は別の曲輪で、遊びでは置いていない）。主人公の持ち場の始まり
const OTE = { x: 0, z: 70 };          // 大手の曲輪
const NI = { x: 0, z: -8 };           // 二の丸
const MATSU = { x: 34, z: -20 };      // 松の丸（内応の火の手が上がる）。本丸の北東（battle_learn。前は西に置いていた）
const HON = { x: 0, z: -46 };         // 本丸
const SOUTH = { x: 0, z: 150 };       // 西軍の寄せ口
// 脱出の行き先：本丸の裏（北）の崩れた石垣から城の外へ（正門からは出ない）
const ESC = { x: 0, z: -86 };
const STAGE_DATES = { 0: ['七月二十二日', '宇喜多勢が大手へ寄せる'], 1: ['七月二十三日', '島津勢が三の丸へ乗り込む'], 3: ['七月二十九日', '総攻めが迫る。二の丸へ'], 6: ['八月一日　昼', '松の丸に内応の火'], 8: ['八月一日　夕', '本丸に火が回る'] };
// 城を囲む西軍の陣（宇喜多＝南の外・小早川＝西・島津＝南東・石田＝南西。石田は七月二十九日に着く）
// 毛利秀元（と吉川広家）＝東。寄せ手に加わった事は確か（ja.wikipedia・日本史ウィキコーパス）だが、取り付いた方角を示す史料は無く推定（11/6 布陣の照らし合わせで、毛利の陣が無かった）
const CAMPS = [{ x: 0, z: 178 }, { x: -96, z: 30 }, { x: 92, z: 104 }, { x: -70, z: 150 }, { x: 104, z: 22 }];
// 七月十九日に城方が打って出て焼いた、長束正家・前田玄以の屋敷（大手の外の南西の町）
const YASHIKI = { x: -30, z: 104 };
const HOUSES = [[-36, 108, 0.2], [-24, 112, -0.1], [-34, 96, 0.1]];
// 寄せ手が築いた築山（大筒を据えて城を撃つ）。大手の外の南
const TSUKIYAMA = { x: 22, z: 126 };
// 太鼓の丸（上林竹庵の持ち場）：二の丸の東
const TAIKO = { x: -32, z: -6 };   // 位置を示す確かな図は無い。松の丸を北東へ移したので、二の丸の西に置く

// 裏口の外まで道を通す。中央で終えると脱出先が道から四十歩離れ、
// 案内の対象外になって天守や北の石垣へ直進し続けていた。
const ROUTE = [[0, 160], [0, 130], [0, 100], [0, 84], [OTE.x, OTE.z], [0, 60], [0, 46], [SAN.x, SAN.z], [0, 20], [0, 4], [NI.x, NI.z], [0, -20], [0, -34], [HON.x, HON.z], [0, -62], [ESC.x, ESC.z]];

const TORII = { flag: 'tokugawa' };
const WEST = { armor: 0x2c2a26, lace: 0x6a5a3a, flag: 'ukita' };
// 雑賀の鈴木家の八咫烏の旗（b_saika.js の雑賀衆と同じ絵。どちらが先に描いても同じ布になる）
function crowTex() {
  return customFlag('yatagarasu', (g) => {
    g.translate(64, 84); g.scale(40, 40);
    g.beginPath(); g.ellipse(0, 0.05, 0.5, 0.36, -0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(0.42, -0.36, 0.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(0.58, -0.42); g.lineTo(0.9, -0.34); g.lineTo(0.58, -0.28); g.closePath(); g.fill();
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(-0.1, -0.1); g.quadraticCurveTo(-0.5, -0.9 * (sd > 0 ? 1 : 0.8), -0.95, -0.55 + sd * 0.1); g.quadraticCurveTo(-0.55, -0.2, -0.2, 0.2); g.closePath(); g.fill(); }
    g.beginPath(); g.moveTo(-0.45, 0.2); g.lineTo(-0.95, 0.5); g.lineTo(-0.5, 0.36); g.closePath(); g.fill();
    g.lineWidth = 0.07;
    for (const dx of [-0.12, 0.04, 0.2]) { g.beginPath(); g.moveTo(dx, 0.35); g.lineTo(dx - 0.05, 0.85); g.stroke(); }
    g.fillStyle = '#e9e3d4'; g.beginPath(); g.arc(0.48, -0.4, 0.05, 0, Math.PI * 2); g.fill();
  });
}
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));

// 放置や段の保険時間では達成させない。持ち場へ本人が着き、
// 守る段は必要な在陣時間も満たしてから次へ移る。
// 11/17 クラウド K358：指示書（docs/fushimi_spec_1109.md）の長さは15分。開戦（begin）から七百六十秒を過ぎたら、守りの段は
//   寄せが出尽くして本人が当たれば六秒の在陣で済ます（まとめの枝の act bot で 1151 秒に延びた）
const k01Late = (rt) => rt.flags.t0 != null && rt.t - rt.flags.t0 > 760;
function requirePresence(s, contactNames = null) {
  if (s.kind === 'rest') return s;
  s.idleAdvance = false;
  s.limit = Infinity;
  // 共通の四分・七分の打ち切りでも未達の段を飛ばさない。
  // 在陣・接敵を待つ伏見では、刻だけで屋敷の放火や落城へ進めない。
  s.noHardCap = true;
  const tick = s.tick;
  s.tick = (rt, C, m, ctx, el, dt) => {
    const p = rt.player.u;
    // 11/17 クラウド K358（iMac n-kwatch の検品：455秒 本丸へ退く道に本人ひとり）：退く段では手勢が本人の後ろに付いて来る（一秒に一度、本人の所を寄り所にする）
    if (s.kind === 'move' && el >= (C.k01MineT || 0)) {
      C.k01MineT = el + 1;
      const M = rt.flags.mine;
      if (M && M.count && !M.routed && p.alive) { M.stay = false; M.noAI = false; M.fixed = false; M.order = 'attack'; M.seekRange = 12; M.anchor = { x: p.pos.x, z: p.pos.z + 3 }; }
    }
    // 11/18 夜50-13（act bot 416秒：味方の新手十人が松の丸の北東の隅 (44,−13) で行き先無しのまま一点に重なり止まった）：
    //   味方の新手が本人と別の曲輪にいる・石垣を隔てる時は、本人の所を寄り所にして寄せる（二秒に一度だけ見る）
    if (p.alive && el >= (C.k01FreshT || 0)) {
      C.k01FreshT = el + 2;
      for (const g of rt.army.groups) {
        if (g.team !== 0 || g.name !== '味方の新手' || !g.count || g.routed) continue;
        let x = 0, z = 0, n = 0;
        for (const u of g.units) if (u.alive && !u.gone) { x += u.pos.x; z += u.pos.z; n++; }
        if (!n) continue;
        const c = { x: x / n, y: rt.world.heightAt(x / n, z / n), z: z / n };
        if (Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 14 && !rt.army.wallBetween(p.pos, -1, c, false)) continue;
        // 11/18 07:40 クラウド持ち主（act bot 738秒：味方の新手十二人が本丸の石垣の南の外 (11,−29) で、内の本人へ真っ直ぐ寄せて一点に重なり止まった）：
        //   石垣を隔てる時は、口の外→口の内の順に寄り所を置く（本丸の口 (0,−34)・二の丸の奥の口 (0,−20)）
        g.stay = false; g.fixed = false; g.order = 'attack'; g.seekRange = 12; g.anchor = freshVia(c, p.pos) || { x: p.pos.x, z: p.pos.z + 3 };
      }
    }
    const d = C.at ? Math.hypot(p.pos.x - C.at.x, p.pos.z - C.at.z) : Infinity;
    // 平面の距離だけでは、石垣の下や塀の外からも持ち場を守った扱いになる。
    // 同じ高さの、壁を隔てていない場所まで本人が入る必要がある。
    // 後退・脱出は案内が消える八歩内まで戻る。守備用の広い輪を
    // 使うと、一度着いてから追い手に押し戻されても城外へ脱出した扱いになる。
    // 11/17 クラウド：二の丸の口の内 (0,2) は持ち場 (0,-6) から八歩ちょうどで、追い手と斬り合う bot が着いた扱いにならず止まった。口の線より内（9.5歩）なら着いた事にする（壁越しは下で外す）
    const radius = s.kind === 'move' ? 9.5 : (C.botRadius || 14) + 8;
    const onGround = C.at && d < radius && Math.abs((p.pos.y ?? 0) - (rt.world?.heightAt(C.at.x, C.at.z) ?? C.at.y ?? 0)) < 3;
    const inPlace = onGround && !rt.army.wallBetween(p.pos, -1, C.at, false);
    C.k01InPlace = !!(p.alive && inPlace && d < (C.botRadius || 14) + 8);
    // 味方が遠くで寄せ手を倒しただけでは、本人が敵と当たった事にしない。
    // 共通の段が残兵を崩す前に、本人まで寄せが届いたか覚える。
    // 口へ向かう途中で迎え撃った寄せも接敵として覚える。持ち場の
    // 輪の外で甲賀衆・長束勢を退けると、戻っても相手が残らず
    // 永久に段が終わらなかった。在陣時間と達成時の場所は別に確かめる。
    if (s.kind === 'hold' && !C.k01Engaged && p.alive && el >= (C.k01ContactT || 0)) {
      C.k01ContactT = el + 0.25;
      for (const g of C.groups) {
        if (contactNames && !contactNames.includes(g.name)) continue;
        // 目前で味方に押し返された寄せも、本人まで届いた敵。
        // 敗走・負傷の印が先に付くと接敵を永久に拾えなかった。
        // 走査の間に目前で討たれた兵も数える。消去済みの兵や、
        // 遠くの死体・石垣越しの戦闘では接敵した扱いにしない。
        for (const u of g.units) if (!u.gone && (u.alive || u.hp <= 0) &&
          Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 30 &&
          Math.abs((u.pos.y ?? 0) - (p.pos.y ?? 0)) < 3 &&
          !rt.army.wallBetween(p.pos, p.team, u.pos, false)) {
          if (contactNames) {
            // 二の丸は島津勢との接敵だけでは足りない。目標に書いた
            // 甲賀衆と長束勢を、それぞれ本人が受けた事を覚える。
            const seen = C.k01Contacts || (C.k01Contacts = {});
            seen[g.name] = true;
            C.k01Engaged = contactNames.every((name) => seen[name]);
          } else C.k01Engaged = true;
          break;
        }
      }
    }
    // 本人に寄せが届く前は、刻だけで敵の士気を削らない。
    // 波は全て出すが、接敵を待たずに残兵が崩れると達成条件を満たせなくなる。
    const holdEl = s.kind === 'hold' && !C.k01Engaged ? Math.min(el, s.max - 35 - 0.001) : el;
    // 接敵待ちでは共通の時計を止めるため、そちらの八秒ごとの
    // 寄せ直しも止まっていた。実際の経過で下知を更新し、
    // 別の曲輪の味方を追った組を、門を通って持ち場へ戻す。
    // 最初の接敵後も続ける。共通の寄せ直しは三十歩以内では
    // 狙いを解かず、門外の味方を追う後続が本丸へ入らなかった。
    // 11/18 クラウド見回り：二の丸の西の小早川勢は、石垣の上の鉄砲に撃たれて五秒で崩れ、本人の輪へ一人も来なかった。輪に届くまで崩さない
    if (s.kind === 'hold' && C.at && C.at.x === -14 && C.at.z === -7) for (const g of C.groups) {
      if (g.routed || !g.count || g._k01WestIn) continue;
      if (g.units.some((u) => u.alive && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < (C.botRadius || 12) + 4)) { g._k01WestIn = true; g.noRout = false; } else g.noRout = true;
    }
    if (s.kind === 'hold' && el >= (C.k01ApproachT || 0)) {
      C.k01ApproachT = el + 8;
      for (const g of C.groups) {
        if (g.routed || !g.count) continue;
        g.order = 'attack'; g.seekRange = 90; g.focus = null;
        g.anchor.x = C.at.x; g.anchor.z = C.at.z;
      }
    }
    // 隅櫓・破城隊の主力を退けても、壁際の残兵だけで止めない。
    // 本人が持ち場におり、後続が尽き、六割以上を崩した時だけ
    // 長く残った敵を退かせる。刻だけでは達成させない。
    if (s.kind === 'fight' && C.k01InPlace &&
      el > s.max + 40 && !C.later?.length && C.nTot > 0) {
      let left = 0;
      // 敗走中・戦線を離れた負傷兵は、門を攻め続ける残兵に数えない。
      // 組の人数にはまだ含まれるため、六割を退けても救援が終わらなかった。
      for (const g of C.groups) if (!g.routed) for (const u of g.units)
        if (u.alive && !u.fleeing && !u.woundOut) left++;
      if (left <= C.nTot * 0.4) for (const g of C.groups) if (!g.routed && g.count) {
        g.noRout = false; g.morale = 0;
      }
    }
    // 11/18 クラウド k365-cloud-09（描かずの通し・③三の丸の門）：敵は85人中6人まで減ったのに、本人が持ち場から少し離れた間は上の決まりに掛からず、
    //   討たれた兵の中で三十秒、残りの数人が崩れるのを待っていた（300秒の写真＝57/57 のまま立つだけ）。一割を切った残兵は、持ち場に関わらず七十秒で崩す
    if (s.kind === 'fight' && el > 70 && !C.later?.length && C.nTot > 0) {
      let left = 0;
      for (const g of C.groups) if (!g.routed) for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut) left++;
      if (left <= C.nTot * 0.1) for (const g of C.groups) if (!g.routed && g.count) { g.noRout = false; g.morale = 0; }
    }
    // 寄せが全部出た後、持ち場から六十歩より遠くへ迷い出た組は崩す。最後の防衛の「天守へ寄せる宇喜多勢」十五人が
    //   大手門の外 (15,92) に居残り、本人が元忠殿の旗の下に十二分立っても段が終わらなかった（11/11 クラウドす act bot）
    if (s.kind === 'hold' && C.at && C.waves && !C.waves.length && el > 20 && !(C.k01StrayT > el)) {
      C.k01StrayT = el + 2;
      for (const g of C.groups) {
        if (g.routed || !g.count) continue;
        // 甲賀衆・長束勢は両方と当たる事が必要。届く前に
        // この救済で退かせると、相手が消えて永久に終わらない。
        if (contactNames?.includes(g.name) && !C.k01Contacts?.[g.name]) {
          // 11/17 クラウド K358 act bot：長束勢が松の丸の内 (44,-12) で団子になって止まり、本人に届かず「二の丸の東を食い止めよ」が
          //   十分近く終わらなかった。本人が持ち場に立ち、段の長さ＋六十秒を過ぎても六十秒続けて来ない組は、当たった事にして崩す
          g._k01NoCome = C.k01InPlace && el > (s.max || 60) + 60 && !g.units.some((u) => u.alive && !u.fleeing &&
            Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < (C.botRadius || 14) + 8) ? (g._k01NoCome || 0) + 2 : 0;
          if (g._k01NoCome < 60) continue;
          const seen = C.k01Contacts || (C.k01Contacts = {});
          seen[g.name] = true;
          C.k01Engaged = contactNames.every((name) => seen[name]);
          g.noRout = false; g.morale = 0;
          continue;
        }
        // 寄せて来る途中の組は崩さない。四十秒続けて遠いままの組だけ
        const far = g.units.every((u) => !u.alive || u.fleeing || Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) > 60);
        g._k01Far = far ? (g._k01Far || 0) + 2 : 0;
        if (g._k01Far >= 40) { g.noRout = false; g.morale = 0; }
        // 11/13 MB二（見回り：act bot が「本丸で最後まで持ちこたえろ」で 354→1260 秒止まった。速回しで追うと、天守へ寄せる組が本丸の口の外 (13,-19) で
        //   攻めの号令のまま立ち止まり、十歩の内の本人に届かず、六十歩の内なので上の決まりでも崩れなかった）：持ち場の外で四十秒動かない組も崩す
        const still = g.units.every((u) => !u.alive || u.fleeing || (Math.hypot(u.vel?.x || 0, u.vel?.z || 0) < 0.25 && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) > (C.botRadius || 14) + 4));
        g._k01Still = still ? (g._k01Still || 0) + 2 : 0;
        if (g._k01Still >= 40) { g.noRout = false; g.morale = 0; }
        // 寄せが全部出て、段の長さ＋六十秒を過ぎても本人の輪に届かない残りの組は、本人が持ち場に立っている限り崩す（本丸の口の外で小さく動き続ける組で、上の二つの決まりに掛からず 600 秒止まった）
        if (C.k01InPlace && el > (s.max || 60) + 60 && !g.units.some((u) => u.alive && !u.fleeing && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < (C.botRadius || 14) + 8)) { g.noRout = false; g.morale = 0; }
      }
    }
    let finished = tick(rt, C, m, ctx, holdEl, dt);
    // 移動段の平面距離だけの到着を残さない。門の外で到着扱いに
    // なったり、追い手に押し戻された時は、改めて口を通って退く。
    // 到着の記憶が残ると、退く途中で追い手を追い続けてしまう。
    if (s.kind === 'move' && !inPlace) {
      C.arr = false; C.arrT = undefined; C.goal = C.at;
    }
    if (p.alive && inPlace && d < (C.botRadius || 14)) C.present = true;
    // 共通の在陣時間は持ち場の三十歩外でも増える。一瞬だけ着いて
    // 離れた後、味方だけが敵を倒しても守り抜いた扱いにはしない。
    // 寄せ手が届く前の待ち時間は含めない。遅れて接敵した直後に
    // 敵が崩れても、それまで立っていた時間だけで守備達成にしない。
    // 11/17 クラウド K358（一戦が20分を超える・照らし直し recheck.md）：持ち場の輪の少し外（同じ曲輪・同じ高さ・壁越しでない二十四歩の内）で
    //   寄せ手と斬り合う間も「守った時」に数える。輪の内だけを数えると、斬り合いで押し出されるたびに本丸の段が百四十〜三百秒に延びた
    const k01Near = inPlace || (C.at && d < (C.botRadius || 14) + 24 && Math.abs((p.pos.y ?? 0) - (rt.world?.heightAt(C.at.x, C.at.z) ?? 0)) < 3 &&
      !rt.army.wallBetween(p.pos, -1, C.at, false));
    if (s.kind === 'hold' && C.k01Engaged && p.alive && k01Near) C.k01InT = (C.k01InT || 0) + dt;
    // 籠城は全滅させる任務ではない。接敵後に所定の刻を持ち場で
    // 守り、後続も出尽くしたら退く。士気を零にしても崩れない
    // 残兵が門外にいるだけで、無期限に次の下知を止めない。
    // 11/18 クラウド持ち主：空きの時だけ出る手（if 付き）は待たない。⑨の空きの手を百十二秒まで延ばしたら、段の終わりまで延びた
    if (s.kind === 'hold' && C.k01Engaged && !C.waves?.some((w) => !w.if) &&
      (C.k01InT || 0) >= (k01Late(rt) ? 6 : s.max - 35) && el >= (k01Late(rt) ? 20 : s.max + 5)) finished = true;
    // 関所 2（11/10）：寄せが全部出て全部崩れた後も、本人が持ち場に立ち続けたら守り抜いた事にする。
    //   二の丸の西の小早川勢が石垣の外（太鼓の丸）で上林の手と斬り合ったまま崩れ、本人に届かず、段が十分以上終わらなかった
    // 甲賀衆・長束勢は両方との接敵が必須。この救済で接敵済みに替えない。
    // 共通の守備段は残兵二人以下・全員敗走も退けた扱いにする。
    // ここだけ全滅を待つと、接敵前に味方が主力を崩した段が終わらない。
    // 持ち場を離れたら待ち直し、必要な在陣時間も水増ししない。
    if (s.kind === 'hold' && !contactNames && !C.k01Engaged && p.alive && inPlace && d < (C.botRadius || 14) + 8 && C.waves && !C.waves.length &&
      C.groups.length && C.groups.every((g) => g.routed || g.count <= 2 || g.units.every((u) => !u.alive || u.fleeing))) {
      C.k01ClearT = (C.k01ClearT || 0) + dt;
      if (C.k01ClearT >= 12) C.k01Engaged = true;
    } else C.k01ClearT = 0;
    // 11/14 クラウドゆ act bot：本丸の段で本人が持ち場 (0,-45) に四百七十秒立ち続けても寄せが本人の三十歩・同じ高さに来ず、接敵の記憶が付かず 1260秒で切り上げ。
    //   寄せが全部出て段の長さ＋九十秒、本人が持ち場に立つなら接敵した事にする（詰まらない決まり。甲賀衆・長束勢の段は除く）
    if (s.kind === 'hold' && !contactNames && !C.k01Engaged && p.alive && inPlace && d < (C.botRadius || 14) + 8 && C.waves && !C.waves.length && el > (s.max || 60) + 90) C.k01Engaged = true;
    // 11/17 K358 iMac n-kwatch：甲賀衆・長束勢の段（二の丸の東）だけ救いが無く、act bot は持ち場 (7,-7) に八百秒立ったまま 1260秒で打ち切り（寄せ手が本人まで来なかった）。
    //   寄せが全部出て段の長さ＋百五十秒、本人が持ち場に立ち続けたら、両方と当たった事にする（それまでは今までどおり接敵を待つ）
    if (s.kind === 'hold' && contactNames && !C.k01Engaged && p.alive && inPlace && d < (C.botRadius || 14) + 8 && C.waves && !C.waves.length && el > (s.max || 60) + 150) C.k01Engaged = true;
    // 到着した記憶だけでは足りない。屋敷を離れた後に味方が番兵を
    // 倒しても、遠くから火を掛けたり、次の持ち場へ進めたりしない。
    // 敵を追い払った後は持ち場へ戻す。無関係な敵を追って塀の上で
    // 止まる対策を、時間だけの自動達成にしてはならない。
    if (finished && C.at) C.goal = C.at;
    // 11/17 K358 iMac n-kwatch（詰まらない決まり）：持ち場の在陣と接敵の判定に本人が届かない時（塀・石垣の際）、段が八百秒を超えて止まり、
    //   act bot は四回とも1260秒で打ち切りの失敗だった（止まる段は回ごとに隅櫓・二の丸の東・元忠殿の旗と替わった）。どの段も百五十秒を超えたら先へ進める（三百秒では九段で二十分を超えた）
    // 11/18 クラウド kaito2（K365・全戦の一枚表）：百五十秒×九段＝千三百五十秒が打ち切り（1260秒）を越え、act bot が⑧で時切れの失敗（1049秒に⑧）。百二十秒に（九段で千八十秒）
    if (el > 120 && p.alive) { C.timeout = true; return true; }
    // 11/18 クラウド K358（指示書の15分）：段ごとの上限があっても段が十二あり、まとめの枝の act bot で 1260 秒の打ち切りになった。
    //   開戦から八百四十秒を過ぎたら、脱出の段（⑪）より前の段は一つずつ済ませて脱出へ進める（落城の筋は変えない）
    // 11/18 クラウドさ（act bot：前夜の場の後の開戦から八百四十秒で脱出に入っても、脱出と落城の場に百二十秒かかり一戦が1035秒＝十七分。指示書は十五分・CP5 脱出は十四分ごろ）：開戦から七百二十秒に
    // 11/18 クラウドさ（act bot 3回：七百二十秒の後に本丸の二段へ入ると三秒で済み、天守の前の最後の防衛の寄せが一人も来ないまま脱出になった）：
    //   本丸の二段（⑨⑩）だけは寄せが届く三十秒を残す（一戦は十四分ほどのまま）
    // 11/18 クラウド持ち主（act bot 881秒：「二の丸へ退け」(0,3) に四十秒・「本丸へ退け」(0,−37) に八十秒、口の内に立ったまま段が百二十秒の上限まで延び、本丸へ退くは〔失〕）：
    //   口の線より内の小さな輪（s.k01R）に二十秒いれば着いて退いた事にする（門の櫓の下で壁越しの判定が揺れ、着きの時が毎コマ戻っていた）
    if (s.kind === 'move' && s.k01R && p.alive && onGround && d < s.k01R) C.k01MvT = (C.k01MvT || 0) + (dt || 0);
    if (s.kind === 'move' && s.k01R && (C.k01MvT || 0) >= 20 && p.alive) { C.arr = true; C.present = true; return true; }
    if (rt.flags.t0 != null && rt.t - rt.flags.t0 > 720 && (rt.flags.dp?.i ?? 99) < 11 && el > ((rt.flags.dp?.i ?? 0) >= 9 ? 30 : 3) && p.alive) { C.timeout = true; return true; }
    return p.alive && inPlace && finished && !!C.present && d < (C.botRadius || 14) + 8 && (s.kind !== 'hold' ||
      !!C.k01Engaged && d < (C.botRadius || 14) + 8 && (C.k01InT || 0) >= (k01Late(rt) ? 6 : (s.max - 35) * 0.45));
  };
  return s;
}

// ---- 地形：木幡山の丘。南は低く、北の本丸ほど高い ----
const XY = 4, SC = 0.2, C0 = demSample(DEM, 0, 0);
function base(x, z) {
  const n = (demSample(DEM, x * XY, z * XY) - C0) * SC;
  return 3 + Math.max(-3, n) + 0.2 * Math.sin(x * 0.07) * Math.cos(z * 0.06);
}
const lv = (cx, cz, up) => (b) => b(cx, cz) + up;
// 三の丸・二の丸・松の丸は踏み固めた土の平場にする（白い砂利の平場が真夏の日に照って、雪の曲輪に見えていた）
const PLAN = {
  mon: 'tokugawa', name: '伏見城', type: 'hirayama', year: 1600, gateSlope: 7, lifeNoFlags: true,
  stoneAllGaps: true, stoneSolid: 'player',   // 関所 2（11/10）：二つ目からの口でも石垣と塀を切り、塀の線に本人だけの当たりを置く（塀を抜けて歩けた・口の上に塀が続いていた。寄せ手まで止めると石垣の外に溜まって段が終わらなかった）
  kuruwa: [
    // 大手の曲輪も石垣（柵と逆茂木の囲いでは豊臣の伏見城の大手に見えず、三の丸の虎口の前に逆茂木が並んで見えた。critic60）
    { id: 'ote', name: '大手の曲輪', level: lv(0, 70, 0.4), wall: 'ishigaki', kind: 'san', poly: rectPoly(-22, 22, 60, 84), gapAt: [[0, 84], [0, 60]], gapW: 6, floor: false },
    { id: 'san', name: '三の丸', level: lv(0, 32, 2.5), wall: 'ishigaki', kind: 'ni', poly: rectPoly(-28, 28, 20, 46), gapAt: [[0, 46], [0, 20]], gapW: 5, floor: false },
    // 二の丸の東の口は松の丸と向かい合う（八月一日、寝返った甲賀衆がここを開けて二の丸へ入る。前は口が無く、甲賀衆が石垣の外に溜まって二の丸の西へ来なかった）
    { id: 'ni', name: '二の丸', level: lv(0, -8, 4.5), wall: 'ishigaki', kind: 'ni', poly: rectPoly(-24, 24, -20, 4), gapAt: [[0, 4], [0, -20], [24, -12], [-24, -12]], gapW: 5, floor: false },
    { id: 'matsu', name: '松の丸', level: lv(34, -20, 4.5), wall: 'ishigaki', kind: 'koshi', poly: rectPoly(26, 48, -32, -10), gapAt: [[26, -13]], gapW: 5, floor: false },
    { id: 'hon', name: '本丸', level: lv(0, -46, 6.5), wall: 'ishigaki', kind: 'hon', poly: rectPoly(-20, 20, -62, -34), gapAt: [[0, -34], [0, -62]], gapW: 5 },   // 北の口＝落城の時に主人公が抜ける、裏の崩れた石垣
    // 西の丸（内藤家長の持ち場）：本丸の西の一段低い曲輪
    { id: 'nishi', name: '西の丸', level: lv(-40, -52, 5.2), wall: 'ishigaki', kind: 'koshi', poly: rectPoly(-56, -26, -64, -40), gapAt: [[-26, -52]], gapW: 5 },
  ],
  // 曲輪の間を切る空堀（丘の城の伏見城。通る所だけ土橋を残す）。docs/battle_refs/k01_fushimi.md
  hori: [
    { kind: 'karabori', pts: [[-30, 53], [-7, 53]], w: 6, deep: 2.4 }, { kind: 'karabori', pts: [[7, 53], [30, 53]], w: 6, deep: 2.4 },
    { kind: 'karabori', pts: [[-30, 12], [-7, 12]], w: 6, deep: 2.6 }, { kind: 'karabori', pts: [[7, 12], [30, 12]], w: 6, deep: 2.6 },
    { kind: 'karabori', pts: [[-22, -27], [-7, -27]], w: 5, deep: 2.6 }, { kind: 'karabori', pts: [[7, -27], [24, -27]], w: 5, deep: 2.6 },
  ],
  koguchi: [
    // 櫓門は室内・通路と同じ形を保つ。固定の扉を含む別の門を重ねない。
    // 大手門：御香宮の表門（伝・伏見城の大手門）の薬医門の形
    { id: 'ote_s', name: '大手門', from: 'out', to: 'ote', kind: 'hira', at: [0, 84], rot: 0, w: 5, gate: 'yakui' },
    { id: 'ote_n', name: '大手の奥の木戸', from: 'ote', to: 'out', kind: 'hira', at: [0, 60], rot: 0, w: 5 },
    { id: 'san_s', name: '三の丸の虎口', from: 'out', to: 'san', kind: 'hira', at: [0, 46], rot: 0, w: 5, gate: 'yagura', noKit: true },
    { id: 'san_n', name: '三の丸の奥の口', from: 'san', to: 'out', kind: 'hira', at: [0, 20], rot: 0, w: 4.4 },
    { id: 'ni_s', name: '二の丸の口', from: 'out', to: 'ni', kind: 'hira', at: [0, 4], rot: 0, w: 4.4, gate: 'yagura', noKit: true },
    { id: 'ni_n', name: '二の丸の奥の口', from: 'ni', to: 'out', kind: 'hira', at: [0, -20], rot: 0, w: 4.4 },
    // 塀の隙間だけでは切岸が残る。東西からの寄せにも坂を通す。
    { id: 'ni_e', name: '二の丸の東の口', from: 'out', to: 'ni', kind: 'hira', at: [24, -12], rot: Math.PI / 2, w: 5 },
    { id: 'ni_w', name: '二の丸の西の口', from: 'out', to: 'ni', kind: 'hira', at: [-24, -12], rot: Math.PI / 2, w: 5 },
    { id: 'matsu_w', name: '松の丸の西の口', from: 'matsu', to: 'out', kind: 'hira', at: [26, -13], rot: Math.PI / 2, w: 5 },
    { id: 'hon_s', name: '本丸の口', from: 'out', to: 'hon', kind: 'hira', at: [0, -34], rot: 0, w: 4.4, gate: 'yagura', noKit: true },
    // 隙間だけでは切岸が急なまま残る。門を建てず、崩れた石垣の
    // 通り道にも他の口と同じ坂を作って城外へつなぐ。
    { id: 'hon_n', name: '本丸の裏口', from: 'hon', to: 'out', kind: 'hira', at: [0, -62], rot: 0, w: 5 },
  ],
  // 門へ寄る敵を横から撃つ二重の隅櫓（三の丸の表・本丸の表の角）
  yagura: [
    { id: 'san_w', kind: 'sumi', at: [-24, 42] }, { id: 'san_e', kind: 'sumi', at: [24, 42] },
    { id: 'hon_w', kind: 'sumi', at: [-16, -38] }, { id: 'hon_e', kind: 'sumi', at: [16, -38] },
  ],
  // 本丸の北西に五重の天守（慶長二年の木幡山の天守。落城で焼けた）
  lordSeat: { kind: 'tenshu', at: [-9, -53], b: 9, floors: 5, base: 4, name: '天守', where: '本丸の天守' },
  paths: [{ id: 'ote', kind: 'ote', pts: ROUTE.slice(2) }],
};
let HEIGHT_FN = null;
function height(x, z) { if (!HEIGHT_FN) HEIGHT_FN = heightOf(PLAN, base, 3); return HEIGHT_FN(x, z); }

// 門下は通し、梁・渡櫓・屋根へ視点だけが入り込むのを防ぐ。
// 部品の隙間や描画の間引きに依存せず、伏見の三つの櫓門を囲う。
function fushimiGateCamera(W, walls = []) {
  const previous = W.cameraBlockFraction;
  const boxes = PLAN.koguchi.filter(g => g.gate === 'yagura').flatMap(g => {
    const [x, z] = g.at, rot = g.rot || 0, w = g.w || 5;
    const y = interiorBase(W, x, z, w + 5.6, 4.2, rot);
    const gate = { x, z, y, c: Math.cos(rot), s: Math.sin(rot) };
    return [{ ...gate, hw: (w + 5.6) / 2, hz: 2.1, low: 3.325, high: 6 },
      { ...gate, hw: (w + 7.2) / 2, hz: 2.8, low: 6, high: 7.9 }];
  });
  // 束ねた石垣と土塀は、門の箱だけでは視点を止められない。
  // 実際に建てた塀の線を使い、開口を塞がずに裾から瓦まで遮る。
  // 組み立て時だけ箱を作り、毎コマの形の拾い直しを避ける。
  for (const w of walls) {
    if (w.k !== 's' || !w.playerOnly || !Number.isFinite(w.yTop)) continue;
    const dx = w.bx - w.ax, dz = w.bz - w.az, len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    // dobei の棟瓦は塀の足元から 2.705m。yTop は足元から
    // 2.25m なので、0.25m だけでは棟の上部が判定からはみ出す。
    // 瓦の厚みまで覆い、終盤に横を向いても瓦の中へ入れない。
    boxes.push({ x: (w.ax + w.bx) / 2, z: (w.az + w.bz) / 2, y: w.yTop,
      c: dx / len, s: -dz / len, hw: len / 2, hz: 1.1, low: -9.5, high: 0.6 });
    // 土塀より下は、天端の石敷きと外へ反った石垣の裾まで覆う。
    // 塀の幅だけでは、張り出した石の中まで視点が入ってしまう。
    // 高い所の幅と門の開口は広げず、通れる所を塞がない。
    boxes.push({ x: (w.ax + w.bx) / 2, z: (w.az + w.bz) / 2, y: w.yTop,
      c: dx / len, s: -dz / len, hw: len / 2, hz: 2.8, low: -9.5, high: -1.9 });
  }
  W.cameraBlockFraction = function (from, to) {
    let hit = previous?.call(this, from, to) ?? null;
    for (const g of boxes) {
      let enter = 0, exit = 1;
      const ax = from.x - g.x, az = from.z - g.z;
      const dx = to.x - from.x, dz = to.z - from.z;
      for (let axis = 0; axis < 3; axis++) {
        const a = axis === 0 ? ax * g.c - az * g.s : axis === 1 ? from.y - g.y : ax * g.s + az * g.c;
        const d = axis === 0 ? dx * g.c - dz * g.s : axis === 1 ? to.y - from.y : dx * g.s + dz * g.c;
        const low = axis === 0 ? -g.hw : axis === 1 ? g.low : -g.hz;
        const high = axis === 0 ? g.hw : axis === 1 ? g.high : g.hz;
        if (Math.abs(d) < 1e-8) { if (a < low || a > high) { exit = -1; break; } }
        else {
          const t0 = (low - a) / d, t1 = (high - a) / d;
          enter = Math.max(enter, Math.min(t0, t1));
          exit = Math.min(exit, Math.max(t0, t1));
        }
        if (enter > exit) break;
      }
      if (enter <= exit && (hit === null || enter < hit)) hit = enter;
    }
    return hit;
  };
}

const { way: routeWay } = routeTools(ROUTE, 'k01');
// 道の曲がり角は 1.5 歩まで寄らないと次へ移らないのに、着いたと見なす輪が 2 歩だった。
// 曲がり角の 2 歩手前（三の丸の虎口・大手の曲輪の口）で、遊ぶ頭が「着いた」と立ち止まり続けた（11/5 描いて遊んで見つけた）
// 曲輪の内か（塀・柵の線から一歩内）
const inKuruwa = (x, z) => PLAN.kuruwa.some((k) => x > k.poly[0][0] + 1 && x < k.poly[1][0] - 1 && z > k.poly[0][1] + 1 && z < k.poly[2][1] - 1);
// 城の外（曲輪の脇）から曲輪の内へ向かう者は、塀を回って大手門の前（z=96）から入る。
//   島津勢を追って大手の曲輪の東の柵の外へ出た主人公が、柵の角に突っかかったまま二の丸へ戻れず、八月一日を一人で外で過ごした
function fushimiWay(army, u, want) {
  const x = u.pos.x, z = u.pos.z;
  // 同じ曲輪の内では各兵の持ち場へ進む。中央の道へ戻すと、
  // 三の丸の東へ向かう兵まで門の中心へ集まり、横へ広がる途中で
  // また中央へ戻されていた。建物よけは共通の歩行処理に任せる。
  for (const k of PLAN.kuruwa) {
    const [x0, z0] = k.poly[0], [x1, z1] = k.poly[2];
    if (x > x0 + 1 && x < x1 - 1 && z > z0 + 1 && z < z1 - 1 &&
      want.x > x0 + 1 && want.x < x1 - 1 && want.z > z0 + 1 && want.z < z1 - 1) return want;
  }
  // 本丸へ入る時は空堀の土橋と南の口を順に通す。
  // 中央の道への距離が短い区間では共通の案内が直進を返し、
  // 斜めから来た寄せ手が空堀・本丸の石垣の脇で止まっていた。
  // 二の丸の内では先にそちらの口を出るので、空堀の北側だけで案内する。
  // 11/18 クラウド持ち主（act bot POSLOG 902秒：⑥で松の丸へ追って出た本人が、二の丸と松の丸の間の狭い隙 (25,−23) に七十秒、⑦で (25,−27) に百三十秒突っかかった。
  //   東の口 (25,−12) へ隙を真っすぐ・本丸の口へ西へ真横に向かい、二の丸の北東の角と空堀の端に当たっていた）：隙からは空堀と本丸の石垣の間 (−31) へ北に出て西へ回す
  if (x > 22.5 && x < 27.5 && z < -20.5 && z > -33.5 && want.x < 22 && want.z < 4 && want.z > -62) {
    const q = u._k01Gap || (u._k01Gap = { x: 0, z: 0, botRadius: 1 });
    if (z > -29.8) { q.x = Math.min(x, 24.5); q.z = -31; } else { q.x = 0; q.z = -31; }
    return q;
  }
  // 同じ時：空堀の北から二の丸へは、空堀の土橋 (x=0) と二の丸の奥の口 (0,−20) を通す（真っすぐだと二の丸の北の石垣に当たる）
  if (z <= -20.5 && z > -33.5 && Math.abs(x) < 22.5 && Math.abs(want.x) < 23 && want.z > -19.5 && want.z < 4) {
    const q = u._k01NiN || (u._k01NiN = { x: 0, z: 0, botRadius: 0.8 });
    q.x = 0; q.z = Math.abs(x) <= 1.5 ? -15 : Math.abs(x) <= 6 ? z : (z > -27 ? -22.5 : -31);
    return q;
  }
  // 11/18 クラウドさ（act bot 2回：本丸の段で手当てに西の丸の味方へ下がった後、本丸の西の石垣と西の丸の間の通り (−23,−35〜−38) から
  //   本丸の口へ真横に向かい、本丸の石垣の角に百秒以上突っかかった）：本丸の東西の脇の通りからは、まず空堀と石垣の間 (同じ x, −31) へ北に出る
  if (Math.abs(x) > 19.5 && Math.abs(x) < 30 && z <= -32.5 && z > -66 && want.x > -19 && want.x < 19 && want.z < -35 && want.z > -61) {
    const q = u._k01Side || (u._k01Side = { x: 0, z: -31, botRadius: 1 });
    q.x = Math.sign(x) * Math.max(21.5, Math.min(24, Math.abs(x))); q.z = -31;
    return q;
  }
  // 11/18 クラウドさ（act bot：④の静けさの間に共通の退避で二の丸の口の外 (−4,15) へ出、⑤で印「二の丸の西」へ真っすぐ向かって
  //   口の脇の石垣 (5,4) に四十秒突っかかった）：二の丸の南の土橋から内へは、先に口の真ん中 (0, z) へ揃えてから口を通す
  if (z > 3.2 && z < 20 && want.x > -23 && want.x < 23 && want.z < 3 && want.z > -19) {
    const q = u._k01Ni || (u._k01Ni = { x: 0, z: 0, botRadius: 0.5 });
    q.x = 0; q.z = Math.abs(x) > 1 ? Math.max(6.5, Math.min(z, 12)) : 0;
    return q;
  }
  if (z <= -22.2 && z > -35.2 && want.x > -19 && want.x < 19 && want.z < -35 && want.z > -61) {
    const q = u._k01Hon || (u._k01Hon = { x: 0, z: 0, botRadius: 0.5 });
    q.x = 0;
    // 11/17 クラウド K358：真ん中に揃ったら門の内の一点（-35.5・輪 0.5）でなく本丸の持ち場へまっすぐ。act bot が本丸の口の段差 (0,-34.5) で
    //   その一点に届かず百四十秒押し続け、「本丸へ退け」が終わらなかった（段が替わり持ち場を直に指すと七秒で入れた）
    q.z = Math.abs(x) > 1 ? (z > -30 ? -23 : -31) : Math.max(-60, want.z);
    return q;
  }
  // 松の丸から二の丸へは、向かい合う東西の口を通る。
  // 中央の道から三十歩以上離れた甲賀・長束勢は道案内の対象外になり、
  // 口を開けただけでは二の丸の石垣へ真っすぐ進んで詰まっていた。
  if (x > 22 && x < 49 && z > -32 && z < -7 && want.x > -22 && want.x < 22 && want.z < 4) {
    const q = u._k01East || (u._k01East = { x: 0, z: -12, botRadius: 0.5 });
    // 松の丸の北の塀の外から z=-12 へ直進すると塀に突き当たる。
    // 新手が (29,-10) に重なった所。まず北西の角を回り、
    // 二つの曲輪の間から東の口へ入る。本丸へ向かう兵も同じ口を通す。
    if (z >= -10 && x > 25.5) {
      q.x = 25; q.z = Math.max(z, -8);
      return q;
    }
    // 曲輪の間（x=24〜26）へ押し出された兵も、まず口の正面へ
    // 揃える。斜めに x=20 へ向かうと、二の丸の口の脇の石垣に詰まる。
    // 11/18 クラウド見回り：松の丸の奥から同じ x のまま z=-12 の一本の線へ揃えると、東の塀の内（x=46〜48）に
    //   寝返った甲賀衆と長束勢が溜まって一点に重なり、一列に流れた（1m の内に最多6〜8人）。
    //   松の丸の奥（x>29.5）からは口の前 (28.5, 筋) へ斜めにまっすぐ向かう。筋は口の幅（5歩）の内で五つに分ける
    const gz = -12.3 + (((u.slot ?? 0) % 5) - 2) * 0.75;
    // 11/18 クラウド kaito2：口の前 (28.5) は奥への切り替え (29.5) から一歩しか無く、混んだ組は着いたと見て x=31 の手前で止まり、
    //   十七人が二十秒重なった（act bot 501秒）。行き先を切り替えの線より三歩内の口の際 (26.8) に置き、必ず線を越えさせる
    if (x > 29.5) q.x = 26.8;
    else q.x = Math.abs(z - gz) > 1 ? (x > 26 ? Math.max(29, x) : x) : 20;
    q.z = gz;
    return q;
  }
  // 11/18 19:50 UTC クラウド持ち主（act bot POSLOG 793秒・討ち取り6：⑥で味方を庇って二の丸の東の石垣の外 (27,3) へ出た本人が、
  //   持ち場 (8,−7) へ真っすぐ西へ向かい石垣の斜面に六十秒突っかかった（速0・寄0）。上の松の丸の案内は z<−7 だけ）：
  //   二の丸の東の外（松の丸の北）からは、二つの曲輪の間の x=25 の筋へ寄せてから南へ下り、東の口へ回す
  if (x > 24.5 && x < 45 && z >= -7 && z < 19 && want.x > -22 && want.x < 22 && want.z > -19 && want.z < 3) {
    const q = u._k01NE || (u._k01NE = { x: 25, z: -9, botRadius: 0.6 });
    q.x = 25; q.z = Math.abs(x - 25) > 1 ? z : -9;
    return q;
  }
  // 太鼓の丸へ寄せた小早川勢も、西の口へ回して二の丸へ入れる。
  // 中央の道へ直進すると西の石垣（x=-24）に突き当たり、
  // 口を開けてあっても四方からの乗り込みに加われなかった。
  // 西の石垣は x=-24。すでに内側の兵まで外へ戻すと、
  // 口から外れた石垣へ向かってしまう。口の直前では横へ押し戻さず、
  // まず同じ x のまま口の正面へそろえる（東の口と同じ）。
  // 11/18 クラウド見回り：西の石垣の上（x=-24）の味方の鉄砲を狙う寄せ手は案内の外で、石垣の外の (-38,-20) に十五秒溜まって崩れた。石垣の上の相手も口へ回す
  if (x < -25 && x > -80 && z > -32 && z < 4 && want.x > -25 && want.x < 22 && want.z > -21 && want.z < 4) {
    const q = u._k01West || (u._k01West = { x: 0, z: -12, botRadius: 0.5 });
    const gz = -12 + (((u.slot ?? 0) % 5) - 2) * 0.75;   // 東の口と同じく、口の幅の内で五つの筋に分ける
    q.x = Math.abs(z - gz) > 1 ? (x < -26 ? Math.min(-29, x) : x) : -20;
    q.z = gz;
    return q;
  }
  // 関所 2（11/10）：石垣の上の塀に当たりを置いたので、曲輪の内から外の行き先へは、行き先に近い口を通って出す。
  //   大手の曲輪の北東の隅から三の丸の東の隅櫓へ真っすぐ向かい、塀の角に二十秒以上突っかかった
  for (const k of PLAN.kuruwa) {
    const [x0, z0] = k.poly[0], [x1, z1] = k.poly[2];
    const inside = (px, pz, m) => px > Math.min(x0, x1) - m && px < Math.max(x0, x1) + m && pz > Math.min(z0, z1) - m && pz < Math.max(z0, z1) + m;
    if (!inside(x, z, 2.2) || inside(want.x, want.z, 2.2)) continue;
    let best = null, bd = Infinity;
    for (const g of k.gapAt || []) { const d = Math.hypot(g[0] - want.x, g[1] - want.z) + Math.hypot(g[0] - x, g[1] - z) * 0.5; if (d < bd) { bd = d; best = g; } }
    // 幅五歩の口の三歩手前で案内を解くと、脇の石垣へ斜めに
    // 進んでしまう。到着の輪より内まで口の中央へ案内する。
    if (!best) break;
    const q = u._k01Gate || (u._k01Gate = { x: 0, z: 0, botRadius: 1 });
    q.x = best[0]; q.z = best[1];
    // 11/17 クラウド：口の真ん中に着くと案内が解け、ほかの案内が曲輪の内へ戻して口の上で足踏みした
    //   （act bot が大手の北の口 (1,59)・三の丸の北の口 (-1,20) で十分止まった）。口に着いたら、口を抜けた外の四歩先へ出す。
    //   口の線を越えた後（曲輪の縁の外の二歩の内）も外へ出し続ける。越えた所で口の真ん中へ戻され、南北に足踏みした（三の丸の北の口 z=18.4）
    const ox = best[0] <= Math.min(x0, x1) + 0.5 ? -1 : best[0] >= Math.max(x0, x1) - 0.5 ? 1 : 0;
    const oz = ox ? 0 : (best[1] <= Math.min(z0, z1) + 0.5 ? -1 : 1);
    const past = ox ? (x - best[0]) * ox > 0 : (z - best[1]) * oz > 0;
    if (Math.hypot(best[0] - x, best[1] - z) < 1.6 || (past && Math.abs(ox ? z - best[1] : x - best[0]) < 2.5)) {
      q.x = best[0] + ox * 4; q.z = best[1] + oz * 4;
    }
    return q;
  }
  // 回り道は三の丸より南（大手の脇）の外だけ。前は二の丸と本丸の間の空堀の脇に立つ者まで大手門の前へ回され、
  //   本丸へ寄せる寄せ手が二の丸の北の石垣に溜まって、本丸の口へ一人も来なかった（11/7 描いて遊んで見つけた）
  // 大手の石垣の幅の内なら、道案内で土橋の中央へ戻す。
  // 土橋の脇（例 x=8,z=53）から南へ戻すと、大手の北の石垣に突き当たる。
  // 城外を回る者も、三の丸の幅（左右28歩）より外へ出てから南下する。
  // 関所 2（11/10）：曲輪の間の道（三の丸の門の前の土橋など）へ戻る時も同じ。塀に当たりを置いたので、大手の東の塀の外の角で突っかかった
  const onRoad = Math.abs(want.x) < 9 && want.z > 16 && want.z < 92;
  if (z < 92 && z > 16 && Math.abs(x) > 22 && !inKuruwa(x, z) && (inKuruwa(want.x, want.z) || onRoad)) {
    // 横へ回り切る境目は x=31、行き先は x=32。到着の輪が
    // 1.2歩だと x=30.8 で止まり、南へ折り返す条件に届かない。
    const q = u._k01Out || (u._k01Out = { x: 0, z: 0, botRadius: 0.5 });
    if (z >= 90) { q.x = 0; q.z = 97; }
    else if (Math.abs(x) < 31) { q.x = Math.sign(x) * 32; q.z = z; }
    else { q.x = x; q.z = 97; }
    return q;
  }
  const q = routeWay(army, u, want);
  if (q !== want) q.botRadius = 1;
  return q;
}
// 寄せ手の組：from から寄せる。旗はその家の紋（紋の確かでない長束・甲賀は丸。雑賀の鈴木孫一は八咫烏）
const keep = (name, from, flag, list, o = {}) => ({ name, from: { x: from.x, z: from.z }, faction: flag, width: o.width || 10, list: dress(list, { ...WEST, flag: flag === 'kobayakawa' ? 'sashi:kobayakawa:#ece6d6:#16140f' : flag }), seek: o.seek || 60, morale: o.morale || 94, ...(o.dmg ? { dmg: o.dmg } : {}), ...(o.mass != null ? { mass: o.mass } : {}) });
// 城の外の陣（本物の兵。動かずに城を囲む。総大将とその下の大将は前に出ない）
// 総大将（宇喜多秀家）は床几に座り、下の大将（小早川・島津）は馬上で旗本に囲まれる（AR3・AV7・Q）
const camp = (rt, name, at, flag, lead, list, facing, seat = false) => {
  const banner = lead === '小早川秀秋' ? 'sashi:kobayakawa:#ece6d6:#16140f' : flag;
  const g = enemyGroup(rt, { fixed: true, faction: flag, name, anchor: at, facing, order: 'hold', aggro: 3, width: 10, morale: 100, noRout: true },
    dress([{ type: 'busho', n: 1, o: { name: lead, invuln: true, mustLive: true, onWound: () => {}, horse: !seat } }, ...list.map((e) => e.type === 'samurai' ? { ...e, o: { ...e.o, keep: true } } : e)], { ...WEST, flag: banner }));
  // 日付の札と使番で着陣を知った将は、遠い本陣でも既知の相手にする。
  // 頭上の名とは別に、案内の相手選びに残っていた未発見の判定をそろえる。
  revealName(rt, lead);
  if (seat) { const u = g.units.find((x) => x.name === lead); if (u) u._crouch = true; }
  // 陣は大将の頭（ai.js）に任せない。任せると「攻めよ」に替わり、床几の宇喜多秀家が本陣ごと大手の前まで出て来た（11/5 描いて遊んで見つけた）
  g.noAI = true; g.stay = true; g._home = { x: at.x, z: at.z };
  // 床几に座る本陣は、家紋を染めた陣幕で囲む（総大将の座る所が野に晒されていた）
  if (seat) rt.scene.add(jinmaku(rt.world, at.x, at.z + 1, 22, 13, 5, { mon: flag }));
  rt.scene.add(nobori(rt.world, at.x - 6, at.z + 3, banner, 6)); rt.scene.add(nobori(rt.world, at.x + 6, at.z + 3, banner, 6));
  // 11/8 critic60 伏見（十二1・二3・BR）：四万の囲みが二十〜百の兵にしか見えなかった。見せかけの兵は足さず、陣の後ろに幟の林と篝火を並べ、
  //   四方の陣の奥に大軍が控える厚みを見せる（幟と篝火は既存の形を使い回す。兵の数は変えない）
  const back = Math.atan2(at.x, at.z);   // 城（原点）から陣の外へ向かう向き
  for (let i = 0; i < 8; i++) {
    const side = (i - 3.5) * 5.5, depth = 9 + (i % 3) * 4;
    const x = at.x + Math.cos(back) * side + Math.sin(back) * depth, z = at.z - Math.sin(back) * side + Math.cos(back) * depth;
    rt.scene.add(nobori(rt.world, x, z, banner, 5 + (i % 2)));
  }
  for (const s of [-1, 1]) rt.scene.add(kagaribi(rt.world, at.x + Math.cos(back) * s * 12 + Math.sin(back) * 6, at.z - Math.sin(back) * s * 12 + Math.cos(back) * 6));
  return g;
};

const k01_fushimi = {
  // 自刃・血天井はこの戦で順に描く。共通の落城を重ねると、
  // 孫一が切腹を待つ前に「鳥居殿、討死」の知らせが割り込む。
  ownEnding: true,
  // 11/18 クラウド k365-cloud-09（開戦12秒 874×402）：騎馬の本人の視点が前を行く組の一列の背中と旗に塞がれ、大手の曲輪も寄せ手も見えなかった。岐阜と同じく少し上から
  camLift: 0.5,
  // 落城の締めと結果の札をそろえ、城方が寄せ手を退けた勝利とは呼ばない。
  winWord: '伏見城、落城',
  victoryTitle: '伏見城、落城',
  victoryCaption: '四万の寄せ手を食い止め、内府様のための時を稼いだ',
  // 身の回りの合戦の跡（timeslip_field.js）。伏見城：慶長五年七月（旧暦の初秋・新暦の八月末の残暑）。白い砂利の曲輪も寄せ手の泥と倒れた槍・矢・旗で踏み荒らす
  timeslip: {
    wet: 0.1, dust: 0.75, trample: 0.45, debris: 1.4, arrows: 1.2, workGround: true,
    grass: 0x7e9a4c, grassTints: [0xffffff, 0xe4ecc4, 0xc8d49c], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.7,
    flagColors: [0xe6dfcc, 0x24211e, 0x9a2a20],
    // 11/17 クラウド K358（初めての目の写真）：二の丸の内に丈の高い草の株が並び、天下人の城の曲輪が野原に見えた。曲輪の内は草を生やさない（踏み跡と倒れた物は残す）
    // 11/18 クラウド（伏見の持ち主・200秒の写真）：曲輪の間の土橋（三の丸→二の丸の口）の真ん中に丈の高い白い草の株が立ち、城の大手道が野道に見えた。寄せ手と城兵が踏む中央の道も生やさない
    noGrass: (x, z) => inKuruwa(x, z) || (Math.abs(x) < 4.5 && z > -66 && z < 92),
  },
  // 打って出る手勢と一緒に、大手の曲輪の内で大手門（南）を向いて始める。
  //   前は三の丸の奥から始め、馬の主人公だけが先に屋敷へ着き、番兵に一人で囲まれて倒れた（critic60「味方は後ろに離れていた」）
  spawn: { x: 2, z: 72, heading: 0 },
  noWake: true,
  noFrontFill: true,       // 見せかけの軍勢を重ねない（AA・AF・AP9・AQ6）。見える兵は全部本物
  noDistantBattle: true,
  noLeaderFollow: true,    // 行き先の印は段ごとの一つだけ
  goalSignOnly: true,      // 地面の矢印・持ち場の輪を出さない（BH6）
  goalSignTriangle: true,  // 画面の端でも行き先は下向きの▼を保つ（五3）
  keepBattleSigns: true,   // 行き先の印を出している間も、武将名と両軍の数を残す（九3）
  noMiniMap: true,         // 11/8 critic60（N・五2）：右上の小さな地図が出たり消えたりした。地図は出さない
  goalsVisibleRows: 5,     // 今の目標を含む五件を順に並べる。共通の既定の一件表示では後の持ち場が分からない。
  // 11/8 critic60（三2）：持ち場に立っているのに▼が遠くの「100m」を指したまま。▼は今の段の持ち場（dp の印）だけを指し、着いたら消す
  goalSignTarget(rt) {
    const D = rt.flags.dp, C = D?.on ? D.cur : null;
    const fighting = C?.s.kind === 'fight';
    const moving = C?.s.kind === 'move';
    const holding = C?.s.kind === 'hold';
    // 討つ段の印は敵の組を追う赤い印。これを除くと屋敷・大手門・
    // 本丸への行き先まで消えるため、段に決めた場所を案内する。
    const m = rt.markers.find((q) => q.id === 'dp');
    // 二の丸へ一度着くと共通の移動段が印を外す。その後に追い手と
    // 戦って離れても、達成には持ち場へ戻る必要があるので案内を残す。
    const rest = C?.s.kind === 'rest' ? rt.flags.restNext : null;
    // 守備地点も共通の印に依存させない。印が隠れたり外れたりしても、
    // 未到着の持ち場への案内と地名を失わない。
    // 救援・守備も門と土橋を通す。持ち場を直接指すと、
    // 大手の曲輪から東の隅櫓へ向かう時に石垣を横切ってしまう。
    const at = moving || fighting || holding ? fushimiWay(rt.army, rt.player.u, C.at) : rest || (m && !m.red ? m.pos?.() : null);
    if (!at) return null;
    const p = rt.player.u.pos;
    // 別れの間は段がまだ無い。初期位置が持ち場の十二歩内でも、
    // 開戦前の案内まで到着扱いで消さない（全戦通しの開始時の指摘）。
    // 後退・脱出の到着判定は八〜九歩。十二歩で消すと未到着の
    // 十歩手前で行き先を失うため、移動中は八歩内まで残す。
    // 最後の守備も十歩内への到着が必要。守備の輪が狭い時は、
    // その内へ入るまで案内を消さない。
    const arrivedRadius = moving ? 8 : holding ? Math.min(12, C.botRadius || 14) : 12;
    if (C && at === C.at && Math.hypot(p.x - at.x, p.z - at.z) < arrivedRadius &&
      Math.abs((p.y ?? 0) - (rt.world?.heightAt(at.x, at.z) ?? at.y ?? 0)) < 3 &&
      !rt.army?.wallBetween(p, -1, at, false)) return null;
    const T = rt.flags._gsT || (rt.flags._gsT = { x: 0, z: 0, label: '' });
    T.x = at.x; T.z = at.z;
    T.label = moving && D.i === 11 && at !== C.at ? '本丸の裏口' : (fighting || moving || holding) ? (C.s.lbl || (m && typeof m.label === 'string' ? m.label : '') || '持ち場') : rest ? rest.label : typeof m.label === 'function' ? m.label() : m.label;
    return T;
  },
  kumiLead: false,         // 組頭の印も出さない（AV15）
  noHatamotoMass: true,    // 将の後ろの軽い作りの備を置かない（AF）
  noYaguraTask: true,
  noReinforcements: true,
  // 11/18 夜50-13（act bot 679秒：本丸の最後の段で騎馬の一太刀＝命の三割を四度受けて倒れた。描かずの通しで、西の丸から寄せる長束勢・天守へ寄せる宇喜多勢・破城隊にも
  //   共通の騎馬の混ぜ（bhelp.js horseList）で馬武者が入り、本丸・三の丸の内を馬で駆けていた）：城攻めの寄せ手は徒。騎馬の混ぜをこの戦では止める
  noCavalryMix: true,
  // 新手の中心だけでなく十八歩幅の隊全体が収まる所へ置く。
  // 二の丸と松の丸の隙間・石垣の斜面に横陣を作ると、
  // 出た直後から兵が塀際の一点へ押し込まれる。
  reserveWallOk: false,
  // 11/18 17:45 UTC クラウド持ち主（act bot POSLOG 633秒で倒れた：⑩元忠殿の旗の段で本人の二十五m 内に寄せ手百三十・内 新手の attack 四十。傷の一番は共通の新手 33）：数は減らさず、新手の一太刀を 0.45→0.35 に（三木と同じ）
  reserveDmgMult: 0.35,
  reserveOk(rt, p) {
    const W = rt.world, me = rt.player?.u;
    const h = W.heightAt(p.x, p.z);
    if (me && Math.abs(h - me.pos.y) > 3) return false;
    const from = { x: p.x, y: h, z: p.z }, to = { x: 0, y: h, z: 0 };
    for (let dx = -9; dx <= 9; dx += 9) for (let dz = -9; dz <= 9; dz += 9) {
      to.x = p.x + dx; to.z = p.z + dz;
      if (Math.abs(W.heightAt(to.x, to.z) - h) > 2 ||
        W.walkable(to.x, to.z, h) === false ||
        rt.army.wallBetween(from, -1, to, false)) return false;
    }
    return true;
  },
  // 籠城では寄せ手を退けても追撃に出ない。共通の備の追撃判定と
  // 「味方が追撃に移った」の知らせを止め、次の持ち場を守る。
  noPursuit: true,
  // 落城は任務失敗ではない。共通の十八分の打ち切りで、脱出の
  // 途中を失敗にせず、本人の生還まで城固有の段で判定する。
  pacingWait: () => true,
  // 命懸けの戦場（docs/lethal_howto.md）。籠城の怖さは本丸へ迫る寄せ手と、討ち減らされる城方
  // lethal は入れない（11/8 bot：入れると三の丸の虎口の段で止まり、十八分で任務失敗になった。入れずに流すと九分半で達成）
  lethal: { max: 2, firstAt: 200, gap: 120 },   // 11/9 二巡（徳川D）：弱めて入れる（突然の討死は二つまで・三分過ぎから）
  fearKind: { kind: '籠城', note: '曲輪を一つずつ失い、本丸へ追い詰められる', w: { honjin: 1.8, losses: 1.3 }, line: '本丸まで来るぞ！' },  // 籠城で新手の味方は来ない（減った城方の所へ「新手が追いついた」と足軽八人が湧いていた）
  // 始まりの札：軍の名に兵の数を添え、二三行の筋（「味方 徳川勢 対 敵 西軍」だけで千八百対四万が分からなかった。critic60・五4）
  depth: fushimiDepth,   // 布陣図（docs/fujin/k01_fushimi.md）：寄せ手四万の備を城の三方に（k01_fushimi/yose.js）
  introSides: { a: '徳川勢　千八百', b: '寄せ手　四万' },
  introText: '家康が会津へ発ち、鳥居元忠が伏見城を預かる。石田三成らの大軍が城を囲み、援軍は来ない。曲輪を一つずつ守り、時を稼げ。',      // 隅櫓の「中へ入り、守りを追い出せ」の脇の目標を出さない（櫓は城方の持ち場。番号の目標と二つ目の▼になっていた）
  minutes: 13,
  world: {
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物
    seed: 1600719,
    time: 'day',
    groundHalf: 290,
    moveLim: 250,
    // 11/17 K168 クラウド kaito2：櫓門は坂の途中に建つ（三の丸の門 (0,46) は門の下の地面が 2.4〜4.2m）。床を真ん中の地面で決めると上の階の床まで 1.5m しかなく、
    //   門を通る兵の頭が上の階の壁に入った。小谷と同じく、床の端まで地面より上にそろえる（門の柱は柱ごとに地面まで下ろす yaguramon）
    interiorFit: true,
    paths: [ROUTE.slice(0, 8), ROUTE.slice(7)],
    height,
    moveWay: fushimiWay,
    // 11/18 クラウドさ（act bot 241秒：松平近正の手13人＝皆遠い軽い兵が、三の丸の外 (6,52) の寄り所へ三の丸の門 (0,46) を同じ一点で受け取り重なって止まる★★）：持ち場の番号で一歩ずつずらす（箕作・越前と同じ）
    farSpread: 'all',
    tint(x, z, h, c) {
      if (distToPolyline(x, z, ROUTE) < 3.2) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      if (z > 100) { c.setRGB(c.r * 0.6 + 0.22, c.g * 0.6 + 0.2, c.b * 0.5 + 0.06); return; }
      if (h > 10) c.setRGB(c.r * 0.76, c.g * 0.86, c.b * 0.72);
    },
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 7 || PLAN.kuruwa.some((k) => x > k.poly[0][0] - 2 && x < k.poly[1][0] + 2 && z > k.poly[0][1] - 2 && z < k.poly[2][1] + 2) || CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < 16) || Math.hypot(x - YASHIKI.x, z - YASHIKI.z) < 18 || Math.hypot(x - TSUKIYAMA.x, z - TSUKIYAMA.z) < 12 || Math.hypot(x - TAIKO.x, z - TAIKO.z) < 9,
    trees: 380,
    tufts: 2200,
    treeDensity: (x, z) => (distToPolyline(x, z, ROUTE) < 9 || CAMPS.some((c) => Math.hypot(x - c.x, z - c.z) < 18) || Math.hypot(x - YASHIKI.x, z - YASHIKI.z) < 20 ? 0 : z > 100 ? 0.1 : 1.0),
    groves: [{ x: -70, z: 40, r: 16, n: 18, kind: 'sugi' }, { x: 70, z: -10, r: 16, n: 18, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? z > 210 : z < -150),
  },

  *setup(rt) {
    crowTex();
    installYose(rt, rt.flags.k01s = {});
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    F.C = buildCastlePlan(rt, PLAN, { baseHeight: base, edgeW: 3, team: 0, perchLook: TORII, interiorGuards: false, buildGates: true, buildTowers: true });
    fushimiGateCamera(W, SOLIDS);
    // 門は開けた形（味方が退き、寄せ手が攻め入る道を塞がない）
    for (const g of Object.values(F.C.gateObjs || {})) { g.open(); Object.assign(g.struct, { solidR: 0, passable: true, opened: true, noTarget: true, fireProof: true }); }
    F.tkFlags = [];
    for (const [x, z] of [[-14, 66], [14, 66], [-16, 26], [16, 26], [-14, -14], [14, -14], [-10, -50], [10, -50]]) { const f = nobori(W, x, z, 'tokugawa', 6); rt.scene.add(f); F.tkFlags.push(f); }
    yield;   // K112：組立てを段に分ける（描く支度はここで一コマ返す）
    // 内藤家長の大旗（西の丸）。家長が果てた後は、旗だけが倒れている
    F.naiFlag = nobori(W, -36, -46, 'tokugawa', 8); rt.scene.add(F.naiFlag);
    for (const [x, z] of [[-8, 70], [8, 34], [-8, -6], [8, -44]]) rt.scene.add(kagaribi(W, x, z));
    // 大手の外の長束・前田玄以の屋敷（七月十九日に城方が打って出て焼く）
    for (const [x, z, r] of HOUSES) rt.scene.add(hut(W, x, z, 7, 5, r, { wall: 0x7f6b52, groundedHome: true, minka: false }));
    yield;   // K112：組立てを段に分ける（描く支度はここで一コマ返す）
    // 寄せ手の築山（大筒を据える盛り土）と、三の丸の前の空堀を埋める土俵（史実の昼夜の大筒・堀の埋め立て）
    rt.scene.add(dorui(W, [TSUKIYAMA.x - 7, TSUKIYAMA.z, TSUKIYAMA.x + 7, TSUKIYAMA.z], 0, -1, { w: 6, h: 2.4, bareSoil: true }));
    for (const [x, z, r] of [[12, 53, 0.1], [17, 53.6, -0.2], [-13, 52.6, 0.2]]) rt.scene.add(tawara(W, x, z, r, 6));
    // 寄せ手が押し立てた竹束（城の鉄砲を防ぐ。前＝+z を城の北へ向ける）。大手の外と大手の曲輪の脇
    for (const [x, z] of [[-14, 92], [-11.6, 92.4], [-9.2, 92.6], [9.2, 92.6], [11.6, 92.4], [14, 92], [-18, 58], [-15.6, 58.2], [15.6, 58.2], [18, 58]]) rt.scene.add(takataba(W, x, z, Math.PI));
    // 見せかけの軍勢は置かない（AA・AF・AQ6・AP9）。城を囲む西軍の陣も本物の兵。総大将の宇喜多秀家は南の外の本陣から出ない（AR3・AT3）
    // 寄せ手は段々に増える（七月二十二日 宇喜多・二十三日 小早川と島津）。陣は update で日付の段に着く
    yield;   // K112：組立てを段に分ける（描く支度はここで一コマ返す）
    // ---- 城方：千八百。鳥居元忠は本丸の天守の前の本陣で旗本に囲まれる。主人公は元忠の手勢として三の丸の虎口を受け持つ ----
    // 守将は筋書きの討死まで持ち場を守る。本人の誤撃でも共通の手傷による後退へ移さない。
    // 11/17 K168 クラウド kaito2：(-2,-48) は本丸の御殿の土台（x -15〜-3・z -58.4〜-47.6）に掛かり、開戦の一コマ目に旗本が土台の内に立っていた。御殿の前 (-2,-44) に置く
    F.motochika = allyGroup(rt, { faction: 'tokugawa', name: '鳥居元忠の本陣', anchor: { x: -2, z: -44 }, facing: 0, width: 6, aggro: 3, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '鳥居元忠', invuln: true, onWound: () => {}, horse: false } }, { type: 'samurai', n: 14, o: { keep: true } }], { ...TORII, flag: 'sashi:torii:#ece6d6:#16140f' }));   // 本丸の旗本は鳥居の家の幟（白地に黒の鳥居・家紋 旗 馬印 072）
    F.toriiU = F.motochika.units.find((u) => u.name === '鳥居元忠');
    F.motochika.stay = true;   // 本陣は本丸から出ない（共通の頭が八月一日に二の丸の敵へ出して、床几の元忠ごと本丸を空けた）
    if (F.toriiU) F.toriiU._crouch = true;   // 本丸の床几に腰を下ろす（最後の段で立って前に出る）
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', anchor: { x: -4, z: 76 }, facing: 0, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 4 }], TORII));
    F.ie = allyGroup(rt, { faction: 'tokugawa', name: '松平家忠の手', anchor: { x: 9, z: 76 }, facing: 0, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '松平家忠', invuln: true, onWound: () => {}, horse: true } }, { type: 'samurai', n: 6, o: { keep: true } }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }], TORII));
    yield;   // K112：組立てを段に分ける（描く支度はここで一コマ返す）
    // 家長の持ち場は始めから西の丸（籠城の持ち場の伝え）。前は三の丸の虎口に並び、夕の段で西の丸へ戻っていた（11/6 布陣の照らし合わせ）
    // 11/17 K168 クラウド kaito2：後ろの列が西の丸の小屋（(-51.1,-50.9)・幅4.5×3.3）の際で押し出されては戻り、壁の内へ入っていた → 持ち場を東へ2.5m・南へ2.5m（北の (-37.6,-45) の小屋にも前の列が掛からないよう）・南へ2.5m（北の (-37.6,-45) の小屋にも前の列が掛からないよう）
    F.nai = allyGroup(rt, { faction: 'tokugawa', name: '内藤家長の手', anchor: { x: -37.5, z: -52.5 }, facing: Math.PI / 2, width: 10, aggro: 6, order: 'hold', fixed: true, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '内藤家長', invuln: true, onWound: () => {}, horse: true } }, { type: 'busho', n: 1, o: { name: '内藤元長', invuln: true, onWound: () => {}, horse: true } }, { type: 'samurai', n: 6, o: { keep: true } }, { type: 'ashigaru', n: 5 }, { type: 'gun', n: 6 }], TORII));   // 家長は鉄砲隊を指揮して射撃の線を保つ（指示書）
    F.naiWest = true;
    F.nai.stay = true; F.nai.noAI = true;
    // 西の丸は家長と子の元長の父子が守った（『落穂集』・城史の伝え）。父子とも西の丸で果てる（naitoFall）
    // 三の丸は家忠と松平近正の二人の持ち場。太鼓の丸には宇治の茶師の家の上林竹庵（政重。家康に仕えた徳川方。甲賀衆ではない）
    F.chika = allyGroup(rt, { faction: 'tokugawa', name: '松平近正の手', anchor: { x: SAN.x + 22, z: SAN.z + 4 }, facing: 0, width: 8, aggro: 8, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '松平近正', invuln: true, onWound: () => {}, horse: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 5 }, { type: 'gun', n: 2 }], TORII));
    F.chikuan = allyGroup(rt, { faction: 'tokugawa', name: '上林竹庵の手', anchor: TAIKO, facing: -Math.PI * 0.5, width: 6, aggro: 6, order: 'hold', fixed: true, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '上林竹庵', invuln: true, onWound: () => {}, horse: true } }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 3 }], TORII));
    yield;   // K112：組立てを段に分ける（描く支度はここで一コマ返す）
    // 松の丸の甲賀衆（城方として持ち場に就く。八月一日、人質を取られて寝返る）。甲賀の侍を下知したのは深尾清十郎（『落穂集』）
    F.koka = allyGroup(rt, { faction: 'tokugawa', name: '甲賀衆', anchor: { x: MATSU.x, z: MATSU.z + 2 }, facing: Math.PI / 2, width: 6, aggro: 3, order: 'hold', fixed: true, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '深尾清十郎', invuln: true, onWound: () => {}, horse: true } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 4 }], TORII));
    for (const g of [F.mine, F.ie, F.nai, F.chika]) { g.defMult = 1.25; g.dmgMult = 0.8; }
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: 2, z: 69 }, 0, [{ kind: 'spear', n: Math.min(n, 12) }]);
    W.setTime('day');
    rt.flags.k01Date = '六月十八日';
    rt.setPhase('brief');
    // 11/10 docs/fushimi_spec_1109.md：守り切る戦でなく「城を失うまでの時間を売る」戦。目標は「伏見城を守れ」とだけ言う（守り切れとは言わない）
    rt.obj('main', '伏見城を守れ', 'main');
    // 行き先のピンは始めから切らさない（関所 3）。別れの間も、最初の持ち場（大手の曲輪）を指す
    rt.marker('dp', { x: 0, z: 64 }, '大手の曲輪', { h: 3 });
    // ---- K364 ④（docs/specs/drama_req_1117.md 49）：戦の前の夜、本丸で家康と元忠が別れる。「この城は落ちる」と二人とも分かっている。
    //   身分で見え方を変える：足軽大将候補より上は二人のそばで言葉を聞く。足軽までは離れた所から、二人の様子と侍のささやきだけ。
    //   史実の分け（docs/journey/k01_fushimi.md の K364 の節）：家康が六月十八日に伏見を発ち、元忠に城を預けた・城兵は千八百ほど は A。言葉は B。
    //   元忠が「兵は一人でも多く会津へ」と言った話は伝え（C）なので、古参の侍の「と聞く」にとどめる。
    this.nightPart(rt);
  },

  // 前夜の本丸（約33秒）→暗転→朝の出立（dayPart）
  nightPart(rt) {
    const F = rt.flags, W = rt.world, T = F.k01s || {}, inner = ladderStep(rt.G || {}) >= 2;
    const P = rt.player.u, at = (u, x, z, h) => { u.pos.set(x, W.heightAt(x, z), z); u.mesh?.position.copy(u.pos); u.moveTo = null; if (h !== undefined) { u.heading = h; } };
    const L = (t, who, text, sec = 3.4) => rt.after(t, () => { if (!F.begun && !rt.over) rt.say(who, text, sec); });
    rt.cutT = rt.t;
    W.setTime('night', true); F.k01Date = '六月十七日';
    // 本丸の天守の前（元忠の床几）を、開けた東から見る（門や隅櫓の陰に立たせない）
    // 11/17 K168 クラウド kaito2：(14,-38) は本丸の東の建物の土台（x 11.6〜20.4・z -41.9〜-34.1）の内で、本人が前夜の場の間ずっと土台の中に立っていた。土台の西の際 (10,-38) へ
    // 11/18 クラウド k365-cloud-09（cloud-36 の見回り・開戦1秒 874×402）：(10,-38) からは天守の石の台が目の前を塞ぎ、本人が窪みに立って盛り土を見上げる画になった。
    //   東の建物の土台の南の外 (13,-45) から、西の家康の床几を正面に見る
    const px = inner ? 8 : 13, pz = inner ? -42 : -45, ph = Math.atan2(2 - px, -47 - pz);
    at(P, px, pz, ph); rt.player.yaw = ph;
    if (T.ieyasu) { let i = 0; for (const u of T.ieyasu.units) if (u.alive) { at(u, u.name ? 2 : 4 + (i % 3) * 1.4, u.name ? -47 : -52 + Math.floor(i / 3) * 1.4, -Math.PI / 2); i++; } T.ieyasu.anchor = { x: 2, z: -47 }; }
    rt.banner('六月十七日の夜', '伏見城の本丸。明日、内府様は会津へ発たれる');
    if (inner) {
      L(2.5, '徳川家康', '上方で事が起これば、この城が真っ先に囲まれよう');
      L(7, '鳥居元忠', '承知の上にござる');
      L(11, '徳川家康', '残せる兵は、千八百ほどじゃ');
      L(15.5, '鳥居元忠', 'この城のことは、お任せあれ');
      L(20, '徳川家康', '…………', 2.6);
    } else {
      L(2.5, '鳥居の侍', '内府様と彦右衛門様が、二人きりで話しておられる');
      L(8, '鳥居の侍', '……声が低うて、聞こえぬ', 3);
      L(14, '鳥居の侍', '内府様が、長う黙っておられる', 3);
    }
    L(23, nm(rt), '（この城は、落ちる。お二人とも、分かっておられる）', 3.6);
    L(27.5, '古参の侍', '彦右衛門様は「兵は一人でも多う会津へ」と申された、と聞く', 3.8);
    rt.after(32, () => { if (!F.begun) rt.scene.visible = false; });
    rt.after(33.4, () => {
      rt.scene.visible = true;
      if (F.begun) return;
      rt.cutT = rt.t;
      W.setTime('day', true); F.k01Date = '六月十八日';
      at(P, this.spawn.x, this.spawn.z, this.spawn.heading); rt.player.yaw = this.spawn.heading;
      if (T.ieyasu) { let i = 0; for (const u of T.ieyasu.units) if (u.alive) { at(u, -9 + (i % 4) * 1.4, 74 + Math.floor(i / 4) * 1.4); i++; } T.ieyasu.anchor = { x: -9, z: 74 }; }
      this.dayPart(rt);
    });
  },

  // 朝の出立：家康は旗本と大手門から出て、門が閉まる（k01_fushimi/yose.js の T.ieyasuGo が家康を動かす）
  dayPart(rt) {
    rt.flags.k01s?.ieyasuGo?.();
    rt.say('徳川家康', '城の者ども。……頼むぞ', 3.2);
    rt.after(3.6, () => rt.say('鳥居の侍', 'はっ。', 2.2));
    rt.after(21, () => { this.shut(rt, 'ote_s'); sfx('knock', 0.7); });
    rt.after(22.4, () => rt.say('鳥居の侍', '行かれましたな。', 2.6));
    rt.after(25.4, () => rt.say('鳥居元忠', 'ああ。', 2.2));
    // ---- 包囲されていく（南→西→東と、遠くの旗が増える）
    rt.after(28, () => { rt.flags.k01Date = '七月十九日'; rt.banner('七月十九日', '西の軍勢が伏見へ寄せる'); });
    // 小早川・島津・毛利の本陣は二十三日の段で着く。包囲の
    // 声だけで先に全陣を出すと、日付に合わせた着陣を壊してしまう。
    rt.after(31.5, () => rt.say('鳥居の侍', '……多いな。', 2.6));
    rt.after(35, () => rt.say('使番', '全周、敵勢！', 2.8));
    rt.after(38, () => { rt.say('鳥居元忠', '城を明け渡せとの使いは追い返した。', 3.2); });
    // 11/17 K355 iMac n-kwatch（大乱関ヶ原 5巻から：伏見で鳥居元忠を討った寄せ手の中に小早川秀秋がいた。秀秋は後に東へつき、北政所に「伏見の罪滅ぼし」と言われる）。
    //   寄せ手の旗を数える侍の一言で、太閤の甥が内府の城を攻める重さだけを先に置く（後の関ヶ原の寝返りへの伏線・自分の言葉）
    rt.after(47, () => { if (!rt.over) rt.say('鳥居の侍', '西に違い鎌の旗……金吾中納言まで寄せ手におるとは', 3.2); });
    rt.after(41.5, () => this.begin(rt));
  },

  // 門を閉めた絵にする（通り道は塞がない。寄せ手が破って入る時に開ける）
  shut(rt, id) {
    const g = rt.flags.C?.gateObjs?.[id], d = g && (g.door || g.mesh);
    if (d?.userData?.close) d.userData.close();
  },
  unshut(rt, id) { const g = rt.flags.C?.gateObjs?.[id]; if (g?.open) g.open(); },
  // 時間稼ぎの内部の値（DELAY_PROGRESS 0→100）。画面には出さず、使番の知らせと戦後の評価で見せる
  delay(rt, v) {
    const F = rt.flags;
    F.delay = Math.min(100, (F.delay || 0) + v);
    const lines = [[25, '徳川本隊、さらに東へ。'], [50, '敵軍、ここで足止めされております。'], [75, 'もう少しです。']];
    for (const [k, t] of lines) if (F.delay >= k && !(F.delaySaid || (F.delaySaid = {}))[k]) { F.delaySaid[k] = true; rt.after(1.5, () => rt.say('使番', t, 3)); break; }
  },

  // 戦の途中の保存（battle_checkpoint.js・K211 kaito「20〜30分の戦で途中が全部消えるのは最悪」）：段（①〜⑪）の始まりから続ける。
  //   段の番号は段の流れ（b_depth.js）の番号。飛ばした段の出来事（門の開け閉め・家忠らの討死・火）は resumeFx で音もなく起こす
  checkpointStep(rt) { const D = rt.flags.dp; return D && D.on ? D.i : -1; },
  resumeSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((k) => [k, function (rt) {
    const F = rt.flags;
    if (!F.begun) this.begin(rt);
    if (!F.dp?.on) return;
    for (let j = F.dp.i; j < k; j++) this.resumeFx(rt, j);
    depthJump(rt, k);
  }]),
  // 続ける時の置き場：守る段・救う段はその持ち場の手前、退く段（③⑦⑪）は前の持ち場（行き先の手前に置くと着いただけで済む）
  resumeAt(rt, step) {
    const P = { 1: [8, 44], 2: [0, 46], 3: [0, 48], 4: [NI.x, NI.z + 2], 5: [-10, -5], 6: [6, -5], 7: [6, -5], 8: [HON.x, HON.z + 3], 9: [HON.x, HON.z + 1], 10: [-4, -46], 11: [-4, -48] }[step];
    return P ? { x: P[0], z: P[1] } : null;
  },
  resumeFx(rt, j) {
    const F = rt.flags;
    if (j === 3) { this.guardSan(rt); if (F.ie && !F.ieAway) { F.ieAway = true; Object.assign(F.ie, { anchor: { x: -17, z: -7 }, order: 'hold', fixed: true, stay: true, noAI: true, aggro: 10, facing: Math.PI / 2, focus: null }); } }
    if (j === 4) this.shut(rt, 'ni_s');
    if (j === 5) this.unshut(rt, 'ni_s');
    if (j === 6) this.ieFall(rt);
    if (j === 8) {
      this.shut(rt, 'hon_s'); this.burn(rt); this.naitoFall(rt);
      for (const nn of ['松平近正', '上林竹庵']) this.fall(rt, nn);
      this.fallAll(rt, [F.chika, F.chikuan]);
    }
    if (j === 9) this.unshut(rt, 'hon_s');
    if (j === 10) this.thin(rt);
  },
  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t; F.a0n = Math.max(1, allyN(rt)); F.delay = 0;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    rt.say('鳥居元忠', '持ち場につけ！', 2.6);
    const SW = { x: -22, z: 116 }, S = { x: 0, z: 116 };
    const stages = [
      // ⓪ 外郭（2〜5分）：大手の曲輪で宇喜多勢を受ける。まだ「守れている」
      DP.hold({ at: { x: 0, z: 64 }, r: 14, dur: 46, label: '大手の曲輪', obj: '大手の曲輪を守れ',
        say: [['鳥居の侍', '来たぞ！']],
        waves: () => [
          { t: 6, say: ['宇喜多の侍', '大手門を破れ！　一気に揉み潰せ'], foes: () => { this.unshut(rt, 'ote_s'); sfx('knock', 0.9); return [keep('宇喜多勢の先手', S, 'ukita', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 5 }], { seek: 90 })]; } },
          { t: 12, foes: () => [keep('宇喜多勢の二の手', SW, 'ukita', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 12 }, { type: 'bow', n: 4 }], { seek: 90 })] },
          { t: 32, foes: () => [keep('宇喜多勢の三の手', S, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 4 }], { seek: 90 })] },
        ],
        noRefill: true, onEnd: (rt2) => this.delay(rt2, 15) }),
      // ① 東の隅櫓：梯子で石垣を越えた島津勢が三の丸の東へ入る（敵は一方向でない）
      // 11/17 K358 iMac n-kwatch：上限の無い戦う段は七分（b_depth.js AB_LIMIT）まで延び、act bot で隅櫓の段が128→757秒（新手の数は 22/22 で満ちたまま）・戦は1260秒で打ち切りの失敗だった。段の上限を戦の側で決める
      DP.fight({ at: { x: 16, z: 38 }, obj: '三の丸の東の隅櫓を救え', max: 90, limit: 120,
        say: [['使番', '東の隅櫓に梯子！　島津が乗り込みます！']],
      // 11/17 K168 クラウド kaito2：(20,40) は東の隅櫓の土台（x 19.6〜28.4・z 38.1〜45.9）の内で、乗り込んだ島津勢が土台の中に生まれ押し出されていた。櫓の前の空き地 (18,34) から出す
        foes: () => [keep('梯子を越えた島津勢', { x: 18, z: 34 }, 'shimazu', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 7 }, { type: 'gun', n: 2 }], { morale: 97, dmg: 0.26, seek: 30 })],
        noRefill: true, onEnd: (rt2) => this.delay(rt2, 8) }),
      // ② 破城隊：掛矢と丸太で三の丸の門を叩く寄せ手
      DP.fight({ at: { x: 0, z: 52 }, obj: '三の丸の門で破城隊を止めろ', max: 90, limit: 120,
        say: [['鳥居の侍', '門を叩いておるぞ！　破城隊じゃ']],
        foes: () => { sfx('crash', 0.8); return [keep('三の丸の門を破る破城隊', { x: 0, z: 62 }, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }], { dmg: 0.26, seek: 30 })]; },
        // 11/18 クラウドさ（K281 厚みの物差し：200秒の30〜60m の敵が5人・破城隊の十一人だけで門の外が空いた）：大手の内の土橋 (0,88) に破城隊へ続く宇喜多の二の手を構えさせ、十二秒で門へ寄せる
        later: [{ t: 12, say: ['宇喜多の侍', '破城隊に続け！　門を押し破れ'], foes: () => [keep('破城隊に続く宇喜多勢', { x: 0, z: 88 }, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }, { type: 'gun', n: 3 }], { dmg: 0.24, seek: 60 })] }],
        noRefill: true, onEnd: (rt2) => { this.delay(rt2, 8); rt2.say('使番', '大手、破られました！', 2.8); rt2.after(3, () => rt2.say('使番', '西側も敵が入りました！', 2.8)); } }),
      // ③ 最初の後退：二の丸へ。追って来る寄せ手を後ろで止める殿
      DP.move({ to: { x: NI.x, z: NI.z + 2 }, obj: '二の丸へ退け', label: '二の丸の口', r: 9, max: 70, limit: 120,
        say: [['鳥居元忠', '二の丸へ！']],
        // 11/18 クラウド（伏見の持ち主）：追い手は本人が (0,32) に来てから出て、その場（三の丸の近正の持ち場の前）を目指したので、近正の手と斬り合ったまま本人へ届かず、
        //   二の丸の口に着いた本人は25秒だれも来ないのを待った（stage_shot 200秒の通しで追い手は (0,76) へ崩れて去った）。早めに出し、行き先を二の丸の口の前に置く（殿）。
        //   本人を狙わせる（hunt）と act bot が道の途中で斬り合い、段が上限の120秒に届いて一度は倒れた。口の前で迎え撃つ形にした
        // 11/18 夜50-13（描かずの通し：追い手は (0,56) に出ても大手に残る近正の手へ向き直り (−6,82) で斬り合い、二の丸の口へ一人も来なかった）：探す輪を十歩にし、口の前の寄り所へ真っすぐ寄せる。寄り所は他の手へ引かれて動くので本人を狙わせる（新手は目の外の大手の奥 z76 に出るので、道の途中では追い付かず口の前で当たる。口まで六十歩で出すと城の西の外 (−43,39) に出て石垣を回り遅れた）。目の外へ遠ざける共通の手（guardSpawn）は大手の奥 (−5,75) へ出し、残る近正の手に討たれて一人も来なかった→本人の二十六歩後ろ（背の方で画面の外）の (0,56) にそのまま出す
        ambush: { d: 36, say: ['宇喜多の侍', '城兵が退くぞ！　付け入れ！'], foes: (rt2) => { const p = rt2.player.u.pos; return [Object.assign(keep('宇喜多勢の追い手', { x: 0, z: 56 }, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 2 }], { dmg: 0.26, seek: 10 }), { hunt: true, noGuard: true, off: { x: NI.x - p.x, z: NI.z + 7 - p.z } })]; } } }),
      // ④ 門を閉め、数秒の静けさ → 外から門を叩く音「また来る。」
      DP.rest({ dur: 10, heal: 0.5, next: { x: -14, z: -7, label: '二の丸の西' },
        fn: (rt2) => {
          this.shut(rt2, 'ni_s'); this.delay(rt2, 10);
          // 11/18 クラウド見回り：上林の手を門の静けさの間に西の口の内（本人の脇）へ引き入れる。石垣の外に残すと⑤の小早川勢がそこで斬り合ったまま崩れ、本人に届かなかった
          { const ck = rt2.flags.chikuan; if (ck && ck.count) Object.assign(ck, { anchor: { x: -19, z: -3 }, fixed: false, stay: false, noAI: true, order: 'hold' }); }
          for (const k of [4, 5.4, 6.8, 8.2]) rt2.after(k, () => sfx('knock', 0.8));
          rt2.after(5, () => rt2.say(nm(rt2), 'また来る。', 2.4));
        } }),
      // ⑤ 二の丸の西：松平家忠の持ち場へ救援。一緒に押し返す（持ち場は z=-7 の空いた帯。z=-12〜-16 には厩と蔵が建つ）
      DP.hold({ at: { x: -14, z: -7 }, r: 12, dur: 40, label: '二の丸の西', obj: '二の丸の西で家忠殿と押し返せ',
        say: [['松平家忠', '来てくれたか！　西の口が持たぬ']],
        waves: () => [
          // 11/18 クラウド見回り（245秒 874×402）：着いても敵が四十m 先の石垣の外で見えず、味方だけの「押し返す」になった。上林の手を内へ引き（④の静けさ）、寄せ手は本人の輪に届くまで崩さない（下の k01West）
          // 同じ見回り：小早川勢は石垣の外の上林の手と斬り合ったまま崩れた。上林の手を西の口の内（本人の脇）へ引き入れ、寄せ手を内へ誘う
          // 11/18 クラウド持ち主（act bot 3回とも「もっと強い奴と斬り合いたい」・名のある将の討ち取り 本人0）：西の口を破る小早川勢の先頭に侍大将（徒歩・名は伏せる）を立てる
          { t: 0, foes: () => { this.unshut(rt, 'ni_s'); rt.after(0.5, () => this.taishoHp(rt, '小早川の侍大将')); return [keep('二の丸の西へ寄せる小早川勢', { x: TAIKO.x - 20, z: TAIKO.z - 4 }, 'kobayakawa', [{ type: 'busho', n: 1, o: { name: '小早川の侍大将', hat: 'kabuto_m' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 9 }, { type: 'gun', n: 1 }], { dmg: 0.24, morale: 100 })]; } },
          { t: 18, foes: () => [keep('二の丸の口を破った宇喜多勢', { x: 0, z: 14 }, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 9 }], { dmg: 0.24 })] },
        ],
        noRefill: true, onEnd: (rt2) => { this.delay(rt2, 12); rt2.say('松平家忠', 'ここは任せろ。', 2.6); } }),
      // ⑥ 別の方向から突破：松の丸の甲賀衆が寝返り、二の丸の東へ。少し後に家忠の討死を使番が知らせる（戻らない）
      DP.hold({ at: { x: 8, z: -7 }, r: 14, dur: 42, label: '二の丸の東', obj: '二の丸の東を食い止めよ',
        say: [['鳥居の侍', '松の丸が燃えておる！　甲賀衆が寝返ったぞ']],
        waves: () => [
          { t: 2, foes: () => [keep('寝返った甲賀衆', MATSU, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 1 }], { dmg: 0.24 }), keep('長束勢', { x: MATSU.x + 6, z: MATSU.z + 4 }, 'maru', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }, { type: 'bow', n: 3 }], { dmg: 0.24 })] },
          { t: 22, say: ['使番', '松平殿、討死！'], foes: () => { this.ieFall(rt); return [keep('二の丸の西を破った小早川勢', { x: -18, z: -8 }, 'kobayakawa', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], { dmg: 0.24 })]; } },
          // 11/18 クラウド持ち主（act bot 804秒：段に入って百九秒の592秒に印「二の丸の東」へ戻っても六秒なにも起きない＝手が22秒で尽きていた）：
          //   ⑨と同じく、印の二十五m 内に寄せ手が居ない時だけ、東の口から松の丸の寝返り勢の後続（段の終わりは待たせない）
          ...[46, 56, 66, 76, 86, 96, 106].map((t) => ({ t, if: (r) => !r.army.units.some((u) => u.alive && u.team === 1 && !u.fleeing && !u.isStruct && Math.hypot(u.pos.x - 8, u.pos.z + 7) < 25),
            foes: () => [keep('東の口から入る甲賀衆の後続', { x: 21, z: -12 }, 'maru', [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }], { dmg: 0.24, seek: 30 })] })),
        ],
        noRefill: true, onEnd: (rt2) => this.delay(rt2, 12) }),
      // ⑦ 本丸へ退く
      // 11/18 クラウドさ（act bot 915秒）：着きの輪が八m だと本丸の口 (0,-34) の外で「着いた」になり、⑧で門を閉めると本人が外に残った。
      //   ⑨⑩を二の丸の西 (−23,3)・本丸の西の外 (−23,−31) で過ごし、⑪の裏口へ寄れず打ち切りまで立った。着きは口を入った内で
      DP.move({ to: { x: HON.x, z: HON.z + 4 }, obj: '本丸へ退け', label: '本丸の口', r: 5, max: 70, limit: 120,
        say: [['鳥居元忠', '本丸へ。門を閉めよ']],
        ambush: { d: 20, say: ['島津の侍', '残るは本丸ぞ！'], foes: () => [keep('二の丸を乗っ取った島津勢', { x: 0, z: -14 }, 'shimazu', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }])] } }),
      // ⑧ 本丸だけが残る。援軍は来ない。内藤の大旗が西の丸に倒れている
      DP.rest({ dur: 14, heal: 0.6, next: { x: HON.x, z: HON.z - 1, label: '本丸' },
        fn: (rt2) => {
          this.shut(rt2, 'hon_s'); this.burn(rt2); this.naitoFall(rt2);
          for (const nn of ['松平近正', '上林竹庵']) this.fall(rt2, nn);
          this.fallAll(rt2, [rt2.flags.chika, rt2.flags.chikuan]);
          rt2.after(1, () => rt2.say('若い兵', '援軍は来ますか？', 2.6));
          rt2.after(5.5, () => rt2.say('使番', '援軍は……ございませぬ。', 2.8));
          rt2.after(8.8, () => rt2.say('鳥居元忠', 'そうか。', 2.2));
          for (const k of [10, 11.5, 13]) rt2.after(k, () => sfx('knock', 0.9));
          // 11/18 クラウド kaito2（act bot 0906：557秒 印「本丸」に着いて六秒なにも起きない＝8.8秒の「そうか。」から段の終わりの14秒まで台詞が無かった）：門を叩く音に合わせて一言
          rt2.after(11.6, () => rt2.say('鳥居の侍', '門を破りに来ます。構えよ！', 2.2));
        } }),
      // ⑨ 本丸：敵が中へ入る。元忠も前に出る。「殿、奥へ！」に退かない
      DP.hold({ at: { x: HON.x, z: HON.z - 1 }, r: 12, dur: 36, label: '本丸', obj: '本丸で最後まで持ちこたえろ',
        say: [['鳥居の侍', '殿、奥へ！'], ['鳥居元忠', '退かぬ。']],
        waves: () => [
          // 11/18 クラウド持ち主（act bot 661秒「簡単すぎる・もっと強い奴と斬り合いたい」・名のある将の討ち取り0）：本丸へ破って入る一の手に、宇喜多の侍大将（徒歩・名は伏せる）を立てる
          // 11/18 クラウドさ（act bot 582秒：印「本丸」に着いても六秒なにも起きない）：一の手は二の丸の内 (0,-16) でなく、本丸の口の前の土橋 (0,-23) から。門が破れてすぐ十m 先に寄せ手が見える
          // 11/18 クラウド持ち主（act bot 3回 名のある将の討ち取り0：1秒の POSLOG で侍大将は組の後ろ (−14,33) に生まれ、本丸の口の南 (5,−18) で止まり、本人に一度も届かず hp456 のまま残った）：
          //   侍大将だけは破れた門の内 (0,−29) の先頭に立てる。十六歩内の本人へ共通の一騎打ちで挑む
          { t: 1, foes: () => { this.unshut(rt, 'hon_s'); sfx('crash', 0.8); rt.after(0.3, () => this.taishoAt(rt)); return [keep('本丸へ破って入る宇喜多の侍大将', { x: 0, z: -29 }, 'ukita', [{ type: 'busho', n: 1, o: { name: '宇喜多の侍大将', hat: 'kabuto_m' } }], { dmg: 0.28, mass: 0 }), keep('本丸へ寄せる宇喜多勢', { x: 0, z: -23 }, 'ukita', [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }], { dmg: 0.28 })]; } },
          // 11/18 18:10 UTC クラウド持ち主（act bot 2回の倒れの傷に長束勢 25・足軽の一太刀25＝命の四分の一）：この段の他の手と同じ一太刀 0.28 に（数は同じ）
          { t: 14, foes: () => [keep('西の丸から寄せる長束勢', { x: -14, z: -27 }, 'toyotomi', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }], { dmg: 0.28 }), keep('東から寄せる島津勢', { x: 16, z: -27 }, 'shimazu', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 2 }], { dmg: 0.28 })] },
          { t: 24, foes: () => [keep('本丸へ寄せる小早川勢', { x: 8, z: -18 }, 'kobayakawa', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }, { type: 'bow', n: 3 }], { dmg: 0.2 })] },
          // 11/18 クラウド kaito2（act bot 6回で2回この段で倒れた：0256 は小早川の足軽の一太刀が25ずつ四つ・0241 は新手と侍）：三の手の小早川の刃を0.28→0.2。数は減らさない
          // 11/18 夜50-13（act bot 668秒：印「本丸」に着いても六秒なにも起きない＝三の手までが崩れた後、段の残りに寄せ手が居ない）：⑩と同じく、本丸の印の二十五m 内に寄せ手が居ない時だけ、破れた口から次の手
          // 11/18 クラウド持ち主（act bot 803秒：段に入って九十七秒の711秒に印「本丸」へ戻っても六秒なにも起きない＝空きの時の手が72秒で尽きていた）：空きの時の手を百二十秒まで続ける
          //   （直した後の act bot 715秒：段に入って六十五秒の538秒に同じ＝56秒と72秒の間が空いていた）：空きを見るのを八秒ごとに
          ...[40, 48, 56, 64, 72, 80, 88, 96, 104, 112].map((t) => ({ t, if: (r) => !r.army.units.some((u) => u.alive && u.team === 1 && !u.fleeing && !u.isStruct && Math.hypot(u.pos.x - HON.x, u.pos.z - (HON.z - 1)) < 25),
            foes: () => [keep('本丸へ破って入る宇喜多の新手', { x: 0, z: -29 }, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], { dmg: 0.22, seek: 30 })] })),
        ],
        noRefill: true, onEnd: (rt2) => { this.delay(rt2, 13); rt2.player.treatWounds(0.8); } }),
      // ⑩ 最後の防衛：元忠と並んで戦う。周りの味方が一人ずつ倒れる
      // 11/17 K358：act bot は元忠殿の旗の十一m までしか寄れず（天守の際の石垣）、この段で十八分の打ち切りまで止まった。輪を十四m に・上限を付ける
      DP.hold({ at: { x: -4, z: -49 }, r: 14, dur: 30, limit: 90, label: '元忠殿の旗', obj: '本丸で最後まで持ちこたえろ',
        say: [['鳥居の侍', 'ここまでですか。'], ['古参の侍', 'まだだ。殿がおられる。']],
        waves: (rt2) => {
          this.thin(rt2);
          return [
            { t: 3, foes: () => [keep('天守へ寄せる宇喜多勢', { x: 2, z: -36 }, 'ukita', [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 6 }], { dmg: 0.24, seek: 30 })] },
            { t: 15, foes: () => [keep('天守へ寄せる小早川勢', { x: 12, z: -38 }, 'kobayakawa', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], { dmg: 0.24, seek: 30 })] },
            // 11/18 クラウドさ（act bot 785秒：⑨から遅れて旗に着くと、一・二の手は崩れて逃げた後で六秒なにも起きない）：旗の二十五m 内に寄せ手が居ない時だけ、本丸の口から次の手
            // 11/18 クラウド持ち主（act bot POSLOG：⑩の 668〜711秒、印の十六歩に立っても寄せ手は逃げる二人だけで四十秒なにも起きない＝空きの手が66秒で尽きていた）：⑨と同じく八秒ごとに上限の九十秒まで
            ...[30, 38, 46, 54, 62, 70, 78, 86].map((t) => ({ t, if: (r) => !r.army.units.some((u) => u.alive && u.team === 1 && !u.fleeing && !u.isStruct && Math.hypot(u.pos.x + 4, u.pos.z + 49) < 25),
              foes: () => [keep('天守へ寄せる宇喜多の新手', { x: 0, z: -31 }, 'ukita', [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 5 }], { dmg: 0.24, seek: 30 })] })),
          ];
        },
        noRefill: true, onEnd: (rt2) => {
          this.delay(rt2, 12);
          // 11/18 クラウド（伏見の持ち主）：act bot が最後の段（裏口から抜ける）で倒れた（811秒・cloud-49）。⑩の新手（seek 30）が残ったまま本人を追い、
          //   抜ける道で背中から斬られた。史実どおり寄せ手は元忠の旗へ群がる：本丸の内に残る寄せ手を旗の前へ寄せ、本人へは四歩より近い時だけ構える。手当ては⑨と同じ
          for (const g of rt2.army.groups) {
            if (g.team !== 1 || g.fixed || g.routed || !g.count) continue;
            if (!g.units.some((u) => u.alive && Math.hypot(u.pos.x - HON.x, u.pos.z - HON.z) < 40)) continue;
            Object.assign(g, { anchor: { x: -3, z: -42 }, order: 'hold', aggro: 4, seekRange: 4, focus: null, noRout: true });
          }
          rt2.player.treatWounds(0.6);
          rt2.say('鳥居元忠', 'ここでよい。', 2.6);
          rt2.after(3, () => rt2.say('鳥居元忠', '行け。', 2.2));
        } }),
      // ⑪ 脱出：正門でなく本丸の裏の崩れた石垣から、数人で城の外へ。振り返ると元忠の旗の周りに敵が集まる
      DP.move({ to: ESC, obj: '本丸の裏口から城を抜けよ', label: '城の外', r: 8, max: 90,
        say: [['鳥居の侍', 'こちらへ！　裏の石垣が崩れております']],
        ambush: { t: 4, foes: () => { this.lastStand(rt); return []; } } }),
    ];
    const LBL = { 0: '大手の曲輪', 1: '東の隅櫓', 2: '三の丸の門', 3: '二の丸の口', 5: '二の丸の西', 6: '二の丸の東', 7: '本丸の口', 9: '本丸', 10: '元忠殿の旗', 11: '城の外' };
    stages.forEach((s, i) => { s.lbl = LBL[i] || ''; });
    stages[3].k01R = 8; stages[7].k01R = 4;   // 退く段の口の内の輪（二の丸の口 z<4・本丸の口 z<−38）
    depthStart(rt, { faction: 'ukita', flag: 'ukita', armor: WEST.armor, friends: () => [F.mine, ...(F.ieAway ? [] : [F.ie]), ...(F.sanGuard ? [] : [F.chika])], scale: 2.2, backing: false, fixedSpawn: true, dmg: 0.38, botSeek: 40,
      routeFight: true, withdrawWay: fushimiWay,
      botFoeAllowed: (u) => !!F.dp?.cur?.groups.includes(u.group),
      // 平面の輪に入っただけでは待たない。塀の外・石垣の下で
      // 立ち止まると、在陣も到着の記憶も付かず段が終わらない。
      idleWait: (r, C) => C.s.kind === 'hold' && C.k01InPlace && !!C.present },
    stages.map((s, i) => {
      if (s.kind === 'rest' && s.next) { const st = s.start; s.start = (r, C, m, ctx) => { st(r, C, m, ctx); r.flags.restNext = s.next; }; }
      return requirePresence(s, i === 6 ? ['寝返った甲賀衆', '長束勢'] : null);
    }), (rt2) => this.win(rt2));
  },

  // 本丸へ破って入る宇喜多の侍大将を、破れた門の内の先頭へ（組の後ろに生まれて門の外で止まった）
  taishoAt(rt) {
    const u = rt.army.units.find((x) => x.alive && x.name === '宇喜多の侍大将'), W = rt.world;
    if (!u || !W) return;
    // 11/18 クラウド持ち主（act bot の記録：侍大将が組の後ろ (21,9) から破れた門の内 (0,−29) へ一息で飛ぶ＝門の前で本人の目の前に湧いた）：
    //   侍大将は自分だけの組で門の内 (0,−29) に生まれる（keep の一人組）。ここで動かさず、堅さと崩れないことだけを決める
    // 11/18 クラウドさ（act bot：本人の二〜三m 内に五分いても hp456→270 で残り、名のある将の討ち取り0のまま⑪へ）：本丸の段の長さ（約二百秒）で討てる堅さに
    //   共通の名のある将の一・五倍（lord_retinue.js）が後から掛かり三九〇になったので、その一度きりの印も付ける
    u._retHp = true; u.maxHp = Math.min(u.maxHp, 260); u.hp = Math.min(u.hp, u.maxHp);
    //   深手で組ごと崩れて城の外へ逃げ去り（hp60 で (0,14)→(−11,63)）討てなかった＝本丸へ破って入った組は崩れずに斬り死にする
    if (u.group) u.group.noRout = true;
    // 11/18 クラウドさ 続き18（cloud の act bot：本人の刃で hp34 まで減っても討たれず本丸の内を歩き回った）：一人組の侍大将は「供回りを失った将」（officer.js officerBroken）
    //   として持ち場の六歩奥へ退き、二歩へ追い詰められるまで刀を振るわなかった。本丸へ破って入った侍大将は退かず斬り結ぶ
    u.allyFight = true;
  },
  // 11/18 クラウドさ（act bot：⑤の小早川の侍大将は hp456 のまま⑤の終わりに西へ退き、本人の討ち取りにならない回が多い）：段の四十秒で討てる堅さに
  taishoHp(rt, name) {
    const u = rt.army.units.find((x) => x.alive && x.name === name);
    if (u) { u._retHp = true; u.maxHp = Math.min(u.maxHp, 260); u.hp = Math.min(u.hp, u.maxHp); u.allyFight = true; }   // 続き18：供回りが討たれても退かず斬り結ぶ
  },
  // 家忠は二の丸の西で果てる（使番が知らせる。主人公は見ていない）
  ieFall(rt) {
    const F = rt.flags;
    this.fall(rt, '松平家忠');
    this.fallAll(rt, [F.ie]);
  },
  // 最後の防衛：元忠の本陣も手勢も、数人を残して倒れていく（一人ずつ）
  thin(rt) {
    const F = rt.flags;
    const list = [];
    for (const g of [F.motochika, F.mine]) if (g) { let keepN = g === F.motochika ? 3 : 2; for (const u of g.units) if (u.alive && u.name !== '鳥居元忠') { if (keepN > 0) keepN--; else list.push(u); } }
    list.forEach((u, k) => rt.after(1 + k * 1.6, () => { if (u.alive && !F.ending) { u.civ = true; rt.army.kill(u, null); } }));
    if (F.motochika) F.motochika.anchor = { x: -5, z: -51 };
  },
  // 脱出の間：元忠の旗の周りに寄せ手が集まる（雑賀の鈴木孫三郎＝重朝が対峙する）
  lastStand(rt) {
    const F = rt.flags;
    if (F.lastG) return;
    this.magoichi(rt);
    revealName(rt, '雑賀孫一');
    rt.say('雑賀孫一', '雑賀の鈴木孫三郎、見参！', 2.6);
    if (F.magoG) Object.assign(F.magoG, { anchor: { x: 4, z: -44 }, facing: Math.PI });
    F.lastG = enemyGroup(rt, { fixed: true, faction: 'yatagarasu', name: '元忠の旗に群がる寄せ手', anchor: { x: -3, z: -44 }, facing: Math.PI, order: 'hold', aggro: 2, width: 8, morale: 100, noRout: true },
      dress([{ type: 'samurai', n: 6 }, { type: 'gun', n: 4 }], { ...WEST, flag: 'yatagarasu' }));
    F.lastG.noAI = true; F.lastG.stay = true; F.lastG.civ = true; F.lastG.dmgMult = 0.26;
    for (const u of F.lastG.units) u.civ = true;
    let keepN = 2;
    for (const u of (F.mine?.units || []).slice()) if (u.alive) { if (keepN > 0) { keepN--; continue; } u.civ = true; rt.army.kill(u, null); }
  },

  // 段の間で果てる城方の将（使番の「討たれた」は重ねない）
  // 三の丸・太鼓の丸の手の者も持ち場で果てる（大将だけ倒すと、残った兵を追って本丸の寄せ手が三の丸へ引き返した）
  fallAll(rt, gs) {
    for (const g of gs) { if (g) g.civ = true; for (const u of (g?.units || []).slice()) if (u.alive) { u.invuln = false; u.civ = true; rt.army.kill(u, null); } }
  },
  fall(rt, n) {
    const u = rt.army.units.find((x) => x.name === n && x.alive);
    if (u) { u.invuln = false; u.civ = true; rt.army.kill(u, null); }
  },
  // 三の丸を任された家忠・近正は、主人公の二の丸への移動に付いて行かない。
  guardSan(rt) {
    const F = rt.flags;
    if (F.sanGuard) return;
    F.sanGuard = true;
    for (const [g, x] of [[F.ie, -8], [F.chika, 8]]) if (g) {
      Object.assign(g, { anchor: { x: SAN.x + x, z: SAN.z + 4 }, order: 'hold', fixed: true,
        noAI: true, stay: true, aggro: 10, facing: 0, focus: null });
    }
  },
  // 内藤家長は「西の丸で死ぬ」と言って西の丸の持ち場へ戻る（主人公と本丸へは来ない。⑤で西の丸が破られて討死）
  naitoWest(rt) {
    const F = rt.flags, g = F.nai;
    if (F.naiWest || !g) return;
    F.naiWest = true;
    Object.assign(g, { anchor: { x: -37.5, z: -52.5 }, order: 'hold', fixed: true, aggro: 6, facing: Math.PI / 2 });
  },
  // ⑤：西の丸が破られ、家長と手の者は西の丸で果てる（寄せ手が西の丸に留まって組み合わず、本丸へ向かう）
  naitoFall(rt) {
    const F = rt.flags;
    this.naitoWest(rt);
    // 隊にも civ を付ける（付けないと、果てる家長の手が「味方の兵が退き始めた」を八秒おきに四度出した）
    if (F.nai) F.nai.civ = true;
    for (const u of (F.nai?.units || []).slice()) if (u.alive) { u.invuln = false; u.civ = true; rt.army.kill(u, null); }
    if (F.naiFlag) { F.naiFlag.rotation.z = 1.4; F.naiFlag.position.y += 0.4; }
  },

  // 雑賀孫一と旗本：二の丸の北の脇から本丸を向いて鉄砲衆を下知する（馬上・討てない）。土橋の道は塞がない
  magoichi(rt) {
    const F = rt.flags;
    if (F.magoG) return;
    F.magoG = enemyGroup(rt, { fixed: true, faction: 'yatagarasu', name: '雑賀孫一の旗本', anchor: { x: 13, z: -16 }, facing: Math.PI, order: 'hold', aggro: 2, width: 6, morale: 100, noRout: true },
      // 共通の負傷処理は、討たれない印だけの敵将を本人の一撃で討つ。
      // 孫一は元忠の最期まで持ち場に残り、戦後も生きる。
      dress([{ type: 'busho', n: 1, o: { name: '雑賀孫一', hat: 'kabuto_m', horse: true, invuln: true, mustLive: true, onWound: () => {} } }, { type: 'samurai', n: 6, o: { keep: true } }, { type: 'gun', n: 2 }], { ...WEST, flag: 'yatagarasu' }));
    F.magoG.noAI = true; F.magoG.stay = true;
    // 11/18 クラウドさ：討てない馬上の孫一の一太刀は命の二割（60）のまま三度で本人が倒れていた（act bot 878秒）。ほかの寄せ手と同じ重さに
    F.magoG.dmgMult = 0.26;
  },

  // 長束・前田玄以の屋敷に火（七月十九日の出撃）
  burnYashiki(rt) {
    const F = rt.flags;
    if (F.yashikiBurned) return;
    F.yashikiBurned = true;
    if (rt.world.addFire) for (const [x, z] of HOUSES) rt.world.addFire(x, z, { size: 2.2, h: 2 });
  },

  // 寄せ手の陣は日付の段で着く（k=1：宇喜多。k=2：小早川・島津）
  camps(rt, k) {
    const F = rt.flags;
    // 軽い備も本物の陣と同じ日まで待つ。後から足した遠景だけが
    // 家康との別れの時点から全軍を並べ、段々に囲まれる流れを壊していた。
    for (const s of F.depth?.B?.sonae || []) {
      const first = s.id === 'ukita1' || s.id === 'ukita2' || s.id === 'ukita';
      if (k >= (first ? 1 : 2)) s.arrive = 0;
    }
    if (k >= 1 && !F.ukitaCamp) F.ukitaCamp = camp(rt, '宇喜多秀家の本陣', CAMPS[0], 'ukita', '宇喜多秀家', [{ type: 'samurai', n: 16 }, { type: 'gun', n: 4 }], Math.PI, true);
    if (k >= 2 && !F.kobaCamp) {
      F.kobaCamp = camp(rt, '小早川秀秋の陣', CAMPS[1], 'kobayakawa', '小早川秀秋', [{ type: 'samurai', n: 10 }, { type: 'ashigaru', n: 6 }], Math.PI * 0.6);
      F.shimaCamp = camp(rt, '島津義弘の陣', CAMPS[2], 'shimazu', '島津義弘', [{ type: 'samurai', n: 8 }, { type: 'gun', n: 6 }], -Math.PI * 0.8);
      F.moriCamp = camp(rt, '毛利秀元の陣', CAMPS[4], 'mori', '毛利秀元', [{ type: 'samurai', n: 8 }, { type: 'gun', n: 4 }], -Math.PI * 0.5);
    }
    // 七月二十九日：石田三成が伏見に着き、総攻めを下知する（床几に座る。旗は大一大万大吉）
    // 長束正家（generals_toyo_toku 1：必須）：屋敷を焼かれた長束の陣は大手の南西。松の丸の甲賀衆の内応を仕掛けた（『落穂集』）
    if (k >= 2 && !F.natsukaCamp) F.natsukaCamp = camp(rt, '長束正家の陣', { x: -46, z: 186 }, 'toyotomi', '長束正家', [{ type: 'samurai', n: 8 }, { type: 'gun', n: 4 }], Math.atan2(46, -186));
    if (k >= 3 && !F.ishidaCamp) F.ishidaCamp = camp(rt, '石田三成の陣', CAMPS[3], 'ishida', '石田三成', [{ type: 'samurai', n: 10 }, { type: 'gun', n: 4 }], Math.atan2(-CAMPS[3].x, -CAMPS[3].z), true);
  },

  // 松の丸の甲賀衆が寝返る：城方の持ち場から消え、同じ所から「寝返った甲賀衆」として寄せる（④の波）
  turnKoka(rt) {
    const F = rt.flags;
    if (F.kokaTurned) return;
    F.kokaTurned = true;
    // 下知の深尾清十郎は寝返らず、内応の火の中で果てる（寝返りの組へは入れない）
    this.fall(rt, '深尾清十郎');
    for (const u of (F.koka?.units || []).slice()) if (u.alive) rt.army.despawn(u);
  },

  // 八月一日の昼（午の刻）：火はまず松の丸から。まだ昼の光で、本丸と天守は燃えていない
  burnMatsu(rt) {
    const F = rt.flags;
    if (F.matsuBurned) return;
    F.matsuBurned = true;
    // 火は石垣の上の建物の高さで燃やし、黒い煙の柱を高く上げる（地の高さの小さな火は石垣に隠れ、二の丸から火も煙も見えなかった。critic60）
    if (rt.world.addFire) for (const [x, z, s] of [[MATSU.x, MATSU.z, 3.2], [MATSU.x + 8, MATSU.z + 4, 2.6], [MATSU.x - 7, MATSU.z - 5, 2.4]]) rt.world.addFire(x, z, { size: s, h: 4, blackSmoke: true });
    if (rt.world.addSmokeColumn) rt.world.addSmokeColumn(MATSU.x, rt.world.heightAt(MATSU.x, MATSU.z) + 8, MATSU.z, { size: 3.4, black: true });
  },
  burn(rt) {
    const F = rt.flags;
    this.burnMatsu(rt);
    if (F.burned) return;
    F.burned = true;
    rt.world.setTime('dusk', true);   // 八月一日の夕へ時が飛ぶ段。移ろわせずに夕の光へ
    // 天守は石垣の台（4）の上に五重。火を各重の高さに置き、天守と本丸の櫓が燃え上がって見えるように（地の高さの火だけで、天守が燃えていなかった。critic60）
    for (const [x, z, s, h] of [[NI.x - 12, NI.z - 6, 1.8, 2], [HON.x + 13, HON.z - 6, 2.2, 2], [-9, -53, 3.4, 6], [-7, -51, 3, 10], [-10, -55, 2.6, 14], [-16, -38, 2.4, 6], [16, -38, 2.4, 6]]) {
      if (rt.world.addFire) rt.world.addFire(x, z, { size: s, h, blackSmoke: h > 2 });
    }
    if (rt.world.addSmokeColumn) rt.world.addSmokeColumn(-9, rt.world.heightAt(-9, -53) + 20, -53, { size: 4, black: true });
  },

  // 城の外から落ちた伏見城を見る：元忠の旗の周りに敵、元忠討死、徳川の旗が下がり寄せ手の旗が上がる。使番「徳川本隊は無事、東へ。」
  // 落城の瞬間に負けの札は出さない（任務達成）
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    this.burn(rt);
    this.lastStand(rt);
    rt.setPhase('end');
    rt.objDone('main');
    const dl = Math.round(Math.max(F.delay || 0, 60));
    rt.award((t) => { t.main = true; t.special = { label: `時を稼いだ（${dl}／100）`, pts: 20 + Math.round(dl / 5) }; }, '伏見城で時を稼いだ');
    rt.player.u.invuln = true;
    rt.after(0.5, () => rt.say('雑賀孫一', '腹を召されるまで、お待ち申す。', 2));
    rt.after(2.5, () => {
      this.fall(rt, '鳥居元忠');
      sfx('fall', 0.8);
      for (const f of F.tkFlags || []) f.visible = false;
      for (const [x, z] of [[-8, -46], [8, -46], [0, -8], [-12, 28], [12, 28]]) rt.scene.add(nobori(rt.world, x, z, 'ukita', 6));
    });
    rt.after(3.5, () => rt.banner('鳥居元忠、自刃', '孫一が首を取り、城方の多くが本丸で果てた'));
    rt.after(6.5, () => rt.banner('血天井', '城兵の血に染まった床板は、のちに京の寺々へ伝わる'));
    rt.after(8.5, () => { sfx('messenger', 0.7); rt.say('使番', '徳川本隊は無事、東へ。', 3.4); });
    // K306 の続き（11/19 クラウド k365-cloud-42）：元忠は籠城の前に倅の忠政へ遺言の書状を残し、主のために城を枕に死ぬのが本望と説いた（「鳥居元忠遺言状」）
    rt.after(15.5, () => { if (!rt.over) rt.say('古参の侍', '殿は籠る前、倅の忠政様へ書き置きを残された。主のために城を枕に死ぬは本望、と', 3.6); });
    F.k01s?.ending?.();   // 「伏見城　落城」→「任務達成」（k01_fushimi/yose.js）
    rt.finish({ scriptedEnd: true }, 24);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    depthTick(rt, dt);
    F.k01s?.tick?.(dt);
    const D = F.dp;
    const i = D && D.on ? D.i : -1;
    // 11/18 クラウドさ 続き16（act bot：⑤の小早川の侍大将は二の丸の西の口の外 (−30,−10) で本人の三十〜四十歩先に立ち、⑨の宇喜多の侍大将は本人の二〜十歩にいても
    //   本人が組の足軽ばかり斬って本人の傷0のまま、どちらも討たれず「もっと強い奴と斬り合いたい」）：稲葉山と同じく、侍大将が自ら本人へ寄って斬り掛かる。
    //   本人が深手の時・崩れた組・段の高さが違う時は寄らない。石垣の向こうなら、まず西の口・本丸の口の内へ入る
    if (!rt.over && !(F.taiSeekAt > rt.t)) {
      F.taiSeekAt = rt.t + 1;
      const P = rt.player.u;
      if (P?.alive && !P.downed && !P.dying && P.hp > P.maxHp * 0.35) for (const u of rt.army.units) {
        if (!u.alive || u.gone || u.fleeing || u.woundOut || u.team === P.team || !/^(小早川|宇喜多)の侍大将$/.test(u.name || '')) continue;
        if (!u.group || u.group.routed || rt.army.duel?.foe === u) continue;
        const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
        // 小早川の侍大将は西の外で上林・家忠の手を追って (−46,24) まで流れ、本人の五十歩先で段を終えた（同じ act bot の次の回）。二の丸の段の間は西の外の遠くからも口へ戻す
        const ko = u.name[0] === '小', outW = ko && u.pos.x < -24 && P.pos.x > -24;
        if (d > (outW && i >= 5 && i <= 6 ? 75 : 36) || d < 2.5 || Math.abs(u.pos.y - P.pos.y) > 4) continue;
        if (outW || rt.army.wallBetween(u.pos, -1, P.pos, false)) {
          //   西の口 (−24,−12) の外の前 (−29,−12) を通ってから内へ（斜めに向かうと口の北の石垣に当たる）
          const g = ko ? (outW ? (u.pos.x < -27 && Math.abs(u.pos.z + 12) > 2.5 ? { x: -29, z: -12 } : { x: -20, z: -12 }) : null) : (u.pos.z > -34 && P.pos.z < -34 ? { x: 0, z: -38 } : null);
          if (g) { u.target = null; u.moveTo = g; u.aiT = 0.8; }
          continue;
        }
        u.target = P; u.moveTo = { x: P.pos.x, z: P.pos.z }; u.aiT = 0.8;
      }
    }
    // 段の替わり目：外郭を退く時、近正は三の丸に残り、家忠は二の丸の西の持ち場へ先に回る
    if (i !== F.lastI) {
      F.lastI = i;
      // 別れから包囲、内応、落城へ時が飛ぶ所は日付を知らせる。
      if (STAGE_DATES[i]) { F.k01Date = STAGE_DATES[i][0]; rt.banner(...STAGE_DATES[i]); }
      if (i === 3) this.guardSan(rt);
      if (i === 3 && F.ie && !F.ieAway) { F.ieAway = true; Object.assign(F.ie, { anchor: { x: -17, z: -7 }, order: 'hold', fixed: true, stay: true, noAI: true, aggro: 10, facing: Math.PI / 2, focus: null }); }
      if (D?.cur?.s.kind !== 'rest') F.restNext = null;
    }
    // 守る段の間、持ち場で戦っていれば時が稼げる（内部の値。画面には出さない）
    if (D?.cur?.s.kind === 'hold' && D.cur.k01Engaged && D.cur.k01InPlace) this.delay(rt, dt * 0.12);
    // 本丸の段からの寄せ手は元忠を目当てに本丸へ寄せる
    if (i >= 9 && D.cur && F.toriiU) for (const g of D.cur.groups) if (!g._k01) { g._k01 = true; g.focus = F.toriiU; }
    // 守る段の刻を四十秒過ぎても、塀の外で詰まった寄せ手の残りが段を止めていた。残りは崩れて退く
    if (i >= 0 && D.cur && D.cur.s.kind === 'hold' && D.cur.k01Engaged && rt.t - D.cur.t0 > D.cur.s.max - 35 + 40) for (const g of D.cur.groups) if (g.count && !g.routed) { g.noRout = false; g.morale = 0; }
    // 石田の着陣は七月二十九日の知らせとそろえる。開戦直後に
    // 全陣を出すと、二十二日の段から石田三成が城を囲んでしまう。
    if (F.begun) this.camps(rt, i >= 3 ? 3 : i >= 1 ? 2 : 1);
    // 毎コマ配列を作らない（11/18 クラウド持ち主：重さ）
    for (const key of CAMP_KEYS) { const g = F[key]; if (g && g.count && g.order !== 'hold') { g.order = 'hold'; g.anchor = { ...g._home }; } }
    const holding = i >= 0 && D.cur && D.cur.s.kind === 'hold';
    if (F.mine) F.mine.stay = !!holding;
    if (!F.ieAway && F.ie) F.ie.stay = !!holding;
    if (!F.sanGuard && F.chika) F.chika.stay = !!holding;
    // 城方は退かない（「味方の兵が退き始めた」を出さない）
    if (i >= 5) for (const g of rt.army.groups) if (g.team === 0 && !g.civ && g.count) g.morale = Math.max(g.morale ?? 100, 70);
    // 築山の大筒：包囲から落城まで、昼夜に城を撃つ
    if (F.begun && rt.t > (F.cannonT || 0)) {
      F.cannonT = rt.t + 7 + Math.random() * 5;
      const y = rt.world.heightAt(TSUKIYAMA.x, TSUKIYAMA.z) + 3;
      sfx('thunder', 0.55);
      rt.army.smoke(TSUKIYAMA.x + (Math.random() - 0.5) * 8, y, TSUKIYAMA.z - 2, 0, -1, 1);
    }
    // 城方の鉄砲：守る段の間、塀と櫓から寄せ手へ撃ち下ろす煙。内藤家長の鉄砲隊は西の丸で最後まで射撃の線を保つ
    if (holding && rt.t > (F.wallGunT || 0)) {
      F.wallGunT = rt.t + 2.5 + Math.random() * 3;
      const spots = i <= 2 ? [[-24, 42], [24, 42], [-12, 46], [12, 46], [-20, 60], [20, 60]] : i <= 6 ? [[-20, 4], [20, 4], [24, -12], [-30, -44], [-36, -42]] : [[-16, -38], [16, -38], [-10, -34], [10, -34]];
      for (let k = 0; k < 2; k++) {
        const [x, z] = spots[Math.floor(Math.random() * spots.length)];
        rt.army.smoke(x, rt.world.heightAt(x, z) + 4.5, z, 0, 1, 1);
      }
      sfx('volley', 0.35);
    }
    // 11/18 クラウド持ち主（act bot「簡単すぎる」・討ち取り31・倒れ0）：守る段（大手の曲輪・二の丸の西・二の丸の東）で、
    //   本人から二十歩内に来た寄せ手の組を一つだけ本人へ向ける（根白坂・木津川口の huntPlayer と同じ形）。数と強さは変えない
    // 11/18 07:55 クラウド持ち主（act bot 3回：⑩元忠殿の旗の段で本人の三十m 内に寄せ手十六人・最も近い十三m なのに本人の討ち取り0。
    //   寄せ手は全部元忠を目当て（focus）にし、旗本が先に受けて本人へ来なかった）：⑩でも組を一つだけ本人へ向ける（元忠目当ての組も選べる）
    //   次の回（act bot 0758）は⑨本丸の段二百二十秒で本人の討ち取り0だった→⑨も同じく（本人の命が六割半を切れば放す）
    if (i === 0 || i === 5 || i === 6 || i === 9 || i === 10) huntPlayer(rt, F, dt, false, i >= 9 ? F.toriiU : null); else if (F._hunter) huntPlayer(rt, F, dt, true);
    if (i >= 11 && !F.magoNamed) { F.magoNamed = true; revealName(rt, '雑賀孫一'); }
    // 甲賀衆の内応の火（二の丸の東の段）→ 本丸だけが残った時に天守へ火が回る
    if (i >= 6) { this.turnKoka(rt); this.burnMatsu(rt); }
    if (i >= 8) this.burn(rt);
    // 本丸の段：元忠も前へ出て戦う（守られる大将でなく、一緒に最後まで残る）
    if (i >= 9 && !F.toriiOut && F.motochika) { F.toriiOut = true; if (F.toriiU) F.toriiU._crouch = false; F.motochika.stay = false; F.motochika.anchor = { x: HON.x, z: HON.z }; F.motochika.aggro = 16; }
    //   11/18 クラウドさ（act bot 714秒：⑨の567秒、本陣が本丸の芯 (0,−46) に立ち、口 (0,−29) から入った寄せ手と本人の斬り合いを二十秒見ていた＝aggro 8 では十七m 先へ届かない）：本丸の内（十六m）へ入った寄せ手には本陣も出て斬り結ぶ
    //   続き21（act bot 804秒：642s 本陣が (8,−50) で塀を挟まない二十五m 内の寄せ手を前に二十秒止まった＝hold・fixed の隊は芯からの aggro 十六 の外へ出ない）：本丸の段は一秒おきに、塀を挟まない二十四m 内の寄せ手へ手の空いた旗本を向ける
    //   続き22（act bot 787秒：481〜617s の二の丸・本丸へ退く段でも、本陣が (−2,−43) で塀を挟まない寄せ手を前に二十秒ずつ四度止まった）：二の丸の段から同じ向けを効かせる
    if (i >= 5 && F.motochika?.count && rt.t > (F.honSeekT || 0)) {
      F.honSeekT = rt.t + 1;
      const c = F._honC || (F._honC = { x: 0, y: 0, z: 0 });
      F.motochika.center(c); c.y = rt.world.heightAt(c.x, c.z);
      //   続き23（act bot 744秒：653s 本陣が (−3,−49) で二十秒止まった＝見張りは二十五m で数えるのに向けは二十四m・z −30 まで）：三十m・z −28 まで見る（塀を挟めば出ないのは同じ）
      const e = rt.army.nearestEnemy({ pos: c, team: F.motochika.team }, 30, (o) => !o.fleeing && !o.downed && o.pos.z < -28);
      if (e && !rt.army.wallBetween(c, F.motochika.team, e.pos)) for (const u of F.motochika.units) if (u.alive && !u.target && !u.downed && u !== F.toriiU) { u.target = e; u.moveTo = { x: e.pos.x, z: e.pos.z }; u.aiT = 0.8; }
    }
    //   11/18 クラウド kaito2（続き22の残り：三の丸に残った松平近正の手が (14,31) で寄せ手を前に二十秒ずつ三度止まった＝guardSan の noAI・aggro 十 の外の寄せ手へ出ない）：
    //   三の丸・二の丸の西に残った家忠・近正の手も、一秒おきに塀を挟まない二十m 内の寄せ手へ手の空いた者を向ける（持ち場の輪は fixed のまま）
    if (i >= 3 && rt.t > (F.sanSeekT || 0)) {
      F.sanSeekT = rt.t + 1;
      const c = F._sanC || (F._sanC = { x: 0, y: 0, z: 0 });
      //   本丸の段（⑨⑩）では手勢の残りも同じ（act bot 0901：手勢の残り一人が本丸 (−3,−50) で寄せ手を前に二十秒ずつ四度止まった）
      for (const g of [F.chika, F.ie, i >= 9 ? F.mine : null]) {
        if (!g?.count || g.civ) continue;
        g.center(c); c.y = rt.world.heightAt(c.x, c.z);
        const e = rt.army.nearestEnemy({ pos: c, team: g.team }, 20, (o) => !o.fleeing && !o.downed && Math.abs(o.pos.y - c.y) < 3);
        if (e && !rt.army.wallBetween(c, g.team, e.pos)) for (const u of g.units) if (u.alive && !u.target && !u.downed && !u.civ) { u.target = e; u.moveTo = { x: e.pos.x, z: e.pos.z }; u.aiT = 0.8; }
      }
    }
  },
  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
  },
  onRout(rt, g) {
    // 落城の締めで寄せ手の本陣まで「崩れた」と叫んでいた（勝ったのは寄せ手）。締めでは言わない
    if (g.team === 1 && g.name && !rt.flags.ending) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 味方の新手の寄り所：本人が本丸・二の丸の内で、隊がその外なら、口を通す一つ先の点。要らない時は null
const inHonQ = (q) => Math.abs(q.x) < 20 && q.z < -34 && q.z > -62;
const inNiQ = (q) => Math.abs(q.x) < 24 && q.z < 4 && q.z > -20;
function freshVia(c, P) {
  if (inHonQ(P) && !inHonQ(c)) {
    if (inNiQ(c)) return Math.abs(c.x) > 2.5 ? { x: 0, z: -16 } : { x: 0, z: -30 };
    if (c.z < -20 && c.z > -34 && Math.abs(c.x) < 30) return Math.abs(c.x) > 2.5 ? { x: 0, z: -30 } : { x: 0, z: -39 };
    return null;
  }
  if (inNiQ(P) && !inNiQ(c) && c.z <= -20 && c.z > -34 && Math.abs(c.x) < 30) return Math.abs(c.x) > 2.5 ? { x: 0, z: -24 } : { x: 0, z: -15 };
  return null;
}

const CAMP_KEYS = ['ukitaCamp', 'kobaCamp', 'shimaCamp', 'ishidaCamp', 'moriCamp', 'natsukaCamp'];

// 本人の命が六割半を切ったら・塀を挟んだら・組が崩れたら・段が替わったら（off）放す
function huntPlayer(rt, F, dt, off = false, steal = null) {
  if (!off && (F._huntT = (F._huntT || 0) - dt) > 0) return;
  F._huntT = 0.5;
  const P = rt.player.u;
  const on = !off && P?.alive && P.hp >= P.maxHp * 0.65;
  const c = F._huntC || (F._huntC = { x: 0, y: 0, z: 0 });
  const ok = (g) => {
    if (!on || g.routed || !g.count || g.order !== 'attack') return false;
    g.center(c); c.y = rt.world.heightAt(c.x, c.z);
    return Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 20 && !rt.army.wallBetween(c, g.team, P.pos);
  };
  let cur = F._hunter;
  if (cur && (cur.focus !== P || !ok(cur))) {
    if (cur.focus === P) { cur.focus = null; for (const u of cur.units) if (u.target === P) { u.target = null; u.aiT = 0; } }
    if (cur._k01Hunt) { cur.dmgMultPlayer = null; cur._k01Hunt = false; }   // 本人の命が六割五分を割って向けを外したら、本人への重い一太刀も外す
    cur = F._hunter = null;
  }
  if (cur || !on) return;
  for (const g of rt.army.groups) if (g.team === 1 && (!g.focus || (steal && g.focus === steal)) && !g.isPlayerSquad && ok(g)) {
    g.focus = P; F._hunter = g;
    // 11/18 夜50-13（寄せ手の騎馬の混ぜを止めた後の act bot 6回：受けた傷0〜7・討ち取り7の回あり＝命懸けの籠城に見えない）：本人へ向いた組だけ、本人への一太刀を〇・四五倍まで（ほかの寄せ手は〇・二〜〇・二六のまま）
    if (g.dmgMultPlayer == null) { g.dmgMultPlayer = Math.max(g.dmgMult ?? 1, 0.45); g._k01Hunt = true; }
    return;
  }
}

// 城方の数は、始めにいた本物の城方の兵の残りの割合で千八百を割る（前は一人倒れるごとに二十五減らし、
//   八月一日夕の段でもう「0」と出て、元忠の本陣と手勢が本丸で戦っている間ずっと 0 のままだった）。寝返った甲賀衆の分も減る
const allyN = (rt) => { let n = 0; for (const u of rt.army?.units || []) if (u.alive && u.team === 0 && !u.civ && !u.isStruct && u.type !== 'dummy') n++; return n; };
k01_fushimi.force = (rt) => {
  const F = rt.flags;
  // 籠城で援軍は来ないので、出した数より増やさない（新手の足軽が追いつくと 1,562 → 1,608 と増えていた。critic60）
  const remaining = allyN(rt);
  // 本丸で戦う生存者がいる間だけ下限を保つ。全滅後に架空の十人を残さない。
  const a = F.a0n ? Math.min(F.aShown ?? 1800, remaining ? Math.max(10, Math.round(1800 * Math.min(1, remaining / F.a0n))) : 0) : 1800;
  F.aShown = a;
  // 11/18 クラウド kaito2（K365 両軍の人数）：寄せ手の討死一人を四十人にすると、七分で 40,000→31,400 と九千が減って見えた（史実の寄せ手の損は十三日で三千ほど）。十五人に
  return { a, a0: 1800, b: Math.max(0, 40000 - (F.ek || 0) * 15), b0: 40000 };
};
// 八月一日の城方は退かない。内藤家長が西の丸で果てた時、共通の知らせが「味方の兵が退き始めた」と出していた（鳥居の侍の台詞が既に知らせている）
// 「敵の隊が崩れた」「味方の隊が崩れた」の札も出さない（八秒おきに出て、持ち場で果てる城方まで「崩れた」と出していた。森部の kaito 11/6 を全戦に）
k01_fushimi.bannerAllowed = (rt, t) => !(((rt.flags.dp?.i ?? 0) >= 6 && /味方の兵が退き始めた/.test(t)) || /隊が崩れた/.test(t));
// 危機の知らせでも今の持ち場を変えない。二の丸の守備中に
// 本丸の元忠の旗へ呼んだり、後退の下知を引き留めたりしない。
k01_fushimi.missionDangerSpeech = (rt) => {
  const i = rt.flags.dp?.i ?? 0;
  if (i >= 11) return '本丸の裏口へ。城を抜け、内府様へ届けよ';
  if (i >= 9) return '味方は討ち減らされた。元忠殿の旗の下で戦え';
  if (i >= 7) return '本丸へ退け。元忠殿の旗の下へ寄れ';
  if (i === 6) return '二の丸の東を食い止めよ。持ち場を離れるな';
  if (i >= 4) return '二の丸の西へ。家忠殿と押し返せ';
  if (i === 3) return '二の丸へ退け。味方の後退を援護せよ';
  return '味方が討ち減らされておる。持ち場の旗の下へ寄れ';
};
k01_fushimi.sides = { a: { name: '徳川勢', mon: 'tokugawa' }, b: { name: '寄せ手', mon: 'ukita' } };
k01_fushimi.date = (rt) => (rt.flags.burned ? '慶長五年（1600）八月一日　夕・本丸に火' : rt.flags.matsuBurned ? '慶長五年（1600）八月一日　昼・松の丸に火' : `慶長五年（1600）${rt.flags.k01Date || '六月十八日'}　${rt.flags.k01Date === '六月十七日' ? '夜' : '昼'}`);
k01_fushimi.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k01_fushimi.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k01_fushimi.history = '慶長五年（1600）、徳川家康は会津の上杉景勝を討つため東へ発つ前に、京の入り口の伏見城を家臣の鳥居元忠に預けた。伝えでは、家康は「城を死守してくれ」と告げ、二人は別れの盃を交わしたという。七月、石田三成らが挙兵して西軍が成った。城方は七月十九日に打って出て、城の外の長束正家・前田玄以の屋敷を焼いた。寄せ手は日ごとに増え、二十二日に宇喜多秀家、二十三日に小早川秀秋らが加わり、毛利秀元・吉川広家・小西行長・鍋島勝茂・長束正家らも寄せて四万ほどになり（攻め始めを十九日とも二十五日とも伝える）、築山に据えた大筒や鉄砲で昼夜城を撃ち、堀を埋めて迫った。城には鳥居元忠（本丸）・松平家忠と松平近正（三の丸）・内藤家長と元長の父子（西の丸）・深尾清十郎と甲賀衆（松の丸）・宇治の茶師の家の上林竹庵（太鼓の丸）・佐野綱正ら千八百ほどしかいなかったが、十日あまり持ちこたえた。八月一日の昼、甲賀衆の内応で松の丸から火の手が上がり、寄せ手は四方から一斉に乗り込んだ。元忠は足が不自由で刀を杖に戦ったと伝わり、雑賀孫一（鈴木重朝）が敬って腹を切るのを待ち、首を取ったともいう。城は炎上して落ちた（落ちた刻を昼ごろとも夕とも伝える）。城方の死者は三百数十とも八百とも全員とも伝わる。討死した者の血に染まった床板は、のちに京の寺々の天井に上げられ、血天井として今に残る。この足止めが、家康が東から戻って美濃へ進む時を稼いだ。\n島津義弘が初め城に入ろうとして断られたという話は江戸時代の書物の伝えで、確かではない。曲輪の並びと寸法は遊びのために縮めて復元したもので、内応や元忠の最期の細部は伝えにより異なる。';
k01_fushimi.bushou = [{ name: '鳥居元忠', g: /元忠/ }, { name: '雑賀孫一', g: /孫一/ }];

// 11/18 クラウドさ：これが無いと段（b_depth）の間は playbot が共通の depthBot だけを呼び、下の頭（門を閉める静けさ・着いた後に奥へ・本丸の二段で持ち場へ戻す）が一度も走っていなかった
//   （描かずの一コマずつの記録：本丸の口の内 (0,−37) で着いた途端に北の待ち伏せへ向き直り、口の段差を百秒出入りした）
k01_fushimi.botBrainDepth = true;
k01_fushimi.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) {
    depthBot(b, inp, goTo);
    // 11/18 クラウドさ：門を閉める静けさの段（④⑧ rest）で、共通の段の頭が十四歩内の敵を追って閉める前の門を出、
    //   act bot が本丸の外へ出たまま⑨⑩の二段を城の北 (−5,90) で過ごし、⑪の裏口へ寄せ手の中を戻って倒れた。静けさの間は、すぐ脇（三歩）の敵だけを払い、門の内に留まる
    { const Cr = F.dp.cur;
      if (Cr && Cr.s.kind === 'rest' && !F.dpBack) {
        const near = b.army.nearestEnemy(u, 3, (o) => !o.fleeing && !o.noTarget && !b.army.wallBetween(u.pos, u.team, o.pos, false));
        if (!near) { inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.leftPressed = false; inp.runHeld = false;
          // 門の外で静けさに入った時は、閉まる前に次の持ち場（門の内）へ歩いて入る
          const nx = F.restNext; if (nx && Math.hypot(u.pos.x - nx.x, u.pos.z - nx.z) > 8) goTo(p, inp, nx.x, nx.z, 4); }
      } }
    // 11/18 クラウドさ（act bot：「本丸へ退け」に着いた後、本丸の口の敷居 (0,−35) で六十七秒立った）：着いた後は共通の頭が待ち伏せの組の方を向き、
    //   本人が口の内外を出入りして着きが消えては付き直し、二十五秒の待ちが満ちなかった。着いた後は、すぐ脇の敵がいなければ行き先の奥へ入る
    { const Cm = F.dp.cur;
    // 11/18 クラウドさ（act bot 三回：二の丸の口 (1,3)・本丸の口の内 (0,−37) で、着きの輪の一歩外に五十〜百秒、走る構えのまま進まなかった。
    //   壁も味方の詰まりも無い（描かずの歩きで素通し）＝共通の退く歩きの止まる輪 4 と段の着きの輪 5〜9 の境目で足踏み）：行き先の十二歩内からも奥へ入れる
      if (Cm && Cm.s.kind === 'move' && (Cm.arr || Math.hypot(u.pos.x - Cm.at.x, u.pos.z - Cm.at.z) < 12) && !F.dpBack && Cm.at && Math.hypot(u.pos.x - Cm.at.x, u.pos.z - Cm.at.z) > 2.5 &&
          !b.army.nearestEnemy(u, 3, (o) => !o.fleeing && !o.noTarget && !b.army.wallBetween(u.pos, u.team, o.pos, false))) {
        const w = fushimiWay(b.army, u, Cm.at); inp.leftPressed = false; goTo(p, inp, w.x, w.z, 1.5);
      } }
    // 11/17 クラウド：本丸の守りの段で、手当てに下がる先が松の丸の角 (25,-33) の味方になり、本丸の外で斬られ続けて段が終わらなかった。
    //   守る持ち場から二十四歩より離れて下がる時は、持ち場（口を通る道）へ戻って味方の中で手当てする
    const C = F.dp.cur, at = C && C.at;
    // 11/18 クラウドさ（act bot 727秒：⑩で本丸の口の外 (−6,−31)・旗から十八歩に六十秒立ち、輪の外なので寄せ手も狙わなかった）：本丸の二段は輪の二歩外から戻す
    // 11/18 クラウドさ（POSLOG：⑥「二の丸の東」の百二十秒を、西から破った小早川勢を追って持ち場 (8,−7) の三十歩西 (−10〜−24, 1〜5) で過ごし、東の甲賀衆に一度も当たらなかった）：⑥は輪の六歩外から戻す
    // 11/18 19:55 UTC クラウド持ち主：⑥も戻す輪は持ち場の輪の二歩外（南の口の外 (0,11) の十九歩半に百秒立った）
    const east = C && C.s.kind === 'hold' && (F.dp.i ?? 0) === 6;
    const late = C && C.s.kind === 'hold' && (F.dp.i ?? 0) >= 9;
    if ((F.dpBack || late || east) && at && (C.s.kind === 'hold' || C.s.kind === 'fight') && Math.hypot(u.pos.x - at.x, u.pos.z - at.z) > (east && !F.dpBack ? (C.botRadius || 14) + 2 : late && !F.dpBack ? (C.botRadius || 14) + 2 : 24)) {
      const w = fushimiWay(b.army, u, at);
      inp.k.delete('KeyE'); goTo(p, inp, w.x, w.z, 1);
    }
    return;
  }
  inp.k.delete('KeyW');
  goTo(p, inp, 2, 72, 3);
};

// 11/18 クラウドさ：退く段（二の丸へ・本丸へ・裏口）で、共通の退避（survive）が近い味方の方＝三の丸の北へ本人を下げ、
//   act bot が「二の丸へ退け」の百二十秒を三の丸の門 (3,48) で斬り合ったまま過ごし、そのまま気力が尽きて (−23,85) の城の外で
//   次の二段（二の丸の西・東）を二百秒立っていた。着く前の退く段は、深手でない限り段の退き道（depthWithdraw・fushimiWay）に任せる
// 11/18 クラウドさ（act bot 802秒：本丸の二段⑨⑩で、気力が尽きるたび共通の退避が本人を二の丸・三の丸の北 (6,47) へ下げ、本丸へ一度も入らないまま脱出になった）：
//   本丸の二段で持ち場の二十四歩より外にいる時も、深手でない限り段の頭（持ち場へ戻る道・fushimiWay）に任せる
k01_fushimi.botEvacuating = (b) => { const D = b.flags.dp, C = D?.on && D.cur, u = b.player?.u; if (!C || !u || u.hp <= u.maxHp * 0.35) return false;
  if (C.s.kind === 'move' && !C.arr) return true;
  // 11/18 クラウドさ（POSLOG：⑨で本人が本丸の口の外 (−3,−32)〜(−6,−24)・旗から十五〜二十三歩に百秒、⑩で本丸の西の脇の通り (−21,−35〜−41) に五十秒、
  //   共通の退避で下がったまま立った。二十四歩の内なので段の頭が戻せなかった）：本丸の二段は、段の頭が戻す輪（持ち場の輪の二歩外）とそろえる
  // 11/18 19:55 UTC クラウド持ち主（act bot POSLOG 803秒：⑥の百秒を二の丸の南の口の外 (0,11)・持ち場から十九歩半に立ち、石垣の内の寄せ手三十余と一度も組まなかった）：戻す輪を持ち場の輪の二歩外に（本丸の二段と同じ）
  if (C.s.kind === 'hold' && (D.i ?? 0) === 6 && !!C.at && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) > (C.botRadius || 14) + 2) return true;
  return C.s.kind === 'hold' && (D.i ?? 0) >= 9 && !!C.at && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) > (C.botRadius || 14) + 2; };

const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
// 11/18 クラウド（持ち主・⑥ 874×402 の写真）：右上の目標が二行に折れ（「二の丸の西で／家忠殿と押し返す」）、札が縦に伸びて地図を左へ押し出した。
//   目標は一行（CLAUDE.md 2章）。どの曲輪かはピンと地図で分かるので、札は九字までに縮める。段の数・順・判定は変えない
STAGES.k01_fushimi = [['大手の曲輪を守る'], ['東の隅櫓を救う', dpAt(1)], ['破城隊を止める', dpAt(2)], ['二の丸へ退く', dpAt(3)], ['西の口を押し返す', dpAt(5)], ['東の口を食い止める', dpAt(6)], ['本丸へ退く', dpAt(7)], ['本丸で持ちこたえる', dpAt(9)], ['裏口から城を抜ける', dpAt(11)]];

// 目標の札に別の刻限を重ねず、実際の段の達成だけで判定する。
// 守る段と日付の切り替えでは人数を出さない。字から相手を探す
// 共通の補完に任せると、寄せの途中の人数や次の段の兵を数えてしまう。
k01_fushimi.goals5 = () => STAGES.k01_fushimi.map((s, k) => ({ kind: 'stage', k, text: s[0],
  count: (rt) => { const now = stageNow(rt); return !rt.over && now?.i === k && rt.flags.dp?.on && rt.flags.dp.cur?.s.kind === 'fight' ? now.count : null; },
  check: (rt) => (rt.over && rt.tracker?.main === true) || (stageNow(rt)?.i ?? 0) > k }));

export { k01_fushimi };
export default k01_fushimi;
