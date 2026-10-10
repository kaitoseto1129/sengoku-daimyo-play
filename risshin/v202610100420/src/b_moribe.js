import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
// 森部：雨中の渡河 → 先手 → 長い槍の押し合い → 両将の備を崩す → 集結。
import { gauss, centerOf, allyGroup, enemyGroup } from './bhelp.js';
import { distToPolyline } from './world.js';
import { RANKS } from './state.js';
import { nobori, hut } from './props.js';
import { sendOrder } from './denrei.js';
import { nagashinojo } from './b_nagashinojo.js';
import { sfx } from './audio.js';
import { sightPoint } from './battle_sight.js';
import { gone as groupGone, seasonOf } from './b_shared.js';
import { camp } from './b_mid.js';
import { demBlend } from './dem.js';
import { clash } from './b_sekigahara.js';
import { battleEvent, EVENT_COMMANDER_ADVANCE, EVENT_UNIT_BREAK, EVENT_COMMANDER_KILLED, EVENT_REINFORCEMENT, EVENT_RETREAT } from './battle_events.js';

// ======================================================================
// 第2戦　森部
// ======================================================================
// 略図の距離は推定。南の本陣と東の川までの野を、会戦の足元へ縮めない。
const FIELD2 = 800;
const CAMP2 = { x: 0, z: 700 };
const NAGARA2 = 500;
const ROAD2 = [[-40, FIELD2], [-40, 176], [-28, 100], [-14, 40], [-6, -40], [4, -176], [4, -FIELD2]];
// 楡俣川（南の支流）の南岸から始め、腿までの流れを渡って北岸の畦で組をそろえる。
const NIREMATA2 = 88;
// 楡俣川の流れの中ほどの z（下の streams の折れ線と同じ形）。
const nireZ = (x) => x < -70 ? NIREMATA2 + 2 * Math.min(1, (-70 - x) / 730) : x < 46 ? NIREMATA2 : NIREMATA2 + 6 * Math.min(1, (x - 46) / 454);
const START2 = { x: 40, z: 114 };
const POINT2 = { x: 40, z: 64 };
const FRONT2 = { x: 4, z: 20 };
const ASSEMBLY2 = { x: 14, z: 10 };
const RETREAT2 = { x: 24, z: 48 };
const YAKUSHI2 = { x: 66, z: 46 };
const LINE2 = -58;
// 深手で戦列を離れた兵だけの備えは、討ち残しや帰着待ちに数えない。
const gone = (g) => groupGone(g) || !g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget);
// 手当て中の兵に引かれず、今戦える兵の位置へ寄せる。入れ物は隊ごとに使い回す。
function fightingCenter(g) {
  const c = g._moribeCenter || (g._moribeCenter = { x: 0, z: 0 });
  let x = 0, z = 0, n = 0;
  for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget) {
    x += u.pos.x; z += u.pos.z; n++;
  }
  c.x = n ? x / n : g.anchor.x; c.z = n ? z / n : g.anchor.z;
  return c;
}
// 上役は組頭の源八（柴田の前備）。雨の中でも三十歩ほどは怒鳴り声が届く。その外へは共通の本物の使番で運ぶ。
function orderSpeech(rt, text, dur = 4) {
  const from = rt.flags.moribeOfficer;
  if (rt.over || !from?.alive || from.gone || from.fleeing || from.woundOut || from.noTarget || from.group?.routed) return;
  const stage = rt.flags.stage, ending = rt.flags.ending;
  if (Math.hypot(from.pos.x - rt.player.u.pos.x, from.pos.z - rt.player.u.pos.z) <= 30 && sightPoint(rt, from.pos)) {
    rt.say('組頭 源八', text, dur);   // 声の届く所で怒鳴る。名札は城下と同じ「組頭 源八」
    return;
  }
  sendOrder(rt, from, rt.player.u, { id: 'word', apply: () => {
    // 遅れて届いた前の段の下知で、今の任務を覆さない。
    if (!rt.over && rt.flags.stage === stage && rt.flags.ending === ending)
      rt.say('使番', `源八殿より。「${text}」`, dur);
  } }, { team: 0, faction: 'oda', name: '自分の槍組' });
}

// 国土地理院の標高（森部古戦場。束0 の asset_dem_moribe.js）を手書きの base（低い湿地）に混ぜる
let moribeDem = null;
import('./asset_dem_moribe.js').then((m) => { moribeDem = m.default; }).catch(() => {});
const MORIBE_DEM_OPTIONS = { scale: 1, xyScale: 1 };
const moribeHeight = (x, z, b) => (moribeDem ? demBlend(moribeDem, x, z, b, MORIBE_DEM_OPTIONS, b - 3) : b);

// 信長公記首巻「もりべ合戦」。三手の細かな位置・兵数は復元。龍興の後詰は置かない。
const MORIBE_JIN = [
  battleJin('三手の備え', 0, CAMP2, Math.PI, [
    ['mbShiba', '先手', '柴田勝家', 400, 8, 116, 'A', 'oda', 'kari'],
    ['mbMori', '左手', '森可成', 300, -52, 114, 'Y', 'oda', 'tsuru'],
    ['mbRight', '右手', '名は伝わらない', 200, 62, 116, 'R3', 'oda'],
    ['mbMain', '本備', '名は伝わらない', 300, -22, 126, 'B', 'oda'],
    ['mbNobu', '本陣', '織田信長', 300, CAMP2.x, CAMP2.z, 'odaCamp', 'eiraku', 'oda'],
  ], '織田千五百ほど。各手の割り振りは復元。'),
  battleJin('横に並ぶ備え', 1, { x: -34, z: -100 }, 0, [
    ['mbVan', '先手', '名は伝わらない', 1000, 16, -62, 'V', 'saito'],
    ['mbHibi', '本備東', '日比野下野守', 2000, -14, -76, 'M', 'saito'],
    ['mbNagai', '本備西', '長井甲斐守', 2000, -54, -78, 'N', 'saito'],
    ['mbReserveN', '西の控え', '名は伝わらない', 500, -44, -114, 'reserves.0', 'saito'],
    ['mbReserveM', '東の控え', '名は伝わらない', 500, 12, -138, 'reserves.1', 'saito'],
  ], '斎藤六千ほどとも。長井・日比野の控え。龍興本人の出陣は示さない。'),
];

const moribe = {
  jinkei: MORIBE_JIN,
  foeHit: 1,
  // 重なる槍の傷を共通の仕組みで間引く。満タンの傷枠でも、
  // 体力九十二から近接だけで倒れるまで六十秒以上（厳しい戦は従来どおり）。
  meleeGrace: { rate: 0.009, burst: 0.08, interval: 1.2 },
  learningFight: false,   // 初陣用の傷の軽減は、この槍戦に持ち込まない。
  noReserve: true,   // 台本の控え以外に、共通の新手を追加しない。
  noWake: true,   // 予告のない新手を増やさず、開戦時に置いた控えを前へ出す。
  lordHata: { spear: 36 },   // 信長で遊ぶ時も槍の供にし、兵の枠を守る。
  noTaisho: true,   // 両将を討っても一瞬で終わらず、戦場を固める。
  allyReports: false,   // 味方の様子は源八の怒鳴り声と旗で伝える。小地図の番号の読み上げは出さない。
  battleVoices: { lines: { enemy: {
    ambient: ['織田勢が川を渡ったぞ。槍をそろえよ', '長井様と日比野様の旗を守れ', '城へ退く道を塞がせるな'],
  } } },
  spawn: { x: START2.x, z: START2.z, heading: Math.PI },
  // 信長で遊ぶ時は前へ出た所から始め、後方からの長い行軍で任務を止めない。
  lordSpawn: { x: POINT2.x + 4, z: POINT2.z + 4, heading: Math.PI },
  lordAt: { x: POINT2.x, z: POINT2.z, r: 24, why: '渡河後の槍組のそば（前へ出た位置は復元）' },
  world: {
    seed: 21,
    noticeRepeatGap: 32,   // 同じ知らせは三十秒以内に繰り返さない。
    groundHalf: FIELD2,
    moveLim: FIELD2 - 4,
    time: 'storm',
    stormLift: 2,   // 雨の昼。既存の光で日陰の兵と旗を見せる。
    closeCombatAssist: true,   // 初めて組を預かる槍戦の、近い相手への向き直り。
    playerMeleeFloor: 1 / 3,   // 無名の足軽は、三歩以内で三度当てれば倒れる。
    muddy: 0.5,
    waterSlow: true,
    riverCross: true,   // 深い長良川を徒歩で素通りしない。南の楡俣川は腿ほどの深さで渡る。
    paths: [ROAD2],
    height(x, z) {
      const b = 1.4 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 0.9 * Math.sin(x * 0.07 + z * 0.05) + 1.2 * gauss(x, z, 130, 60, 3000) + 1 * gauss(x, z, -130, -90, 3200) + 2 * gauss(x, z, 58, -8, 300) + 0.9 * Math.exp(-((x - NAGARA2) ** 2) / 1500) + 0.7 * Math.exp(-((x + 70) ** 2) / 50);   // 自然堤防（川筋の微高地）
      // 楡俣川の両岸に低い土手（自然堤防）。田の水と川面を分け、川筋として読めるようにする。
      const dz = Math.abs(z - nireZ(x));
      // 広い野の地形は約十一歩刻み。渡る所を平らにし、細い水面が起伏に埋もれないようにする。
      const ford = Math.max(0, Math.min(1, (160 - Math.abs(x)) / 30)) * Math.max(0, Math.min(1, (30 - dz) / 12));
      const h = moribeHeight(x, z, b);
      return h + (0.2 - h) * ford + (x < NAGARA2 - 40 ? 0.5 * Math.exp(-((dz - 17) ** 2) / 9) : 0);
    },
    tint(x, z, h, c) {
      // 田の畦
      if (Math.abs(x) < 120 && (Math.floor(x / 22) + Math.floor(z / 18)) % 3 === 0 && Math.abs(x - 50) > 18) c.setRGB(c.r * 0.9 + 0.03, c.g * 0.95 + 0.02, c.b * 0.8);
      if (z < LINE2 && z > LINE2 - 1.5 && Math.abs(x) < 110) c.setRGB(0.38, 0.33, 0.22);
      // 川べりの泥と踏み跡：水ぎわから土手の上まで濃い土の色
      { const dz = Math.abs(z - nireZ(x)); if (dz > 4.5 && dz < 11 && x < NAGARA2 - 40) { const k = 1 - Math.abs(dz - 7.5) / 3.5; c.setRGB(c.r + (0.33 - c.r) * k, c.g + (0.29 - c.g) * k, c.b + (0.2 - c.b) * k); } }
    },
    clear: (x, z) => (Math.abs(x) < 160 && Math.abs(z - nireZ(x)) < 30) || (Math.abs(x) < 42 && z > -100 && z < 130) || Math.hypot(x - 52, z - 112) < 22 || Math.hypot(x - 45, z - 70) < 12 || Math.hypot(x + 126, z + 30) < 34,
    // 五月の田：水を張り、苗を植えたばかり（畦を残す）
    fieldStage: 'seedling',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (Math.abs(x) > 120 || Math.abs(x - 50) < 18 || Math.abs(z - nireZ(x)) < 18) return 0;   // 川べりは田にしない
      if ((Math.floor(x / 22) + Math.floor(z / 18)) % 3 !== 0) return 0;
      const ex = Math.min(((x % 22) + 22) % 22, 22 - ((x % 22) + 22) % 22), ez = Math.min(((z % 18) + 18) % 18, 18 - ((z % 18) + 18) % 18);
      if (distToPolyline(x, z, ROAD2) < 5) return 0;
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.9) / 0.6));
    },
    // 長良川は東の約五百メートル先。川幅・曲がり・楡俣川の浅瀬は復元。
    streams: [{ pts: [[NAGARA2 + 20, -FIELD2], [NAGARA2, -450], [NAGARA2 - 10, -100], [NAGARA2 + 20, 300], [NAGARA2 + 50, FIELD2]], w: 60, depth: 1.4 },
      { pts: [[-FIELD2, NIREMATA2 + 2], [-70, NIREMATA2], [46, NIREMATA2], [NAGARA2, NIREMATA2 + 6]], w: 9, depth: 0.7 },   // 楡俣川：川幅十八メートル・腿までの流れ（川幅は復元。w は片側の幅）
      { pts: [[-70, -FIELD2], [-66, -40], [-74, 60], [-70, FIELD2]], w: 1.2, depth: 0.7 }],
    mist: false,   // 雨は公記にあるが、濃い霧は確定できない。
    trees: 140,
    treeDensity: (x, z) => (Math.abs(x) > 90 ? 1 : 0.35),
    groves: [{ x: 60, z: -8, r: 12, n: 18 }, { x: 70, z: 20, r: 10, n: 8 }],
  },
  setup(rt) {
    // 安八町の案内：森部下河原2831。首実検の伝えを後日談へ。
    // https://www.town.anpachi.lg.jp/0000000392.html
    // 当時の姿と戦場での配置は復元。近代の石碑は置かない。
    rt.scene.add(hut(rt.world, YAKUSHI2.x, YAKUSHI2.z, 3.6, 2.8, 0, { wall: 0x6a5a44, roof: 0x3a3430, h: 2.4 }));
    rt.flags.yakushiReconstruction = true;
    const W = rt.world;
    // 共通処理から直接出る褒美の札も含め、森部の札は同じ秒に二つまで。
    const hud = rt.hud, hudBark = hud.bark, hudBanner = hud.banner, hudSay = hud.say;
    let cardSecond = -1, cardCount = 0;
    const takeCard = () => {
      const second = Math.floor(rt.t);
      if (second !== cardSecond) { cardSecond = second; cardCount = 0; }
      if (cardCount >= 2) return false;
      cardCount++; return true;
    };
    const warnings = {
      shaken: { at: -99, n: 0, lines: ['組が動揺している。旗のそばで声をかけよ', '組の足が止まった。仲間を励ませ', '槍の列が乱れた。旗の下へ組を集めよ'] },
      surrounded: { at: -99, n: 0, lines: ['囲まれた！　味方の旗へ下がれ', '敵が四方にいる。味方の列へ戻れ', '退く道が狭い。組と一緒に抜けよ'] },
    };
    hud.bark = function (text, warn) {
      if (this.rt !== rt) return hudBark.call(this, text, warn);
      const w = /組が動揺/.test(text) ? warnings.shaken : /囲まれた|四方から敵|後ろにも敵|取り籠め/.test(text) ? warnings.surrounded : null;
      if (w && rt.t - w.at < 30) return;
      if (!takeCard()) return;
      if (w) { w.at = rt.t; text = w.lines[w.n++ % w.lines.length]; }
      return hudBark.call(this, text, warn);
    };
    hud.banner = function (text, sub) {
      if (this.rt !== rt) return hudBanner.call(this, text, sub);
      if (takeCard()) return hudBanner.call(this, text, sub);
      const phase = rt.phase;
      rt.after(1, () => { if (hud.rt === rt && rt.phase === phase) hud.banner(text, sub); });
    };
    hud.say = function (speaker, text, dur, urgent, detail) {
      if (this.rt !== rt) return hudSay.call(this, speaker, text, dur, urgent, detail);
      // 急な下知も今の台詞を切らず、届いた順に読む。
      const accepted = hudSay.call(this, speaker, text, dur, false, detail);
      this.subQ.sort((a, b) => a.queued - b.queued);
      return accepted;
    };
    const dispose = rt.dispose;
    rt.dispose = function () {
      hud.bark = hudBark; hud.banner = hudBanner; hud.say = hudSay;
      return dispose.call(this);
    };
    // 柴田の悔やみは、共通の討死処理へ渡す本当の味方の死に一度だけ結ぶ。
    const onKill = rt.army.hooks.onKill, say = rt.say;
    let fallenAt = -99, fallen = 0, mourned = 0;
    rt.army.hooks.onKill = (v, k) => {
      if (v.team === rt.player.u.team && !v.alive && !v.civ && !v.isStruct && !v.isPlayer) { fallen++; fallenAt = rt.t; }
      return onKill(v, k);
    };
    rt.say = function (speaker, text, dur) {
      if (/^(?:柴田)?勝家$/.test(speaker) && /無念|仲間を失った|嘆くのは後/.test(text)) {
        if (fallen <= mourned || rt.t - fallenAt > 2) return;
        mourned = fallen;
      }
      return say.call(this, speaker, text, dur);
    };
    // 内部の史実札（HIST_A=根拠強い／HIST_B=推定復元／GAME_C=ゲーム補完）。表には出さない
    rt.flags.hist = { rain: 'HIST_A', crossing: 'HIST_A', spearBattle: 'HIST_A', commanders: 'HIST_A', nagara: 'HIST_B', paddy: 'HIST_B', formation: 'GAME_C', reserveWaves: 'GAME_C', ford: 'GAME_C' };
    // 倒れる寸前に仲間が割って入る手当ては、最初の桶狭間だけ（森部からは構えと回避で凌ぐ）。
    rt.firstFights = false;
    rt.flags.rescued = true;   // 倒れてから体力を戻して戦列へ復帰する救済を、この戦では使わない。
    // 渡河の移動は総攻めの合図ではない。森部の下知が出るまで隊の太鼓を鳴らさない。
    // 隊の行き先の細かな直しでは鳴らさない。両軍を合わせて三十二秒あけ、字は出さない。
    const signalStages = [null, null], signalKinds = [null, null];
    rt.army.hooks.onSignal = (g, kind, at) => {
      const F = rt.flags;
      if (!F.signal || rt.over || F.ending || F.quiet || g.hidden || g.hideFlags) return;
      if ((F.signalSoundAt ?? -99) + 32 > rt.t) return;
      if (signalStages[g.team] === F.stage && signalKinds[g.team] === kind) return;
      signalStages[g.team] = F.stage; signalKinds[g.team] = kind;
      F.signalSoundAt = rt.t;
      rt.army.playFar(`sig_${kind}`, at, 0.9);
    };
    // 槍列で囲む戦。山場を一騎打ちの札で覆わず、組と戦い続ける。
    rt.army.hooks.canDuel = () => false;
    // 組の者が遠くで討った首を、自分に催促しない。自分の討ち取りも近くで一度だけ知らせる。
    const bark = rt.bark;
    rt.bark = function (text, warn) {
      if (text === '証がない。近くで首を袋に納めよ') {
        const record = this.meritKills?.find((r) => r.src.isPlayer && !r.foe.alive && !r.foe.gone && !r.head &&
          !r.witnesses.length && r.foe !== this.flags.proofNoted &&
          Math.hypot(r.foe.pos.x - this.player.u.pos.x, r.foe.pos.z - this.player.u.pos.z) < 12);
        if (!record) return;
        this.flags.proofNoted = record.foe;
        text = '討った敵の証がない。近くで首を袋に納めよ';
      }
      return bark.call(this, text, warn);
    };
    // 一度だけ、仲間の槍で追う敵を止める。関数は出陣時に作り、兵や行き先を毎コマ作らない。
    const act = rt.army.act;
    rt.army.act = function (u, dt, near) {
      const p = rt.player.u.pos;
      if (rt.flags.breathUntil > rt.t && u.team !== rt.player.u.team && !u.fleeing && !u.group?.routed &&
          (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2 < 1600) {
        u.target = null; u.atk = null; u.swing = null; u.bind = null;
        u.mv.x = u.mv.z = u.vel.x = u.vel.z = 0;
        u.push.x = u.push.z = 0; u.moving = 0;
        return;
      }
      return act.call(this, u, dt, near);
    };
    // 公記の森部は織田の大勝。味方の兵（自分と組を除く）への打ち込みを少し浅くし、勝ち戦の芯が溶けないようにする。
    const damage = rt.army.damage;
    rt.army.damage = function (t, amount, src, ...rest) {
      if (t && t.team === 0 && !t.isPlayer && !t.group?.isPlayerSquad && src?.team === 1) amount *= 0.7;
      return damage.call(this, t, amount, src, ...rest);
    };
    const n = Math.min(24, RANKS[rt.G.rank].squad || 5);
    rt.makeSquad({ x: START2.x + 5, z: START2.z - 3 }, Math.PI, [{ kind: 'spear', n }]);   // 組は右前で一緒に流れへ入る
    // 三手は楡俣川の南岸に並び、遊び手と同じ流れを渡る。柴田・本備・森の備は勝ち戦の芯なので、
    // 兵は討たれても隊ごとの総崩れはしない（右手の小勢は崩れうる）。
    rt.flags.A = allyGroup(rt, { name: '柴田の前備', fixed: true, anchor: { x: 32, z: 98 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true, fullStrength: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 16 }, { type: 'samurai', n: 1, o: { name: '源八', invuln: true } }, { type: 'busho', n: 1, o: { name: '柴田勝家', invuln: true } }]);
    rt.flags.B = allyGroup(rt, { name: '本備', fixed: true, anchor: { x: -22, z: 116 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true, fullStrength: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 24 }, { type: 'bow', n: 2 }, { type: 'samurai', n: 2 }]);
    // 上役の源八は戦の後に城下で昇進を告げる。この戦では討たれない。
    rt.flags.moribeOfficer = rt.flags.A.units.find((u) => u.name === '源八');
    // 小勢が横に広がりすぎず、槍の前線へ合流する（細かな隊の位置は復元）。
    rt.flags.R3 = allyGroup(rt, { name: '右手の備', fixed: true, anchor: { x: 56, z: 112 }, facing: Math.PI, aggro: 10, morale: 100, noRout: false, fullStrength: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 12 }, { type: 'samurai', n: 1 }]);
    rt.flags.Y = allyGroup(rt, { name: '森の横備え', fixed: true, anchor: { x: -48, z: 108 }, facing: Math.PI, aggro: 10, morale: 100, noRout: true, fullStrength: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 14 }, { type: 'samurai', n: 1, o: { name: '前田利家', invuln: true } }, { type: 'busho', n: 1, o: { name: '森可成', invuln: true } }]);
    // 斎藤の先手は北岸の畦へ寄せ、渡る織田勢へ矢を射かけてから槍で受ける（弓の数は復元）。
    rt.flags.V = enemyGroup(rt, { faction: 'saito', name: '斎藤の先手', fixed: true, anchor: { x: 30, z: 48 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, speed: 2.1, aggro: 5, noRout: false, formation: 'yari', yariRanks: 3 }, [{ type: 'ashigaru', n: 26 }, { type: 'bow', n: 4 }, { type: 'samurai', n: 2 }]);
    // 日比野下野守の備え（足立六兵衛を含む）
    rt.flags.M = enemyGroup(rt, { faction: 'saito', name: '日比野の備', fixed: true, anchor: { x: -14, z: -30 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 8, width: 8, noRout: false, formation: 'yari', yariRanks: 3 },
      [{ type: 'ashigaru', n: 18 }, { type: 'samurai', n: 2 }, { type: 'samurai', n: 1, o: { name: '足立六兵衛' } }, { type: 'bow', n: 3 }]);
    // 長井甲斐守の備え：日比野の西に並ぶ
    rt.flags.N = enemyGroup(rt, { faction: 'saito', name: '長井の備', fixed: true, anchor: { x: -44, z: -34 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, aggro: 8, width: 7, morale: 90, noRout: false, formation: 'yari', yariRanks: 3 },
      [{ type: 'ashigaru', n: 14 }, { type: 'samurai', n: 2 }, { type: 'bow', n: 2 }]);
    // 両将は備の後ろで旗本の侍に囲まれて控え、槍の押し合いの後に自ら前へ出る（位置と人数は復元）。
    // 大将の生きている間は旗本が踏みとどまる。両将の首が勝ち戦の山場（公記：両将を含む百七十余人討死）。
    rt.flags.HM = enemyGroup(rt, { faction: 'saito', name: '日比野下野守の旗本', fixed: true, anchor: { x: -8, z: -54 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 3, morale: 100, noRout: true, formation: 'yari', yariRanks: 2 },
      [{ type: 'busho', n: 1, o: { name: '日比野下野守' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }]);
    rt.flags.HN = enemyGroup(rt, { faction: 'saito', name: '長井甲斐守の旗本', fixed: true, anchor: { x: -36, z: -58 }, facing: 0, fleeDir: { x: -0.2, z: -1 }, aggro: 3, morale: 100, noRout: true, formation: 'yari', yariRanks: 2 },
      [{ type: 'busho', n: 1, o: { name: '長井甲斐守' } }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }]);
    rt.flags.HM.hatamoto = rt.flags.HN.hatamoto = true;
    for (const [x, z] of [[30, 124], [-30, 126], [0, 120]]) rt.scene.add(nobori(W, x, z, 'oda', 5));
    for (const [x, z] of [[-20, -92], [0, -96], [-34, -90], [-60, -100], [-46, -100]]) rt.scene.add(nobori(W, x, z, 'saito', 5.5));
    rt.scene.add(hut(W, -60, 60, 6, 4, 0.3, { roof: 0x6a5c44 }));
    rt.scene.add(hut(W, -70, 70, 5, 4, -0.2, { roof: 0x6a5c44 }));

    // 森部だけ、曇天の回り込む光を上げる。光源や兵の材質は増やさない。
    const lookOf = W.lookOf;
    W.lookOf = function (key) {
      const look = lookOf.call(this, key);
      if (key === 'storm') {
        look.hemiI *= 1.35;
        look.hemiGround.setHex(0x858174);
        look.sunI = Math.max(look.sunI, 1.8);
        look.vis = Math.max(look.vis, 280);
      }
      return look;
    };
    // 雨量・濡れ・雨音は保つ。手前の太い板を描かず、細い線を半分にして薄くする。
    W.updateNearRain = function () { this.rainNear.visible = false; };
    const updateWorld = W.update;
    W.update = function (dt, focus) {
      updateWorld.call(this, dt, focus);
      if (!this.rain.visible) return;
      this.rain.geometry.setDrawRange(0, Math.floor(this.rain.geometry.drawRange.count / 4) * 2);
      this.rain.material.opacity *= 0.65;
    };
    W.setTime('storm'); W.setRainTarget(0.65);
    rt.setPhase('brief');
    rt.banner('楡俣川を渡れ', '雨の中、向こう岸に斎藤の旗');
    rt.obj('point', '楡俣川を渡り、向こう岸の畦で組をそろえよ', 'main');
    rt.marker('point', POINT2, '向こう岸の畦');
    rt.zone('point', POINT2.x, POINT2.z, 10);
    rt.say('組頭 源八', '渡るぞ！　槍を高く掲げ、足を取られるな。向こう岸の畦で組をそろえよ', 6);   // 渡る前は隣で怒鳴る
    rt.after(10, () => { if (!rt.flags.signal && !rt.flags.ending) rt.bark('「ついて来い」で組を連れ、「待て」で畦に並べる'); });
    // 公記：勘当の身の前田利家が、許しなく森部に加わり首を挙げた。
    rt.after(17, () => { if (!rt.flags.ending && !rt.over) rt.bark('組の者「森様の備に前田又左衛門殿がおるぞ。勘当の身で、許しも無く駆けつけたそうな」'); });
    rt.flags.point = POINT2;
    rt.flags.friends = [rt.flags.A, rt.flags.B, rt.flags.Y, rt.flags.R3];
    // 控えは開戦時からここにいる。後の段では追加せず、持ち場から歩いて出す。
    rt.flags.reserves = [[-44, -76, '長井の控え'], [12, -80, '日比野の控え']].map(([x, z, name]) =>
      enemyGroup(rt, { faction: 'saito', name, fixed: true, anchor: { x, z }, facing: 0, formation: 'yari', yariRanks: 3,
        aggro: 6, morale: 85, fleeDir: { x: 0, z: -1 } }, [{ type: 'ashigaru', n: 12 }, { type: 'samurai', n: 2 }]));
    rt.flags.opposition = [rt.flags.V, rt.flags.M, rt.flags.N, ...rt.flags.reserves, rt.flags.HM, rt.flags.HN];
    rt.flags.taskTick = 0;
    rt.flags.linePoint = { x: FRONT2.x, z: FRONT2.z };
    rt.tutStart('組への号令', [['cmd_follow', 'ついて来い'], ['cmd_hold', '待て'], ['cmd_retreat', '退け'], ['radial', '号令の輪']]);
    // 資料には確かな布陣図が無く、「墨俣は南西」と略図の北配置も食い違う。
    // 南北の会戦の並びは保つ。実兵は既に寄せた備、遠景は広い野に残る備として置く。
    const F = rt.flags;
    const KT = nagashinojo.kit;
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) =>
      W.addDistantArmy({ x, z, w, d, count, facing, armor, flag, mon: flag, seed, kind, host: false, flagRate: 0.25 });
    const KS = ['spear', 'bow', 'spear', 'spear', 'cavalry', 'spear', 'bow', 'honjin', 'spear'];
    // 墨俣側の控え。龍興本人の出陣を確かな事として描かない。
    F.farS = [[-224, -300], [-168, -360], [-48, -390], [44, -370], [136, -320], [-180, -240], [100, -260], null, [-100, -440]]
      .map((q, i) => q && DA(q[0], q[1], 26, KS[i] === 'bow' ? 6 : (KS[i] === 'honjin' ? 22 : 12), KS[i] === 'cavalry' ? 20 : KS[i] === 'bow' ? 55 : 150, 0, i % 2 ? 0x3a3a30 : 0x35382c, 'saito', 5 + i, KS[i])).filter(Boolean);
    const KO = ['spear', 'bow', 'cavalry', 'spear', 'mixed'];
    F.farO = [[-192, 580], [-100, 640], [0, 640], [-40, 500], [-260, 570]]
      .map(([x, z], i) => DA(x, z, 22, KO[i] === 'bow' ? 6 : 12, KO[i] === 'cavalry' ? 12 : 40, Math.PI, KT.ARMOR.oda, i === 2 ? 'eiraku' : 'oda', 20 + i, KO[i]));
    // 楡俣川を同じ時に渡る織田の後続（軽い作り）。合図で前へ出る。
    F.farX = [[-110, 96, 160], [-170, 100, 120], [120, 102, 120]]
      .map(([x, z, n], i) => DA(x, z, 34, 10, n, Math.PI, KT.ARMOR.oda, 'oda', 40 + i, 'spear'));
    F.farO.push(...F.farX);
    // 濃尾の野は平らで、雨の日は遠い山並みが見えない（灰色の空に山の形の穴が開いて見えるのを防ぐ）。
    if (W.mountains) W.mountains.visible = false;
    // 信長の本陣：陣幕の内に床几の大将と諸将、後ろに馬印と旗本
    F.odaCamp = camp(rt, { x: CAMP2.x, z: CAMP2.z, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長', haori: 0x7a1d14 }, guard: 15, reserve: 0, runTo: { x: -20, z: 60 } });
    // 陣幕の口と向きが逆でも、実兵の旗本は敵の来る北側を守る。
    const guard = F.odaCamp.guard, shift = CAMP2.z - 13 - guard.anchor.z;
    guard.anchor.z = CAMP2.z - 13;
    for (const u of guard.units) { u.pos.z += shift; u.pos.y = W.heightAt(u.pos.x, u.pos.z); u.mesh.position.copy(u.pos); }
    F.odaCamp.guard.formation = 'yari';
    rt.scene.add(nobori(W, -12, CAMP2.z + 6, 'eiraku', 6));
    // 遠景の村（西の在所）
    KT.farVillage(rt, -126, -30, { rot: -Math.PI / 2, n: 6, fields: 8, seed: 4 });
    // 両翼の槍の前線。音・旗・煙の仕組みは共通の呼び口を使う。
    F.fronts = [-92, 68].map((x, i) => clash(rt, { x, z: -16, facing: Math.PI, w: 26, gap0: 24, seed: 231 + i,
      noReserve: true,   // 台本の控え以外に、共通の新手を追加しない。
      noWake: true, noRout: false, killRate: 0.3, nearHide: 0, host: false,
      A: { flag: 'oda', armor: KT.ARMOR.oda, count: 100, kind: 'spear', team: 0, faction: 'oda' },
      B: { flag: 'saito', armor: KT.ARMOR.saito, count: 400, kind: 'spear', team: 1, faction: 'saito' } }));
    // 重複する後方軍勢は足さない。備え表の控えは上の遠景と開戦時の実兵へ結ぶ。
    // 序盤から川向こうの敵が見える。射かける音は実際の弓兵に任せる。
    for (const [x, z] of [[20, 54], [42, 52], [30, 48]]) rt.scene.add(nobori(W, x, z, 'saito', 5.5));
    rt.after(4, () => {
      const V = rt.flags.V;
      if (gone(V)) return;
      V.speed = 2.1;   // 雨の畦を先手が北岸へ寄せてくる。
      V.order = 'move'; V.dest = { x: 30, z: 60 };
      V.onArrive = (g) => { rt.flags.vArrived = rt.t; g.order = 'attack'; g.seekRange = 18; g.anchor = { x: 30, z: 60 }; };
      if (!rt.flags.signal) rt.marker('V', centerOf(V), '斎藤の先手', { red: true, group: V });
      rt.say('足軽', '向こう岸に斎藤の先手！　岸へ寄せてくるぞ！', 3);
    });
    buildBattleJin(rt);
    // 備え表の結び直しで弓混じりの横陣に戻っても、三列の槍組を保つ。
    for (const g of [...F.friends, ...F.opposition]) { g.formation = 'yari'; g.yariRanks = 3; }
    for (const g of rt.squadGroups) { g.formation = 'yari'; g.yariRanks = 2; }
    // 三手も遊び手と並んで楡俣川を渡り、北岸の畦に槍をそろえる。
    for (const [g, x, z] of [[F.A, 20, 60], [F.B, -22, 70], [F.Y, -40, 60], [F.R3, 64, 66]]) {
      g.leader = g.units.find((u) => u.type === 'busho') || g.units.find((u) => u.type === 'samurai');
      g.order = 'move'; g.dest = { x, z }; g.speed = 2;
      g.onArrive = (u) => { u.order = 'hold'; };
    }
  },

  update(rt, dt) {
    const F = rt.flags, p = rt.player.u.pos;
    nagashinojo.kit.backTick(rt);
    if (rt.over || F.ending || !rt.player.u.alive) return;
    // 時刻で言わせず、実際に腿ほどの水へ入った瞬間だけ知らせる。
    // 水深は描いた川面を使う。歩みの遅さと足元のしぶきも共通の水の処理へ結ぶ。
    if (!F.fordVoice && Math.abs(p.z - nireZ(p.x)) < 9 && rt.world.waterFootDepthAt(p.x, p.z, p.y) >= 0.4) {
      F.fordVoice = true;
      rt.hud.bark('組の者「腿まで来る……槍の穂を濡らすな」');
    }
    // 任務と隊の見直しは一秒ごと。毎コマ配列や行き先を作らない。
    F.taskTick -= dt;
    if (F.taskTick > 0) return;
    const elapsed = F.lastTask === undefined ? 1 : rt.t - F.lastTask;
    F.lastTask = rt.t; F.taskTick = 1;
    if (!F.breathUsed && F.signal && rt.player.u.hp > 0 && rt.player.u.hp < 30 && rt.G.difficulty !== 'hard') {
      F.breathUsed = true; F.breathUntil = rt.t + 12;
      rt.marker('retreatRoad', RETREAT2, '退く道・南の畦へ', { minor: true });
      rt.bark('仲間が槍で敵を止めた。今のうちに、南の畦へ下がれ', true);
    }
    // 使番の足を速めず、まだ前の下知を守っている理由を伝える。
    const waitingOrder = rt.squadGroups?.some((g) => g.pending?.id === 'attack' || g.pending?.id === 'follow');
    if (waitingOrder && !F.attackOrderWaiting) {
      F.attackOrderWaiting = true;
      rt.bark('使番が組へ走っている。旗のそばで下知が届くのを待て');
    } else if (F.attackOrderWaiting && !waitingOrder) {
      F.attackOrderWaiting = false;
      rt.bark('下知が組へ届いた。旗のそばで組の返事を聞け');
    }
    // 届いた号令と、列や地形で止まる理由を分けて記録する。一秒に一度だけ。
    for (const g of rt.squadGroups || []) {
      const st = g.moribeOrderStatus || (g.moribeOrderStatus = {});
      let ready = 0, fighting = 0, blocked = 0, rear = 0, moving = 0;
      for (const u of g.units) {
        if (!u.alive || u.fleeing || u.woundOut) continue;
        ready++;
        if (u.target?.alive && !u.target.isStruct) fighting++;
        if (u.pressBack || u._gated) rear++;
        if (u.moving > 0.1) moving++;
        const want = u.moveTo || g.slotPos(u.slot, g.initial);
        if (rt.army.wallBetween(u.pos, -1, want) || !rt.world.walkable(want.x, want.z)) blocked++;
      }
      st.order = g.pending ? '使番が向かっている' : g.order;
      st.ready = ready; st.fighting = fighting; st.blocked = blocked; st.rear = rear; st.moving = moving;
      st.target = g.focus?.name || g.units.find(u => u.alive && u.target?.alive)?.target?.group?.name || '';
      const reason = g.pending || moving || !ready ? '' : blocked ? '畦を回る。旗のそばへ寄れ！' : rear ? '前の槍を支えておる。列をそろえて押せ！' : fighting ? '敵の槍に止められておる。組で押し返せ！' : '';
      if (reason && reason !== st.reason && rt.t >= (F.squadStopSayAt || 0)) {
        rt.bark(`組の者「${reason}」`); F.squadStopSayAt = rt.t + 32;
      }
      st.reason = reason;
    }
    if (F.signal && (F.friends.every(gone) || F.odaCamp.general?.woundOut)) {
      if (!F.collapseWarn) { F.collapseWarn = rt.t; rt.bark('味方の備が崩れた。組を呼び、川の方へ下がれ', true); }
      if (rt.t >= 240 && rt.t - F.collapseWarn >= 30 && rt.canFailMission()) { this.endBattle(rt, false); return; }
    }
    // 固定の跡地でなく、今いる本備の横を指す。輪も使い回す。
    if (!gone(F.B)) {
      const c = F.B.center(); F.linePoint.x = c.x; F.linePoint.z = c.z;
      for (const ring of rt.rings) if (ring.userData.id === 'line') rt.drapeRing(ring, c.x, c.z);
    }
    let friendDist = Infinity;
    for (const g of F.friends) if (!gone(g)) { const c = g.center(); friendDist = Math.min(friendDist, Math.hypot(p.x - c.x, p.z - c.z)); }
    let squadDist = Infinity;
    for (const g of rt.squadGroups) if (!gone(g)) { const c = g.center(); squadDist = Math.min(squadDist, Math.hypot(p.x - c.x, p.z - c.z)); }
    const separated = F.signal && rt.t >= 30 && rt.t - F.signal >= 30 && F.stage !== 'assemble' &&
      (friendDist > 40 || (squadDist !== Infinity && squadDist > 40));
    const separateText = '味方の列か組から四十メートル以上離れた。組を呼び、近い味方の旗へ戻れ';
    if (separated && !(F.separateSayAt > rt.t)) {
      F.separateSayAt = rt.t + 32; rt.bark(separateText, true);
    }
    // 深手になる前に、実際に振りかぶっている相手と身の守り方を知らせる。
    const u = rt.player.u, threats = rt.army.threats;
    if (u.alive && threats && threats.some((e) => sightPoint(rt, e.pos)) && !(F.guardHelpT > rt.t)) {
      F.guardHelpT = rt.t + 32;
      const boss = threats.some((e) => e.type === 'busho' && sightPoint(rt, e.pos));
      rt.bark(boss ? '武将が振りかぶった。敵へ向き直って構え、味方の旗の後ろへ下がれ' : '敵が振りかぶった。敵へ向き直って構え、味方の旗の後ろへ下がれ', true);
    }
    if (!F.signal) {
      let alive = 0, near = 0;
      for (const u of rt.squad) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget && !u.group?.routed) { alive++; if (Math.hypot(u.pos.x - POINT2.x, u.pos.z - POINT2.z) < 16) near++; }
      const d = Math.hypot(p.x - POINT2.x, p.z - POINT2.z);
      // 畦のふちで足元がわずかに揺れても確認をやり直さない。外へ歩けば途切れる。
      F.pointInside = d < 10 || (F.pointInside && d < 10.8);
      if (alive > 0 && F.pointInside && near >= Math.ceil(alive * 0.6)) F.holdT = (F.holdT || 0) + elapsed;
      else {
        if (F.holdT > 0 && !F.pointInside && !(F.pointBreakAt > rt.t)) { F.pointBreakAt = rt.t + 8; rt.bark('畦の輪を離れ、列の確認が途切れた。旗の内で組を待て'); }
        F.holdT = 0;
      }
      if (!F.pointDone) rt.objProgress('point', F.pointInside ? near >= Math.ceil(alive * 0.6) && alive > 0 ? d >= 8 ? '輪のふちだ。中央へ二歩寄り、槍の列を整えよ' : '組がそろった。印の輪の内で槍の列を確かめている' : `戦える組 ${near}／${alive}人・深手 ${rt.squad.reduce((n, u) => n + (u.alive && !u.gone && !!u.woundOut ? 1 : 0), 0)}人・組を呼べ` : `印の輪の内へ あと${Math.max(1, Math.ceil(d - 10))}歩ほど・止まって組を待て`);
      if (!F.pointDone && F.holdT >= 8) {
        F.pointDone = true; rt.objDone('point'); rt.objRemove('point'); rt.unmark('point'); rt.unzone('point');
        rt.obj('wait', '畦で槍をそろえ、法螺貝の合図を待て', 'main');
        rt.award((t) => { t.c.point = 1; }, '渡河して組をそろえた');
        orderSpeech(rt, 'よし、槍をそろえたな。敵の先手を引きつけるぞ', 4);
      }
      if (!F.fordNudge && rt.t > 20 && !F.pointDone) { F.fordNudge = true; orderSpeech(rt, 'すぐそこの畦の印へ寄れ。組と槍をそろえるのじゃ', 4); }
      if (F.pointDone) rt.objProgress('wait', '槍はそろった。前備が動く合図を待て');
      if ((rt.t >= 12 && F.pointDone) || rt.t >= 45) this.signal(rt);
      return;
    }
    this.feedReserves(rt);
    this.advanceEnemies(rt);
    this.advanceFriends(rt);
    if (F.stage === 'contact') {
      if (!F.vBroken && gone(F.V)) this.onRout(rt, F.V);
      rt.objProgress(F.vBroken ? 'support' : 'break', F.breathUntil > rt.t ? '敵の足が止まっている。退く道の札へ下がれ' : separated ? separateText : F.vBroken ? '本備の横へ進み、長井と日比野が寄せる下知を待て' : '味方の列を離れず押す');
      // 先手が退いた時点で本備と控えを寄せる。次の斬り合いを待ってから下知しない。
      if (F.vBroken || rt.t - F.signal >= 55) {
        if (!F.vBroken) { if (gone(F.V)) this.onRout(rt, F.V); else rt.objFail('break'); }
        rt.objRemove('break'); rt.unmark('V');
        rt.objRemove('support'); rt.unmark('support');
        F.stage = 'hold'; F.holdStart = rt.t; F.lineT = 0;
        rt.setPhase('hold'); rt.banner('槍を打ち合わせる', '雨の中、両軍が押し合う');
        rt.obj('line', '本備の横で、組と槍をそろえて押し返せ', 'main');
        rt.marker('lineFlag', () => {
          const u = F.B.stds?.[0]?.userData.carrier;
          return u && u.alive && !u.fleeing && !u.woundOut && sightPoint(rt, u.pos) ? u.pos : null;
        }, () => F.lineAwarded ? '本備の旗・支えた列を保て' : '本備の旗・控えに備えよ', { group: F.B, minor: true });
        rt.marker('line', () => F.linePoint, () => F.lineT >= 40 ? '本備の横・列を支えた。控えに備えよ' : '本備の横・列を支えよ'); rt.zone('line', F.linePoint.x, F.linePoint.z, 24);
        orderSpeech(rt, '本備の横で槍をそろえよ。槍列の前へ一人で出るな。侍が踏み込んだら構え、列の後ろへ下がれ！', 5);
        for (const g of [F.M, F.N]) if (!gone(g)) { if (g.order !== 'move') g.order = 'attack'; g.seekRange = 30; }
      }
    } else if (F.stage === 'hold') {
      const el = rt.t - F.holdStart;
      let together = 0;
      for (const u of rt.squad) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget && !u.group?.routed && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 16) together++;
      if (together && Math.hypot(p.x - F.linePoint.x, p.z - F.linePoint.z) < 24 && !gone(F.B)) F.lineT += elapsed;
      const closeEnemy = rt.army.nearestEnemy(rt.player.u, 16, (u) => !u.fleeing && !u.woundOut && !u.noTarget);
      rt.objProgress('line', F.breathUntil > rt.t ? '敵の足が止まっている。退く道の札へ下がれ' : gone(F.B) ? closeEnemy ? '敵が近い。構えながら、南の畦へ下がれ' : '組を呼び、南の畦へ下がって列をそろえよ' : closeEnemy ? '目の前の敵へ構えよ。組と槍をそろえ、味方の旗の後ろへ下がれ' : !together ? '「ついて来い」で組をそばへ呼べ' : Math.hypot(p.x - F.linePoint.x, p.z - F.linePoint.z) >= 24 ? '組を呼び、近い味方の列に沿って本備の旗へ戻れ' : F.lineT >= 40 ? '槍列は支えた。敵の控えが寄せる間も、組と守れ' : '組と本備の横を守れ。列を離れると、持ちこたえた働きにならぬ');
      if (F.lineT >= 40 && !F.lineAwarded) { F.lineAwarded = true; rt.award((t) => t.side.push('槍の押し合いを支えた'), '槍列を支えた。控えにも備えよ'); }
      // 敵が退いた後に、百秒の時計だけを待たせない。控えも戦列に出してから確かめる。
      const enemyBroken = F.opposition.every(gone);
      if (el >= 100 || enemyBroken) {
        if (F.lineT >= 40) { rt.objDone('line'); }
        else rt.objFail('line');
        rt.objRemove('line'); rt.unmark('line'); rt.unmark('lineFlag'); rt.unzone('line');
        F.stage = 'press'; F.pressStart = rt.t; rt.setPhase('press');
        rt.banner(enemyBroken ? '敵が退いた' : '大将の旗本へ', enemyBroken ? '深追いせず、列を保て' : '長井甲斐守・日比野下野守の旗が、雨の向こうに残る');
        rt.obj('commanders', enemyBroken ? '深追いせず、敵の旗が退くのを見届けよ' : '味方と進み、長井と日比野の旗本を崩せ。大将へ一人で走るな', 'main');
        orderSpeech(rt, enemyBroken ? '敵は退いた。組を離すな。残る旗を見届けよ' : '見よ、長井と日比野が自ら出てきおった！　味方と並んで旗本を囲め。一人で大将へ走るな！', 5);
        if (!enemyBroken) {
          // 長い押し合いで両将も手負い。旗本に守られても、囲めば討てる。
          for (const g of [F.HM, F.HN]) if (!gone(g)) {
            g.speed = 2.2; g.seekRange = 35;
            for (const u of g.units) if (u.type === 'busho' && u.alive) u.hp = Math.min(u.hp, u.maxHp * 0.5);
            // 大将の後ろに控えていた後備が雨の中から続き、大将の周りが入り乱れる（見える兵は250まで）。
            const live = rt.army.units.reduce((n, u) => n + (u.alive ? 1 : 0), 0);
            if (live < 210) {
              const c = g.center();
              g.rear = enemyGroup(rt, { faction: 'saito', name: g === F.HM ? '日比野の後備' : '長井の後備', fixed: true,
                anchor: { x: c.x + (g === F.HM ? 8 : -8), z: c.z - 26 }, facing: 0, fleeDir: { x: 0, z: -1 }, aggro: 8, morale: 90, noRout: true, formation: 'yari', yariRanks: 2 },
              [{ type: 'ashigaru', n: 14 }, { type: 'samurai', n: 2 }]);
              g.rear.speed = 2.3;
              F.opposition.push(g.rear);
            }
          }
          battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.HM.anchor, F.HM, 1, true, '長井甲斐守・日比野下野守が、旗本を率いて自ら前へ出た');
          // 柴田の二の備が後ろから追いつき、自分の左右で大将の旗本へ槍を入れる。
          if (rt.army.units.reduce((n, u) => n + (u.alive ? 1 : 0), 0) < 215) {
            const p = rt.player.u.pos;
            const g2 = allyGroup(rt, { name: '柴田の二の備', fixed: true, anchor: { x: p.x + 6, z: p.z + 22 }, facing: Math.PI, aggro: 12, morale: 100, noRout: true, fleeDir: { x: 0, z: 1 }, formation: 'yari', yariRanks: 2 },
              [{ type: 'ashigaru', n: 16 }, { type: 'samurai', n: 2 }]);
            g2.order = 'attack'; g2.seekRange = 45; g2.speed = 2.4;
            F.friends.push(g2);
          }
        }
        for (const g of F.friends) if (!gone(g)) { g.calm = false; g.order = 'attack'; g.seekRange = 35; }
      }
    } else if (F.stage === 'press') {
      // 大将が長く討たれぬ時は、乱戦の別の所で織田の兵に討たれる（公記どおり両将とも討死。戦が終わらない事も防ぐ）。
      // 一人ずつ（七十五秒と百秒）。同じ瞬間に二つの見出しを重ねない。
      const fall = rt.t - F.pressStart >= 100 ? 2 : rt.t - F.pressStart >= 75 ? 1 : 0;
      if ((F.bossDown || 0) < fall && !(F.bossFallAt > rt.t)) {
        const u = F.HM.units.find((x) => x.type === 'busho' && x.alive) || F.HN.units.find((x) => x.type === 'busho' && x.alive);
        if (u) { F.bossFallAt = rt.t + 5; rt.army.kill(u, null); }
      }
      if (!F.standDown && fall >= 2) { F.standDown = true; for (const g of F.opposition) g.noRout = false; }
      // 総大将の討死・側面攻撃・逃亡の連鎖は共通の士気の仕組みに任せる。
      let left = 0, target = null;
      for (const g of F.opposition) if (!gone(g)) { left++; if (!target) target = g; }
      rt.objProgress('commanders', F.breathUntil > rt.t ? '敵の足が止まっている。退く道の札へ下がれ' : left ? F.marked?.units.some((u) => u.type === 'busho' && u.alive) ? '大将の周りの侍は固い。味方と並んで囲め' : '前の味方に続き、残る敵の備を押せ' : '敵の備は崩れた。追わず、集結の下知を待て');
      // 大将が生きている備を先に指す。印は大将の身に付け、旗本の侍に囲まれた所を見せる。
      for (const g of F.opposition) if (!gone(g) && g.units.some((u) => u.type === 'busho' && u.alive && !u.fleeing)) { target = g; break; }
      if (target !== F.marked) {
        F.marked = target;
        const boss = target?.units.find((u) => u.type === 'busho' && u.alive);
        if (boss) rt.marker('commanders', () => boss.alive && !boss.fleeing ? boss.pos : centerOf(target)(), `${boss.name}の旗本`, { red: true, group: target });
        else if (target) rt.marker('commanders', centerOf(target), '斎藤の旗', { red: true, group: target });
        else rt.unmark('commanders');
      }
      if (!left && !F.routWaitSaid) { F.routWaitSaid = true; orderSpeech(rt, '敵は引いた。ほかの手の敗走を確かめるまで、川への道を守れ', 4); }
      if (left) F.routConfirmT = null;
      else if (F.routConfirmT == null) F.routConfirmT = rt.t;
      if (!left && rt.t - F.routConfirmT >= 8) {
        F.sBack = true; F.stage = 'assemble'; F.assembleStart = rt.t; F.assembleT = 0;
        // 集結は柴田の旗の下（遠い元の畦まで歩かせない）。柴田の備が無ければ自分の居る所。
        { const c = !gone(F.A) ? F.A.center() : p; F.asm = { x: c.x, z: c.z }; }
        rt.objDone('commanders'); rt.objRemove('commanders'); rt.unmark('commanders');
        rt.banner('斎藤勢、崩れる', '旗が倒れ、北へ退いていく');
        battleEvent(rt, EVENT_RETREAT, FRONT2, null, 1, true, '斎藤勢が墨俣の方へ退き始めた');
        F.farS.forEach((m, i) => rt.after(i * 1.2, () => m.rout({ hideAfter: 0 })));
        F.fronts.forEach((c) => c.rout('B', { hideAfter: Infinity }));
        rt.obj('assemble', '深追いせず、組を集結の旗へ戻せ', 'main');
        rt.marker('assemble', F.asm, '集結の旗'); rt.zone('assemble', F.asm.x, F.asm.z, 12);
        orderSpeech(rt, '敵の備は崩れた！　追い散らすな。組を集め、川への道を固めよ', 5);
        for (const g of F.friends) if (!gone(g)) { g.order = 'move'; g.dest = { x: F.asm.x + (g === F.Y ? -26 : g === F.R3 ? 26 : g === F.A ? -8 : -16), z: F.asm.z };
          g.onArrive = (u) => { u.order = 'hold'; }; }
      }
    } else if (F.stage === 'assemble') {
      let alive = 0, near = 0;
      for (const u of rt.squad) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget && !u.group?.routed) { alive++; if (Math.hypot(u.pos.x - F.asm.x, u.pos.z - F.asm.z) < 18) near++; }
      const danger = rt.army.nearestEnemy(rt.player.u, 30, (u) => !u.fleeing && !u.woundOut && !u.noTarget);
      if (danger && sightPoint(rt, danger.pos) && !(F.pursuerAt > rt.t)) {
        F.pursuerAt = rt.t + 8;
        const dx = danger.pos.x - p.x, dz = danger.pos.z - p.z;
        rt.bark(`${Math.abs(dx) > Math.abs(dz) ? dx > 0 ? '東' : '西' : dz > 0 ? '南' : '北'}の追手が近い。味方と押し返せ`);
      }
      const othersReady = F.friends.every((g) => gone(g) || (g.order === 'hold' && Math.abs(g.anchor.z - F.asm.z) < 4));
      if (!danger && Math.hypot(p.x - F.asm.x, p.z - F.asm.z) < 12 && near >= Math.ceil(alive * 0.6)) F.assembleT += elapsed;
      else F.assembleT = 0;
      rt.objProgress('assemble', danger ? '旗のそばの追手を、味方と押し返せ' : Math.hypot(p.x - F.asm.x, p.z - F.asm.z) >= 12 ? '集結の旗の下へ戻れ' : F.assembleT >= 8 ? othersReady ? '組はそろった。川への道を見張れ' : 'ほかの手が集結へ戻っている。旗を見張り、帰着を待て' : alive ? `旗のそばの組 ${near}／${alive}人・組の六割ほどを集め、列を保て` : '旗の下で敵が来ないか見張れ');
      if (othersReady && F.assembleT >= 8) this.endBattle(rt, true);
    }
    if (!F.longWarn && rt.t >= 390) { F.longWarn = true; orderSpeech(rt, F.stage === 'assemble' ? '集結が遅れておる。旗の下へ組を呼べ。そろわねば任務を果たせぬ' : '攻めが長引いておる。備が崩れねば、組を川へ下げるぞ', 4); }
    if (!F.ending && rt.t >= 420) this.endBattle(rt, false);
  },

  feedReserves(rt) {
    const F = rt.flags, p = rt.player.u.pos;
    if (F.stage === 'assemble') return;
    let near = 0;
    for (const g of F.opposition) {
      if (gone(g) || (g === F.reserves[0] && !F.wave1) || (g === F.reserves[1] && !F.wave2)) continue;
      for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget &&
          u.type !== 'bow' && u.type !== 'gun' && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 30) near++;
    }
    // 前線が薄くなったら、段の時計より先に下知する。二手は十秒以上ずらす。
    const thin = rt.t - F.signal >= 25 && near <= 6;
    for (let i = 0; i < F.reserves.length; i++) {
      const warned = i ? 'wave2Warn' : 'wave1Warn', sent = i ? 'wave2' : 'wave1';
      if (F[sent] || gone(F.reserves[i])) continue;
      if (i && !gone(F.reserves[0]) && (!F.wave1 || rt.t - F.wave1At < 10)) continue;
      const due = F.stage === 'hold' && rt.t - F.holdStart >= (i ? 22 : 0);
      if (F[warned] === undefined && (due || thin || (!i && F.vBroken))) {
        F[warned] = rt.t;
        rt.marker('retreatRoad', RETREAT2, '退く道・南の畦へ', { minor: true });
        rt.bark(i ? '斎藤の控えがまた来る。囲まれる前に、南の畦へ下がれ' : '斎藤の控えが来る。退く道は南の畦だ。味方の旗の後ろへ下がれ', true);
      }
      if (F[warned] !== undefined && rt.t - F[warned] >= 4) {
        F[sent] = true; F[i ? 'wave2At' : 'wave1At'] = rt.t; this.reserve(rt, i);
      }
    }
  },

  advanceEnemies(rt) {
    const F = rt.flags;
    if (F.stage === 'assemble') return;
    const flag = rt.squadGroups.find((g) => !gone(g));
    const cFlag = flag ? fightingCenter(flag) : rt.player.u.pos;
    const p = rt.player.u.pos;
    const aim = Math.hypot(cFlag.x - p.x, cFlag.z - p.z) <= 24 ? p : cFlag;
    for (const g of F.opposition) {
      if (gone(g) || (g === F.reserves[0] && !F.wave1) || (g === F.reserves[1] && !F.wave2) || (g.hatamoto && F.stage !== 'press')) continue;
      if (g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget &&
          u.type !== 'bow' && u.type !== 'gun' && u.target?.alive && !u.target.gone &&
          !u.target.fleeing && !u.target.woundOut && !u.target.noTarget &&
          Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) < 8)) continue;
      const c = fightingCenter(g);
      if (Math.hypot(c.x - aim.x, c.z - aim.z) <= 18) {
        // 前列は着いている。後列の到着待ちで「移動」の探索六歩に閉じ込めない。
        g.order = 'attack'; g.seekRange = 35; g.onArrive = null;
        continue;
      }
      const dest = g._moribePushDest || (g._moribePushDest = { x: 0, z: 0 });
      dest.x = aim.x + (g === F.N || g === F.reserves[0] ? -6 : 6); dest.z = aim.z - 6;
      g.order = 'move'; g.dest = dest;
      g.onArrive = g._moribePushArrive || (g._moribePushArrive = (arrived) => { arrived.order = 'attack'; arrived.seekRange = 35; });
    }
  },

  advanceFriends(rt) {
    // 「攻める」だけでは探索の外の敵へ歩かず、古い畦へ戻り続ける。
    // 先手の後も同じ兵が前へ続く。本備は会戦の範囲で自分の後ろを支える。
    const F = rt.flags, p = rt.player.u.pos;
    if (F.stage === 'assemble') return;
    for (const g of F.friends) {
      if (gone(g) || (g.order !== 'attack' && g.order !== 'move') || g.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget &&
          u.target?.alive && !u.target.fleeing && !u.target.woundOut && !u.target.noTarget &&
          Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 8)) continue;
      const c = fightingCenter(g);
      const escort = g === F.B && Math.hypot(p.x - FRONT2.x, p.z - FRONT2.z) < 65 &&
        Math.hypot(p.x - c.x, p.z - c.z) > 18;
      let nearest = null, distance = Infinity;
      // 山場は全員が大将の旗本へ寄り、自分の周りに斬り合いを集める。
      const mk = F.stage === 'press' && F.marked && !gone(F.marked) ? F.marked : null;
      if (mk) { nearest = mk.center(); distance = Math.hypot(nearest.x - c.x, nearest.z - c.z); }
      else for (const foe of F.opposition) {
        if (gone(foe) || (foe.hatamoto && F.stage !== 'press') ||
            (foe === F.reserves[0] && !F.wave1) || (foe === F.reserves[1] && !F.wave2)) continue;
        const q = fightingCenter(foe), d = Math.hypot(q.x - c.x, q.z - c.z);
        if (d < distance) { nearest = q; distance = d; }
      }
      if (!escort && (!nearest || distance <= 18)) {
        if (nearest) { g.order = 'attack'; g.seekRange = 35; g.onArrive = null; }
        continue;
      }
      const dest = g._moribePressDest || (g._moribePressDest = { x: 0, z: 0 });
      if (escort) { dest.x = p.x - 8; dest.z = p.z + 8; }
      else {
        dest.x = nearest.x + (c.x - nearest.x) / distance * 12;
        dest.z = nearest.z + (c.z - nearest.z) / distance * 12;
      }
      g.order = 'move'; g.dest = dest;
      g.onArrive = g._moribePressArrive || (g._moribePressArrive = (arrived) => { arrived.order = 'attack'; arrived.seekRange = 35; });
    }
  },

  signal(rt) {
    const F = rt.flags;
    if (rt.over || F.ending || F.signal) return;
    F.signal = rt.t; F.stage = 'contact'; rt.setPhase('contact');
    if (!F.pointDone) rt.objFail('point');
    rt.objRemove('point'); rt.unmark('point'); rt.unzone('point');
    if (F.pointDone) { rt.objDone('wait'); rt.objRemove('wait'); }
    rt.tutEnd();
    F.signalSoundAt = rt.t;   // 開戦の貝に、隊ごとの合図を重ねない。
    sfx('horagai', 1); rt.banner('かかれ', '前備に続いて槍を入れよ');
    rt.obj('break', '味方の前備と共に、斎藤の先手を押せ', 'main');
    rt.marker('V', centerOf(F.V), '斎藤の先手', { red: true, group: F.V });
    orderSpeech(rt, '合図じゃ！　前備に続け。槍の列を切らすな！', 4);
    for (const g of F.friends) if (!gone(g)) { g.onArrive = null; g.order = 'attack'; g.seekRange = 40; }
    // 中央も隊ごとに前へ出す。左右は中央を突っ切らず、それぞれの畦から横へ回る。
    for (const [g, x, z] of [[F.A, 18, 40], [F.B, -12, 44], [F.Y, -46, 22], [F.R3, 50, 30]]) if (!gone(g)) {
      g.order = 'move'; g.dest = { x, z };
      g.onArrive = (u) => { u.order = 'attack'; u.seekRange = 35; };
    }
    F.V.noRout = false;
    for (const g of [F.M, F.N]) if (!gone(g)) {
      g.order = 'move'; g.dest = { x: g === F.M ? -12 : -44, z: 8 }; g.speed = 2.1;
      // 大将の旗本も備のすぐ後ろへ詰め、押し合いの間は旗を立てて控える。
      const h = g === F.M ? F.HM : F.HN;
      h.order = 'move'; h.dest = { x: g === F.M ? -8 : -36, z: -28 }; h.speed = 1.8;
      h.onArrive = (a) => { a.order = 'hold'; };
      g.onArrive = (u) => { u.order = 'attack'; u.seekRange = 40; };
    }
    // 先手が戦う間に既存の控えを本備の後ろまで歩かせる。初めの斬り合いには加えない。
    for (let i = 0; i < F.reserves.length; i++) {
      const g = F.reserves[i];
      g.order = 'move'; g.dest = { x: i ? 8 : -32, z: i ? -20 : -14 }; g.speed = 2.1;
      g.onArrive = (arrived) => { arrived.order = 'hold'; };
    }
    F.fronts.forEach((c) => c.go());
    F.farO.forEach((m, i) => rt.after(i * 1.3, () => m.advance(24, 18)));
    battleEvent(rt, EVENT_COMMANDER_ADVANCE, F.A.anchor, F.A, 0, true, '織田の槍の列が前へ出た');
  },

  reserve(rt, index) {
    const g = rt.flags.reserves[index];
    if (gone(g)) return;
    const flag = rt.squadGroups.find((squad) => !gone(squad));
    const cFlag = flag ? fightingCenter(flag) : rt.player.u.pos;
    const p = rt.player.u.pos;
    const aim = Math.hypot(cFlag.x - p.x, cFlag.z - p.z) <= 24 ? p : cFlag;
    const dest = g._moribePushDest || (g._moribePushDest = { x: 0, z: 0 });
    dest.x = aim.x + (index ? 6 : -6); dest.z = aim.z - 6;
    g.order = 'move'; g.dest = dest; g.speed = 2.1;
    g.onArrive = (u) => { u.order = 'attack'; u.seekRange = 35; };
    battleEvent(rt, EVENT_REINFORCEMENT, g.center(), g, 1, false, '斎藤の控えが前へ出る');
  },

  endBattle(rt, won) {
    const F = rt.flags;
    // 七分の期限・味方の崩壊は戦固有の決着。近くの敵で共通の待ち時間を延ばさない。
    if (!won && rt.t < 420 && (!rt.canFailMission() || rt.t < 240)) return;
    if (rt.over || F.ending) return;
    F.ending = true; rt.tracker.main = won;
    if (!won) for (const g of F.friends) if (!gone(g)) {
      g.order = 'move'; g.dest = { x: g.anchor.x, z: 116 }; g.onArrive = (u) => { u.order = 'hold'; };
    }
    if (F.stage === 'assemble') {
      if (won && F.assembleT >= 8) { rt.objDone('assemble'); rt.award((t) => t.side.push('勝った後も組をまとめた'), '勝った後も組をまとめた'); }
      else rt.objFail('assemble');
    } else { rt.objFail(F.stage === 'hold' ? 'line' : F.stage === 'contact' ? 'break' : 'commanders'); }
    rt.unmark('support'); rt.objRemove('support');
    rt.unmark('assemble'); rt.unzone('assemble'); rt.unmark('commanders'); rt.unmark('line'); rt.unmark('lineFlag'); rt.unzone('line'); rt.unmark('V');
    rt.banner(won ? '森部の勝ち戦' : '組を下げよ', won ? '敵が退き、組の持ち場を固めた' : F.friends.every(gone) || F.odaCamp.general?.woundOut ? '味方の備が崩れた。残る者と川へ退け' : F.stage === 'assemble' ? '組の集結を果たせなかった。川への道を守りながら退け' : '攻めが長引いた。敵の備が残るため川へ退け');
    orderSpeech(rt, won ? 'よう押し切った。組を離すな。勝鬨を上げるぞ' : 'これ以上は押せぬ。組を川の手前へ下げ、備えを立て直せ', 4);
    if (won) {
      // 雨が細り、勝鬨。首実検と次の戦（墨俣）への引きで余韻を残す。
      rt.world.setRainTarget?.(0.25);
      rt.after(2, () => { sfx('victory', 0.9); rt.bark('織田勢「えい、えい、おう！」'); });
      rt.marker('yakushi', YAKUSHI2, '森部の薬師堂・場所と姿は復元');
      rt.after(5, () => {
        // 首実検は共通の首袋・証人の記録に従う。利家へ手柄を付け替えない。
        let confirmed = false, who = '';
        for (const r of rt.meritKills || []) {
          if (r.foe.name !== '足立六兵衛') continue;
          if (r.src.isPlayer) { who = 'player'; break; }
          if (r.src.name !== '前田利家') continue;
          const witness = r.witnesses.some((u) => u.alive && !u.fled && !u.fleeing);
          const head = r.head && r.carrier?.alive && !r.carrier.fled && !r.carrier.fleeing;
          if (head || witness) { confirmed = true; break; }
        }
        F.toshiieAdachiConfirmed = confirmed;
        rt.say('組の者', who === 'player' ? '首取り足立と呼ばれた六兵衛を、お主が討ったとは……' : confirmed ? '前田又左衛門殿が、首取り足立の首を挙げなされた。勘当も解けような' : '前田又左衛門殿も首を挙げたと聞いた。勘当の身で、ようやるわ', 4.5);
      });
      rt.after(10, () => rt.say('組頭 源八', `${(F.bossDown || 0) >= 2 ? '長井も日比野も討たれた' : '長井と日比野の備は崩れた'}。殿はこのまま墨俣へ入られる。洲に砦を構えれば、稲葉山は目の前じゃ`, 5));
    }
    if (!won) sfx('horagai', 0.7);
    rt.finish({ scriptedEnd: true }, won ? 16 : 11);
  },

  onRout(rt, g) {
    const F = rt.flags;
    if (g === F.V && F.signal && F.stage === 'contact' && !F.vBroken) {
      F.vBroken = true; rt.unmark('V'); rt.objDone('break'); rt.objRemove('break');
      rt.obj('support', '本備の横へ進み、長井と日比野の寄せに備えよ', 'main');
      rt.marker('support', FRONT2, '本備の横');
      rt.award((t) => t.side.push('斎藤の先手を押し返した'), '斎藤の先手を押し返した');
      orderSpeech(rt, '先手は退いた。まだ長井と日比野の備があるぞ！', 4);
    }
    if (!F.ending && !rt.over && (g === F.M || g === F.N) && sightPoint(rt, g.center())) battleEvent(rt, EVENT_UNIT_BREAK, g.anchor, g, 1, true, '斎藤の備が崩れた');
  },

  onKill(rt, v, k) {
    if (v.name === '足立六兵衛' && k?.name === '前田利家' && !rt.flags.toshiieReport) {
      rt.flags.toshiieReport = true; rt.flags.toshiieAdachi = true;
      if (sightPoint(rt, v.pos)) rt.say('足軽', '利家殿が足立六兵衛を討ったぞ！', 3);
    }
    if (v.team === 1) rt.flags.ek = (rt.flags.ek || 0) + 1; else rt.flags.ak = (rt.flags.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (v.type === 'busho' && v.group?.hatamoto) {
      const F = rt.flags;
      F.bossDown = (F.bossDown || 0) + 1;
      // 公記：長井甲斐守・日比野下野守とも討死。名を呼ばわり、残る備の足をすくませる。
      rt.banner(`${v.name}、討死`, F.bossDown >= 2 ? '両将が討たれた。斎藤勢が浮き足立つ' : 'もう一人の大将の旗が残る');
      rt.say(k?.isPlayer ? rt.G.name || '自分' : '足軽', k?.isPlayer ? `${v.name}、討ち取ったり！` : `${v.name}を討ち取ったぞ！`, 4);
      if (k?.isPlayer) rt.award((t) => { t.special = { label: `${v.name}を討ち取った`, pts: 40 }; }, `${v.name}を討ち取った`, v.pos);
      sfx('toki', 0.9);
      // 大将の生きている間は旗本が踏みとどまる。討たれた備から崩れ、両将が討たれれば全体が揺らぐ。
      v.group.noRout = false;
      if (v.group.rear) v.group.rear.noRout = false;
      if (F.bossDown >= 2) for (const g of F.opposition) g.noRout = false;
      for (const g of F.opposition) if (!gone(g)) g.morale = Math.max(0, (g.morale ?? 80) - (g === v.group ? 45 : F.bossDown >= 2 ? 40 : 15));
      F.marked = null;
    }
  },
  onPlayerHit(rt, t) {
    if (!rt.flags.signal && !rt.flags.early && t.team === 1 && t.target !== rt.player.u) {
      rt.flags.early = true; rt.award((t) => t.violations.push('合図の前に仕掛けた'), '命令違反：合図の前に仕掛けた');
      orderSpeech(rt, '槍をそろえるまで待て！');
    }
  },
  onSquadCommand(rt, id) {
    if (!rt.flags.signal && !rt.flags.early && (id === 'attack' || id === 'focus')) {
      rt.flags.early = true; rt.award((t) => t.violations.push('合図の前に突撃を命じた'), '命令違反：合図の前に突撃を命じた');
      orderSpeech(rt, 'まだじゃ！　組をそろえよ！');
    }
  },
};

// 遊び手の代わりに動かす時も、同じ段と札に従う。
moribe.botOrders = true;   // 渡河・持ち場・反撃の待ちを、性格の突進で上書きしない。
moribe.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE'); inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
  if (!u.alive || F.ending) return;
  const sq = b.squadGroups[0];
  const gathering = !F.signal || F.stage === 'assemble';
  if (sq && gathering && sq.order !== 'follow' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 5; }
  // 構えは正面だけに効く。最寄りの兵より、実際に打ち込む相手を先に受ける。
  let attacker = null, attackDist = 10;
  if (b.army.threats) for (const o of b.army.threats) {
    if (!o.alive || o.fleeing || o.team === u.team || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    if (d < attackDist) { attacker = o; attackDist = d; }
  }
  // 戦場で実際に落馬した馬だけを拾う。開戦時の空馬は置かない。
  if ((!gathering || (F.pointDone && !F.signal)) && !attacker && !p.mounted && p.mountT <= 0 && !b.army.nearestEnemy(u, 8)) {
    let horse = p.catching?.o || null, hd = gathering ? 6 : 12;
    if (!horse) for (const o of b.army.looseHorses || []) {
      if (!o.from || !o.h.parent || o.mode === 'fled') continue;
      if (gathering && Math.hypot(o.h.position.x - POINT2.x, o.h.position.z - POINT2.z) >= 8) continue;
      const d = Math.hypot(o.h.position.x - u.pos.x, o.h.position.z - u.pos.z);
      if (d < hd) { hd = d; horse = o; }
    }
    if (horse) {
      if (p.lock) inp.e.add('KeyQ');
      inp.runHeld = false;
      if (p.catching) {
        inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      } else if (hd < 3) inp.e.add('KeyR');
      else goTo(p, inp, horse.h.position.x, horse.h.position.z, 2.5);
      return;
    }
  }
  if (gathering && !attacker) { const q = F.stage === 'assemble' ? (F.asm || ASSEMBLY2) : POINT2; goTo(p, inp, q.x, q.z, 5); return; }
  if (F.breathUntil > b.t) {
    if (p.lock) inp.e.add('KeyQ');
    goTo(p, inp, RETREAT2.x, RETREAT2.z, 5);
    if (sq && sq.order !== 'follow' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 5; }
    return;
  }
  // 退ける間が終わった後の手当ては共通の頭に任せる。自然回復はないので、
  // 体力が四分の三へ戻るまで待つと、畦で背を向けたまま戦えなくなる。
  // 押し合いの持ち場にいる敵へ寄る。十四歩の外で戦う敵を見落として、畦で待ち続けない。
  // 構えを解いて突くまで、届く相手を保つ。近い兵が入れ替わるたびに
  // 半秒の反撃待ちを消すと、敵が大勢いても一度も突けない。
  const previous = p.botStrikeFoe;
  const keep = p.botStrikeUntil > p.time && previous?.alive && !previous.noTarget && !previous.fleeing && !previous.invuln &&
    previous.team !== u.team && Math.abs(previous.pos.y - u.pos.y) < 3 &&
    Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < (p.weapon === 'sword' ? 1.9 : 2.8) &&
    !b.army.wallBetween(u.pos, -1, previous.pos) &&
    (F.stage !== 'hold' || Math.hypot(previous.pos.x - FRONT2.x, previous.pos.z - FRONT2.z) < 38);
  const e = attacker || (keep ? previous : null) || b.army.nearestEnemy(u, F.stage === 'hold' || F.stage === 'press' ? 40 : 14,
    (o) => !o.noTarget && !o.fleeing && !o.invuln && o.type !== 'dummy' &&
      Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos) &&
      (F.stage !== 'hold' || Math.hypot(o.pos.x - FRONT2.x, o.pos.z - FRONT2.z) < 38));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    if (attacker) {
      // 他の打ち手がいなければ、長い振りかぶりに先の突きを合わせる。
      // 全ての振りかぶりで反撃待ちを消すと、槍を解く半秒が取れない。
      let opening = !u.mobbed && d < reach;
      if (opening) for (const o of b.army.threats) {
        if (o !== attacker && o.alive && !o.fleeing && o.team !== u.team &&
            Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) <= o.reach + 0.3 &&
            !b.army.wallBetween(u.pos, -1, o.pos)) { opening = false; break; }
      }
      inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD');
      patientStrike(p, inp, e, d, opening);
    } else {
      if (!gathering && d > reach * 0.85 && !e.charging) goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
      patientStrike(p, inp, e, d);
    }
    // 遠い敵への突撃は、まず「移動」してから攻撃に変わる。
    // 三秒で言い直すと、四秒内の同じ号令を取り消す仕組みに掛かってしまう。
    if (!gathering && sq && sq.order !== 'attack' && sq.order !== 'move' && !(b.botCmdT > b.t)) { inp.e.add('KeyC'); b.botCmdT = b.t + 5; }
    return;
  }
  let q = FRONT2;
  if (F.stage === 'contact' && !gone(F.V)) q = F.V.center();
  if (F.stage === 'press') { const g = F.opposition.find((g) => !gone(g)); if (g) q = g.center(); }
  // 次の敵へ向かう間は組も連れて行く。前の戦場に残った組を迎えに戻る往復を防ぐ。
  if (sq && sq.order !== 'follow' && sq.order !== 'move' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 5; }
  goTo(p, inp, q.x, q.z, 4);
};
moribe.canSkip = () => '';   // 雨中の布陣から槍の会戦まで、同じ時計で進める。
moribe.rts = true;
moribe.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '斎藤軍', mon: 'saito' } };
moribe.date = () => `永禄四年五月十四日　${seasonOf('五月')}・昼・雨`;
// 千五百対六千は伝承上の目安。公記の森部の記事自体には総兵数の記載がない。
moribe.force = () => ({ a: 1500, a0: 1500, b: 6000, b0: 6000 });
moribe.history = '信長公記の森部の記事は、五月十四日の雨、墨俣から長井甲斐守・日比野下野守が出たこと、信長が楡俣川を越え、長く槍を合わせたことを記す。両将を含む百七十余人が討たれた。前田利家が足立六兵衛を討ったとも記す。永禄四年とするのが通説だが、この記事そのものには年の記載がない。織田約千五百、斎藤約六千は伝承上の目安。川の位置や細かな布陣には諸説があり、浅瀬・畦の持ち場・控えの押し出す順は復元である。三手の細かな配分・将の持ち場・昼の明るさは確定できない。数刻の戦いを短い時間に縮め、見える兵も総勢全員を描くものではない。主人公は上役の下知で自分の槍組を動かす。組の任務失敗は史実の織田軍の敗北を意味しない。';
export { moribe };
