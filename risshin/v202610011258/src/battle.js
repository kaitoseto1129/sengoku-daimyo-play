import * as THREE from 'three';
import { World, WIND_STATE } from './world.js';
import { Army, buildModel, buildHorse, animateHorse, poseArms, seatLegs, UNIT_WET, GENERALS, FACTION, distToSeg } from './units.js';
import { drawMon } from './textures.js';
import { tagOf, TAG_COL, groupKind, groupGeneral } from './hud.js';
import { updateHumans } from './humans.js';
import { Player, RADIAL, GROUP_NAME } from './player.js';
import { MeritTracker, RANKS, scenario, TOMO, tomoAlive, tomoCap, BATTLES, relOf } from './state.js';
import { sfx, setCrowd, setRain, ambience, setScene, afterBattle, silence, farNext, deafen, hush, fadeAway } from './audio.js';
import { S, QUALITY, DIFFICULTY, hintSeen, markHint, K } from './settings.js';
import { TITLES } from './state.js';
import { Commander } from './ai.js';
import { isTouch } from './touch.js';
import { SOLIDS } from './props.js';
import { reset as flReset, FL } from './floors.js';
import { updateLadders, resetLadders } from './siege_ladder.js';
import { kumiList, kamaeTick } from './kumi.js';
import { taishoInit, taishoTick, taishoKill } from './taisho.js';
import { realmBattle } from './realm.js';
import { pickLine, monOf } from './lines_data.js';
const TOFF = typeof location !== 'undefined' && /[?&]toff\b/.test(location.search);   // 試し：緊迫の仕組みを切る

// 遠くまで届く音：音の名 → 半分ほどの大きさに落ちる遠さ（m）。ここに無い音は 55m で聞こえなくなる
const FAR_SOUND = { tramp: 40, gun: 55, volley: 80, horagai: 160, taiko: 90, jindaiko: 110, kane: 120, gallop: 45, hooves: 26, eshout: 40, shout: 45, toki: 55, eiei: 55, cry: 24, neigh: 35, thunder: 400 };
// 近くで鳴ると画面が揺れる音：[揺れの強さ, 届く遠さ m]
const SHAKE_SOUND = { volley: [0.07, 22], gun: [0.025, 9], gallop: [0.05, 18], hooves: [0.018, 8], crash: [0.12, 26], doorSlam: [0.1, 22] };
// すぐそばで鳴ると耳が遠くなる音：届く遠さ m
const DEAF_SOUND = { volley: 11, gun: 4.5 };

// 状況に応じて一度だけ出すヒント
const HINTS = {
  // 技の出し方（三度ふるった時に一度だけ）。押す向き・長押し・連打で技が変わる
  waza: ['槍の技：押す向きと長さで変わる', '横へ押して突く＝払い　後ろ＝石突き　構えて前＝叩き　長押し＝溜め突き　もっと長く＝振り回し'],
  waza_k: ['刀の技：押す向きと長さで変わる', '続けて斬る＝切り返し　横へ押して斬る＝横薙ぎ　構えて＝突き　長押し＝真っ向斬り'],
  move: ['W A S D で歩き、マウスで見回す。Shift で走る', 'マウスホイールで視点の距離、T で肩越しの左右を切替'],
  practice: ['藁人形で試し突き。左クリックで突き、素早く3回押すと連続突き（3回目は強い）', '右クリックで構え、構えたまま左クリックで薙ぎ払い'],
  attack: ['敵が近い。照準が朱色になったら槍が届く間合い', 'Q で敵を狙い定めると、見失わずに戦える'],
  guard: ['右クリックで構えると正面からの攻撃を防げる', '敵の頭上に「！」が出たら攻撃の合図。その直前に構えると受け流しになる'],
  counter: ['受け流した直後の一撃は「反撃」になり、威力が大きい', ''],
  run: ['走ると気力を使う。気力が尽きると回避も攻撃もできない', ''],
  get squad() { return [`組を率いている。${K('follow')} ついて来い／${K('hold')} 待て／${K('attack')} 突撃／${K('retreat')} 退け`, `${K('command')} を開くと全ての号令と説明が見られる`]; },
  rally: ['組の士気が下がっている。F で鼓舞すると士気が戻る', '士気が尽きた組は崩れて逃げ出す'],
  far: ['組と離れすぎている。Z で「ついて来い」', ''],
  head: ['倒した侍の首を取れる（E）。ただし戦によっては下知に背くことになる', ''],
  map: ['M で戦術マップ。L で会話の記録', ''],
  bows: ['弓・鉄砲・騎馬の隊は Tab → G（号令の輪を開いたままでも）で号令先を切り替えて動かせる', '弓隊は敵に詰め寄られると下がって間合いを取る'],
  blocked: ['敵も正面からの突きを構えて防ぐことがある', '薙ぎ払い・溜め突き（左を押し続けて離す）・背後からの一撃・反撃は防がれない'],
  tooClose: ['敵に懐へ入られると、槍は力が出ない', '一歩下がって間合いを取るか、打刀（2）に持ち替える。味方と肩を並べると槍は強い'],
  ride: ['馬上にいる。W で並足、Shift で駆ける。向きは馬が少しずつ変える', '駆けて突けば重い一撃。Space で手綱を引いて急に止まる。R で降りる'],
  dismount: ['馬を降りた。馬はその場で待つ', '近くで R を押すと乗る。遠ければ R で口笛を吹いて呼ぶ'],
  gun: ['鉄砲は狙いを定めるのに時間がかかり、撃てば長い装填に入る', '「！」が出たら回避（Space）するか、装填の間に詰め寄れ。散開すると当たりにくい'],
  alt: ['Alt を押している間、自分の組の居場所と名前が頭上に出る', '乱戦で組を見失ったときに'],
  roster: ['部下には名前がある。生き残った者は次の戦で古参となり、強くなる', '城下の「組」で名簿を見られる'],
  // 初めて出会った時だけの短い札（二度目からは出さない）
  fence: ['柵の隙間から槍で突ける。柵に取り付いた敵を突き落とせ', '柵の外へ出ると、騎馬と鉄砲の的になる'],
  yarifusuma: ['槍衾：槍先を揃えた列。正面から突っ込むと串刺しになる', '横か後ろへ回るか、弓・鉄砲で列を崩してから寄れ'],
};
// 指で遊ぶ端末のヒント（キーの名前を、右下の丸の名前に。null は出さない）
const HINTS_TOUCH = {
  waza: ['槍の技：左の棒の向きと長押しで変わる', '横へ倒して「突く」＝払い　後ろ＝石突き　「構え」の直後に前へ＝叩き　長押し＝溜め突き　もっと長く＝振り回し'],
  waza_k: ['刀の技：左の棒の向きと長押しで変わる', '続けて押す＝切り返し　横へ倒して＝横薙ぎ　「構え」の直後＝突き　長押し＝真っ向斬り'],
  move: ['左の親指で画面をなぞって歩く。外まで押し込むと走る', '画面の右側をなぞって見回す'],
  practice: ['藁人形で試し突き。「突く」を押す。素早く3回で連続突き（3回目は強い）', '「構え」を押したまま「突く」で薙ぎ払い'],
  attack: ['敵が近い。照準が朱色になったら槍が届く間合い', '「狙い」で敵を狙い定めると、見失わずに戦える'],
  guard: ['「構え」を押している間、正面からの攻撃を防げる', '敵の頭上に「！」が出たら攻撃の合図。その直前に構えると受け流しになる'],
  squad: ['組を率いている。「号令」を押して、ついて来い・待て・突撃・退けを選ぶ', '「号令」を押したまま指を滑らせても選べる'],
  rally: ['組の士気が下がっている。「鼓舞」を押すと士気が戻る', '士気が尽きた組は崩れて逃げ出す'],
  far: ['組と離れすぎている。「号令」から「ついて来い」', ''],
  head: ['倒した侍の首を取れる（「取る」を押す）。ただし戦によっては下知に背くことになる', ''],
  map: ['左上の「地図」で戦術地図が開く', '字幕を押すと、会話の記録が開く'],
  bows: ['弓・鉄砲・騎馬の隊は、右下の隊の札を押して号令先を切り替えて動かせる', '弓隊は敵に詰め寄られると下がって間合いを取る'],
  blocked: ['敵も正面からの突きを構えて防ぐことがある', '薙ぎ払い・溜め突き（「突く」を長押しして放す）・背後からの一撃・反撃は防がれない'],
  tooClose: ['敵に懐へ入られると、槍は力が出ない', '一歩下がって間合いを取るか、「持替」で打刀に持ち替える。味方と肩を並べると槍は強い'],
  ride: ['馬上にいる。左の親指で進む。外まで押し込むと駆ける', '駆けて突けば重い一撃。「手綱」で急に止まる。「降りる」で馬を降りる'],
  dismount: ['馬を降りた。馬はその場で待つ', '近くで「乗る」を押すと乗る。遠ければ「乗る」で口笛を吹いて呼ぶ'],
  gun: ['鉄砲は狙いを定めるのに時間がかかり、撃てば長い装填に入る', '「！」が出たら「回避」を押すか、装填の間に詰め寄れ。散開すると当たりにくい'],
  alt: ['下の組の札を長押しすると、組の兵の居場所と名が頭の上に出る', '乱戦で組を見失ったときに'],
};
// 手ほどきの間でも、すぐに出すヒント（戦いの最中の大事な事）
const HINT_NOW = new Set(['attack', 'guard', 'counter', 'gun', 'tooClose', 'blocked', 'far', 'rally', 'head', 'ride', 'dismount']);

// 初めての戦の手ほどき：字を読ませず、やって覚える。一度に一つだけ、短い札を出し、やれば「よし」で消える
// 次の札は、行軍を少し進めてから（COACH_GAP 秒）。先にやってしまった段は、黙って済ませる
// 済んだ段は二度と出さない（設定の「ヒントをもう一度すべて表示する」で戻る）
// [id, する事, PC での操作, 指での操作]。操作は一言（キーか、押す丸の名）
const COACH = () => [
  ['c_move', '歩く', `${K('forward')}${K('left')}${K('back')}${K('right')}`, '左をなぞる'],
  ['c_look', '見回す', 'マウス', '右をなぞる'],
  ['c_guard', '構える', '右クリック長押し', '「構え」長押し'],
  ['c_swing', '突く', '左クリック', '「突く」'],
  ['c_cmd', '号令「ついて来い」', K('follow'), '「号令」'],
];
// 段と段の間（秒）。はじめの二つは続けて、構え・突き・号令は行軍の間に間を置いて
const COACH_GAP = { c_look: 1.5, c_guard: 7, c_swing: 5, c_cmd: 8 };
// 戦ごとの手ほどき（tutStart）の操作を、指の言葉に
const TUT_TOUCH = {
  move: '左の親指でなぞる', run: '棒を外まで押し込む', thrust: '「突く」を押す', combo: '「突く」を素早く3回', charged: '「突く」を長押しして放す',
  guard: '「構え」を押し続ける', sweep: '構えながら「突く」', dodge: '「回避」を押す', parry: '「！」の直前に「構え」',
  cmd_follow: '「号令」から選ぶ', cmd_hold: '「号令」から選ぶ', cmd_retreat: '「号令」から選ぶ', radial: '「号令」を押す',
  cmd_yari: '「号令」から「槍衾」', cmd_fire: null, group: '右下の隊の札を押す',
};


// ---------------- 軍勢の印（隊旗・行き先の小旗・使番） ----------------
// 布の絵は一度描いたら使い回す
const STD_CACHE = new Map();
function stdMat(key, w, h, draw, o = {}) {
  if (STD_CACHE.has(key)) return STD_CACHE.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  // 使い込んだ布：裾の汚れと織り目
  for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.02})`; g.fillRect(0, y, w, 1); }
  const gr = g.createLinearGradient(0, h * 0.55, 0, h);
  gr.addColorStop(0, 'rgba(66,50,32,0)'); gr.addColorStop(1, 'rgba(66,50,32,.32)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.95, alphaTest: o.alpha ? 0.5 : 0, transparent: !!o.transparent });
  STD_CACHE.set(key, m);
  return m;
}
function plainMat(key, color, o = {}) {
  if (STD_CACHE.has(key)) return STD_CACHE.get(key);
  const m = o.basic ? new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: !!o.opacity, opacity: o.opacity ?? 1, depthWrite: !o.opacity })
    : new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, side: THREE.DoubleSide });
  STD_CACHE.set(key, m);
  return m;
}
// 布の板：竿の側（左の縁）を原点に、上の縁から下へ垂れる。竿から離れるほど少し波打つ
function clothGeo(w, h, bend = 0.06) {
  const k = `cloth${w}|${h}|${bend}`;
  if (STD_CACHE.has(k)) return STD_CACHE.get(k);
  const geo = new THREE.PlaneGeometry(w, h, 6, 2);
  geo.translate(w / 2, -h / 2, 0);
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i); pa.setZ(i, Math.sin(x / w * Math.PI * 1.5) * bend * (x / w)); }
  geo.computeVertexNormals();
  STD_CACHE.set(k, geo);
  return geo;
}
function poleGeo(h, r = 0.028) {
  const k = `pole${h}|${r}`;
  if (STD_CACHE.has(k)) return STD_CACHE.get(k);
  const geo = new THREE.CylinderGeometry(r * 0.8, r, h, 5);
  geo.translate(0, h / 2, 0);
  STD_CACHE.set(k, geo);
  return geo;
}
// 家紋の幟（縦長。上の三分の一に紋）
function noboriMat(mon) { return stdMat('nobori|' + mon, 96, 288, (g, w, h) => drawMon(g, mon, w, h)); }
// 鉄砲の小旗：墨の地に白い帯と白抜きの丸に紋（遠目に黒い四角）
function gunFlagMat(mon) {
  return stdMat('gunflag|' + mon, 128, 112, (g, w, h) => {
    g.fillStyle = '#1b1915'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e6dfcf'; g.fillRect(0, h * 0.08, w, h * 0.1);
    g.save(); g.beginPath(); g.arc(w / 2, h * 0.58, h * 0.3, 0, 7); g.clip();
    // 紋（96×288 の幟の上の方に描かれる）を丸の中へ縮めて写す
    const sc = h * 0.3 * 0.9 / (96 * 0.34);
    g.translate(w / 2 - 48 * sc, h * 0.58 - 288 * 0.32 * sc);
    g.scale(sc, sc);
    drawMon(g, mon, 96, 288);
    g.restore();
  });
}
// 騎馬の吹流し：縦の縞（家の色）
function streamerMat(fac) {
  const cols = { takeda: ['#a8261a', '#e6dfcf', '#1b1915'], akazonae: ['#a8261a', '#1b1915', '#a8261a'], tokugawa: ['#e6dfcf', '#1b1915', '#e6dfcf'], oda: ['#c9a24a', '#1b1915', '#e6dfcf'], imagawa: ['#e6dfcf', '#6b2a1c', '#e6dfcf'] }[fac] || ['#e6dfcf', '#1b1915', '#a8261a'];
  return stdMat('streamer|' + fac, 128, 64, (g, w, h) => { cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * w / 3, 0, w / 3 + 1, h); }); });
}
// 行き先の小旗：白地に墨の縁（戦術マップの旗と同じ見た目）
function destFlagMat(op = 1) {
  const m = stdMat('destflag', 64, 48, (g, w, h) => { g.fillStyle = '#f1e9d6'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1a1510'; g.lineWidth = 6; g.strokeRect(0, 0, w, h); });
  if (op >= 1) return m;
  const k = 'destflag' + op;
  if (!STD_CACHE.has(k)) { const c = m.clone(); c.transparent = true; c.opacity = op; c.depthWrite = false; STD_CACHE.set(k, c); }
  return STD_CACHE.get(k);
}

// 隊旗を作る。kind：spear・bow（幟）、gun（小旗）、cavalry（吹流し）、honjin（大旗）
// 自分の組の隊旗には、旗の下に数の札（白・黄・朱）と、号令先に選んだ時の金の印をつける
function buildStandard(kind, mon, fac, own) {
  const root = new THREE.Group();
  const H = { spear: 5.4, bow: 4.6, gun: 3.7, cavalry: 5.4, honjin: 7.0 }[kind] || 5;
  const wood = plainMat('pole', 0x2a1d12);
  root.add(new THREE.Mesh(poleGeo(H, kind === 'honjin' ? 0.04 : 0.028), wood));
  let cloth, clothTop = H - 0.08, clothH = 0;
  if (kind === 'gun') {
    clothH = 0.72;
    cloth = new THREE.Mesh(clothGeo(0.84, clothH, 0.05), gunFlagMat(mon));
  } else if (kind === 'cavalry') {
    // 吹流し：竿の先の輪から風下へ流れる筒
    const geo = STD_CACHE.get('streamerGeo') || (() => { const g0 = new THREE.CylinderGeometry(0.22, 0.05, 2.4, 10, 1, true); g0.rotateZ(Math.PI / 2); g0.translate(1.2, 0, 0); STD_CACHE.set('streamerGeo', g0); return g0; })();
    cloth = new THREE.Mesh(geo, streamerMat(fac));
    clothH = 0.5;
  } else {
    const w = kind === 'honjin' ? 1.05 : 0.6, h = kind === 'honjin' ? 2.9 : kind === 'bow' ? 1.5 : 1.9;
    clothH = h;
    cloth = new THREE.Mesh(clothGeo(w, h, kind === 'honjin' ? 0.1 : 0.06), noboriMat(mon));
    // 横手（布の上の縁を張る横木）
    const bar = new THREE.Mesh(STD_CACHE.get('barGeo' + w) || (() => { const g0 = new THREE.CylinderGeometry(0.014, 0.014, w + 0.06, 4); g0.rotateZ(Math.PI / 2); g0.translate(w / 2, 0, 0); STD_CACHE.set('barGeo' + w, g0); return g0; })(), wood);
    bar.position.y = clothTop;
    root.add(bar);
  }
  cloth.position.set(0.03, clothTop, 0);
  cloth.castShadow = true;
  root.add(cloth);
  const ud = { cloth, H, kind, lean: 0, dipT: 0, low: 0 };
  if (own) {
    // 数の札：旗の下、竿に結んだ小さな板
    const tag = new THREE.Mesh(STD_CACHE.get('tagGeo') || (() => { const g0 = new THREE.PlaneGeometry(0.34, 0.24); g0.translate(0.2, 0, 0); STD_CACHE.set('tagGeo', g0); return g0; })(), plainMat('tag_ok', TAG_COL.ok, { basic: true }));
    tag.position.y = clothTop - clothH - 0.34;
    root.add(tag);
    ud.tag = tag;
    // 号令先の印：竿の先の金の宝珠と、短い金の房
    const sel = new THREE.Group();
    const gold = plainMat('gold', 0xc9a24a, { metal: 0.6, rough: 0.35 });
    const ball = new THREE.Mesh(STD_CACHE.get('ballGeo') || (() => { const g0 = new THREE.SphereGeometry(0.09, 10, 8); STD_CACHE.set('ballGeo', g0); return g0; })(), gold);
    ball.position.y = H + 0.08;
    const tassel = new THREE.Mesh(clothGeo(0.07, 0.7, 0), plainMat('goldcloth', 0xd8b04a, { basic: true }));
    tassel.position.set(-0.06, H, 0);
    tassel.rotation.y = Math.PI;
    sel.add(ball, tassel);
    sel.visible = false;
    root.add(sel);
    ud.sel = sel;
  }
  root.userData.std = ud;
  return root;
}

// 号令の中身（使番が届けるまで、前の号令のままにしておくため）

// ---- 戦の声の束：場面ごとの言葉。同じ言葉が続かないよう、近くに使った物は避けて選ぶ ----
// 家ごとの口ぐせ（敵の声に混ぜる）。鍵は戦の定義の sides.b.mon
const FOE_TONGUE = {
  takeda: { waver: ['甲斐の者が退くか！', 'お屋形様の御前ぞ、踏みとどまれ！'], push: ['風林火山の旗を見よ！', '甲斐の武者に続け！'] },
  imagawa: { waver: ['駿河の衆、崩れるな！', 'ここは御本陣の前ぞ！'], push: ['駿河勢の数を見よ！', '尾張の小勢、踏み潰せ！'] },
  saito: { waver: ['美濃の者が逃げるか！', '城へ戻れ、城へ！', '稲葉山まで退け！'], push: ['美濃の地ぞ、追い返せ！', '尾張のうつけの兵ぞ、恐れるな！', '美濃の衆、押し出せ！'] },
  azai: { waver: ['近江の者、退くな！', '小谷の殿に顔向けできぬ！', '姉川を渡って退け！'], push: ['浅井の意地を見せよ！', '裏切り者の織田を討て！', '近江の衆、押し込め！'] },
  asakura: { waver: ['越前へ戻るぞ！', '一乗谷まで持たぬ……！', '国へ帰らせてくれ……！'], push: ['越前の衆、かかれ！', '朝倉の名にかけて！', '三つ盛木瓜の旗に続け！'] },
  namu: { waver: ['南無阿弥陀仏……！', '退けば地獄ぞ、退くな！'], push: ['進めば極楽、退けば地獄！', '南無阿弥陀仏！'] },
  mori: { waver: ['安芸の者、崩れるな！', '船へ戻れ、船へ！'], push: ['毛利の旗の下に集え！', '三本の矢の結束を見よ！'] },
  uesugi: { waver: ['毘の旗を守れ！', '越後へ引け！'], push: ['毘沙門天の加護ぞ！', '越後の衆、かかれ！', '懸かり乱れ龍の旗ぞ！'] },
  miyoshi: { waver: ['阿波へ戻れ！', '畿内を捨てるか……！'], push: ['三好の衆、押し返せ！', '都は渡さぬ！'] },
  akechi: { waver: ['惟任の衆、退くな！', '坂本へ引け！'], push: ['敵は本能寺にあり！', '桔梗の旗に続け！', '天下はもう我らの物ぞ！'] },
};
const VOICE = {
  waverA: ['持たぬ……！', '押されておるぞ！', '下がれ、下がれ！', '足が止まらぬ……！', 'だめじゃ、押し返せぬ！', '列が崩れる！'],
  waverB: ['崩れるぞ！', 'だめじゃ、逃げろ！', '持ちこたえられぬ！', '退け、退けい！', '命あっての物種じゃ！', '槍を捨てて逃げろ！'],
  allyFall: ['皆やられる……！', '横の者がばたばた倒れていく！', 'だめじゃ、押し潰される……！', '誰か、誰か来てくれ！', 'ここはもう持たぬぞ！'],
  fear: ['も、もう持ちませぬ……', '数が違いすぎる……', 'このままでは皆、討たれまする……', '嫌じゃ、死にとうない……', '国の母に、なんと言えば……', '手が震えて槍が持てぬ……'],
  fearMore: ['ま、また一人……', '{boss}、我らだけでは……', 'ひっ……次は、わしか……', '数が減っていく……'],
  subDie: ['ぐあっ…！', '{boss}、お先に…', 'やられた…！', 'む、無念…', '母上……'],
  shaky: ['お、おう……', '……は、はい', 'う、承知……', 'は、ははっ……'],
  rout: ['敵が崩れて逃げていく！', '敵が背を見せた！　追え！', '敵が崩れた！　今ぞ、押せ！', '敵が槍を捨てて逃げていく！'],
  regroup: ['敵が下がって立て直そうとしている。今が押し時！', '敵が退いて列を組み直す。休ませるな！', '敵が息を継いでおる。今のうちに寄せよ！', '敵の列が乱れておる。組み直す前に突け！'],
  gunLine: ['鉄砲衆が並んで構えた！　物陰へ、味方の陰へ！', '鉄砲の列が火蓋を切るぞ！　身を低く！', '筒先が揃うた！　撃たれる前に伏せよ！', '火縄の煙が上がる……一斉に来るぞ！'],
  gunOne: ['敵の鉄砲が構えた！　伏せよ！', '火縄の匂いじゃ……撃って来るぞ！', '鉄砲が狙っておる！　伏せよ！'],
  gunAtMe: ['鉄砲だ！　狙われているぞ', '鉄砲がこちらを狙っておる！', '筒先がこっちを向いた！', '狙い撃ちじゃ、足を止めるな！'],
  reload: ['今じゃ！　弾を込めている間に詰めよ！', '玉込めの隙じゃ！　一気に寄せよ！', '次の玉まで間がある、走れ！', '撃ち終えたぞ！　今のうちに寄せよ！'],
  encircle2: ['囲まれた！　退き口が塞がる、一点を破って抜けよ！', '四方から敵じゃ！　一所を破って抜けよ！', '後ろにも敵じゃ！　固まって一方を破れ！', '取り籠められた！　薄い所を突き抜けよ！'],
  encircle1: ['敵が左右から回り込んで来る……囲まれつつあるぞ！', '横へ回られるぞ！　囲まれる前に動け！', '敵の翼が伸びて来る。退き口を見ておけ！', '脇へ回る敵がおる！　背を取られるな！'],
  arrow: ['矢が来る！', '矢じゃ、顔を上げるな！', '矢の雨じゃ！', '笠を傾けよ、矢じゃ！'],
  cavStop: ['騎馬を槍衾で止めたぞ！', '馬が止まった！　槍で突き落とせ！', '馬が棹立ちじゃ！　引きずり下ろせ！', '槍の穂先に馬がひるんだ！'],
  cavStopFence: ['騎馬が柵に当たって止まった！　今じゃ、突け！', '馬が柵で足を止めた！　突き伏せよ！', '柵の前で馬が詰まった！　隙間から突け！'],
  cavCome: ['騎馬が来るぞ！', '騎馬じゃ！　槍を揃えよ！', '馬蹄の音じゃ……騎馬が来る！'],
  leader: ['組頭を討ち取った！　敵が乱れているぞ', '敵の頭を討った！　敵が浮き足立つ！', '頭を失うて、敵がうろたえておる！', '敵の組頭が倒れた！　押し込め！'],
  focusDone: ['討ち取りました！', '首尾よく仕留めましたぞ！', 'あやつを討ち取った！'],
  praise: ['ようやった！', '見事じゃ、その調子で押せ', 'よし、よう働いた！', 'やるではないか', 'その槍、見事なり！', 'それでこそ男じゃ！'],
  praiseLord: ['お見事にござる！', '殿、さすがの御働き！', '殿に続け！　押せ押せ！', '敵が崩れまするぞ！', '天晴れ、殿！'],
  retreatMe: ['下がれ！　死ぬぞ！', '一人で出るな、下がれ！', '死に急ぐな、下がれ！', '深入りじゃ、戻れ！'],
  flag: ['旗を守れ！　旗を立てよ！', '旗を倒すな！　立てい！', '旗が傾いた！　誰ぞ支えよ！', '旗を拾え！　皆の目印ぞ！'],
  // 開戦（はじめて槍を合わせた時）。低い身分は組頭が、高い身分は組の者が言う
  openLow: ['槍を揃えよ！　かかれ！', '腰を落とせ、ひるむな！', '突け、突け！　一人で出るな！', '肩を並べよ、ここが死に場所ぞ！'],
  openHigh: ['{boss}に続け！', '{boss}の御前ぞ、遅れるな！', 'かかれ、かかれい！', '一番槍は我らの組ぞ！'],
  openLord: ['殿の御前ぞ、かかれ！', '織田の旗を前へ！', '者ども、殿に遅れるな！', '木瓜の旗に続け！'],
  // 押す（敵がひるんだ時）
  push: ['押せ、押せ！', '敵は崩れかけておる！', 'もう一押しじゃ！', '今ぞ、槍を入れよ！', '足を止めるな、押し込め！'],
  // 武将を討った時（味方の喜び）
  bushoKilled: ['敵の大将が倒れたぞ！', '名のある武者を討ったり！', '旗が倒れた！　敵が崩れる！', '大将首じゃ！　皆に知らせよ！'],
  // 味方の武将が倒れた時
  allyBushoFall: ['味方の侍大将が討たれた……！', 'お味方の旗が倒れたぞ！', '大将が……持ちこたえよ！', '馬印が倒れた！　踏みとどまれ！'],
  // 勝ち（主の任務が済み戦が終わる時）
  winLow: ['生きておるか。勝ち戦ぞ！', 'ようやった。皆、よう生き残った', '勝った……勝ったぞ！', '槍を立てよ。勝鬨じゃ！'],
  winHigh: ['{boss}、勝ち戦にござる！', '勝ちましたぞ、{boss}！', 'ご無事で何より。勝ち戦じゃ！', '{boss}の采配のおかげにござる！'],
  // 退く（味方の隊が崩れた時・負け戦）
  withdraw: ['退き口を守れ、背を見せるな！', '固まって退け！　散れば討たれる！', '殿を残して下がれ！', '無駄死にするな、引け！', '負傷の者を担げ、置いて行くな！'],
};
// 近くに使った言葉を避けて一つ選ぶ（鍵ごとに、束の半分まで覚える）。{boss} は呼び名に替える
function voice(rt, key, extra = null, boss = '') {
  const base = VOICE[key] || [];
  const L = extra && extra.length ? base.concat(extra) : base;
  if (!L.length) return '';
  const R = rt.voiceRecent || (rt.voiceRecent = {});
  const used = R[key] || (R[key] = []);
  const free = L.filter((x) => !used.includes(x));
  const w = (free.length ? free : L)[Math.floor(Math.random() * (free.length || L.length))];
  used.push(w); while (used.length > Math.max(1, Math.floor(L.length / 2))) used.shift();
  return w.replace('{boss}', boss);
}
// 敵の家の口ぐせ（場面 k：'waver'・'push'）
function foeTongue(rt, k) { const m = rt.def && rt.def.sides && rt.def.sides.b && rt.def.sides.b.mon; return (FOE_TONGUE[m] && FOE_TONGUE[m][k]) || null; }
const ORDER_KEYS = ['order', 'facing', 'formation', 'focus', 'seekRange', 'aggro', 'speed', 'onArrive'];
function snapOf(g) {
  const s = {};
  for (const k of ORDER_KEYS) s[k] = g[k];
  s.anchor = { x: g.anchor.x, z: g.anchor.z };
  s.dest = g.dest ? { x: g.dest.x, z: g.dest.z } : null;
  return s;
}
function applySnap(g, s) {
  for (const k of ORDER_KEYS) g[k] = s[k];
  g.anchor = { x: s.anchor.x, z: s.anchor.z };
  g.dest = s.dest ? { x: s.dest.x, z: s.dest.z } : null;
}
const RELAYED = new Set(['follow', 'hold', 'attack', 'retreat', 'focus', 'move', 'yari', 'face', 'gather']);

// 線分 (a→b) と柵の線分 seg が交わるか（湧く所をずらす時、柵や塀の向こうへ出さない）
function segX(ax, az, bx, bz, [cx, cz, dx, dz]) {
  const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
export class Battle {
  constructor(game, index, def) {
    this.game = game;
    this.G = game.G;
    this.index = index;
    this.def = def;
    this.hud = game.hud;
    this.camera = game.camera;
    this.scene = new THREE.Scene();
    const Q = QUALITY[S.quality] || QUALITY.high;
    const wdef = { ...def.world, trees: Math.round((def.world.trees ?? 520) * Q.trees), tufts: Math.round((def.world.tufts ?? 5000) * Q.tufts) };
    this.world = new World(this.scene, wdef);
    this.buildCouriers(wdef);
    this.world.onWet = (w) => { UNIT_WET.value = w; };
    UNIT_WET.value = 0;
    this.applyQuality();
    this.stats = { kills: 0, taken: 0, blocks: 0, parries: 0, thirds: 0, dist: 0, guarded: 0 };
    this.D = DIFFICULTY[this.G.difficulty] || DIFFICULTY.normal;
    this.titlesAtStart = [...(this.G.titles || [])];
    this.frustum = new THREE.Frustum();
    this.projView = new THREE.Matrix4();
    this.army = new Army(this.scene, this.world, {
      onKill: (v, k) => this.onKill(v, k),
      onFlank: (g, src) => this.onFlank(g, src),
      onFlankHit: (g) => this.onFlankHit(g),
      onRout: (g) => this.onRout(g),
      onFlee: (u) => this.onFlee(u),
      onPlayerLanded: () => { this.hud.hitMarker(); this.game.hitstop = 0.045; },
      onWaver: (g) => {
        const extraB = g.team === 0 ? null : (foeTongue(this, 'waver') || []).concat([pickLine(this, 'breaking', 'enemy', monOf(this))].filter(Boolean));
        const line = g.team === 0 ? voice(this, 'waverA') : voice(this, 'waverB', extraB);
        this.bark(`${g.team === 0 ? '味方' : '敵'}の足軽「${line}」`, g.team === 0);
        if (g.team !== 0 && (this.pushSayT ?? -99) + 20 < this.t && this.distTo(g.center()) < 50) { this.pushSayT = this.t; this.after(1.8, () => { if (!this.over) this.bark(`味方「${voice(this, 'push')}」`); }); }
        const u = g.units.find((x) => x.alive);
        if (u) this.army.play('cry', u.pos, 0.9);
      },
      playerDamage: (a, s) => { const d = this.player.takeDamage(a, s); this.stats.taken += d; return d; },
      volumeAt: (p) => this.volumeAt(p),
      panAt: (p) => this.panAt(p),
      onBlocked: () => { this.stats.guarded++; this.hud.flash('防がれた', 'dim'); this.hint('blocked'); },
      onLeaderKilled: (g, k) => { if (g.team !== 0 && k && (k.isPlayer || k.isSub)) { this.bark(voice(this, 'leader')); } },
      // 矢の知らせは初めの三度は4秒おき、あとは15秒おき（同じ声が続きすぎないように）
      onArrowAtPlayer: () => { const n = this.arrowWarnN || 0; if ((this.arrowWarnT || -99) + (n < 3 ? 4 : 15) < this.t) { this.arrowWarnT = this.t; this.arrowWarnN = n + 1; this.bark(voice(this, 'arrow'), true); } },
      // 名のある部下が深手を負うと、隣の者が名を呼ぶ（乱戦の中で誰が危ないか、声で分かる）
      onSubWounded: (u) => { if ((this.subWoundT ?? -99) + 10 < this.t || u.name) { this.subWoundT = this.t; this.bark(`${u.name || '部下'}が深手を負った`, true); } if (u.name && (this.woundCallT ?? -99) + 12 < this.t) { this.woundCallT = this.t; this.say('足軽', `${u.name}！　傷は浅いぞ、気を確かに！`, 1.6); } },
      onSquadFlanked: () => { if ((this.flankWarnT || -99) + 8 < this.t) { this.flankWarnT = this.t; this.bark('組が横から突かれている！　向きを変えよ', true); } },
      onRegroup: (g) => { if (this.distTo(g.center()) < 60) this.bark(voice(this, 'regroup')); },
      // 騎馬が止まった知らせは、一度言ったら 25 秒は黙る（寄せが続くと同じ声が並ぶので）
      onCavalryStopped: (u, by) => { this.stats.cavStops = (this.stats.cavStops || 0) + 1; if ((this.cavStopT ?? -99) + 25 > this.t) return; this.cavStopT = this.t; this.bark(voice(this, by && by.isStruct ? 'cavStopFence' : 'cavStop')); },
      onGunAtPlayer: () => { if ((this.gunWarnT || -99) + 10 < this.t) { this.gunWarnT = this.t; this.bark(voice(this, 'gunAtMe'), true); this.hint('gun'); } },
      // 敵の鉄砲組が「構え」た：火蓋を切る音が列に揃い、射線にいれば縁が赤く。撃ち終わりの弾込めの間は詰める好機
      onFoeVolleyCall: (g, L, wait) => {
        const u = this.player.u;
        if (!u.alive || this.over) return;
        const fx = Math.sin(L.heading), fz = Math.cos(L.heading), dx = u.pos.x - L.pos.x, dz = u.pos.z - L.pos.z, d = Math.hypot(dx, dz) || 1;
        const inLine = (dx * fx + dz * fz) / d > 0.55;
        const gun = g.units.filter((x) => x.alive && x.type === 'gun');
        for (let i = 0; i < Math.min(5, gun.length); i++) { const o = gun[Math.floor(Math.random() * gun.length)]; this.after(0.15 + i * 0.12 + Math.random() * 0.1, () => this.army.play('hizara', o.pos, 0.9)); }
        if (!inLine) return;
        this.aimedT = Math.max(this.aimedT || 0, wait + 0.3);
        // 放つ前の張り詰めた間：曲が引き、火蓋を切る音だけが揃う
        if (d < 70) hush(wait + 0.6);
        if ((this.volleyWarnT ?? -99) + 14 < this.t) { this.volleyWarnT = this.t; this.bark(voice(this, gun.length >= 12 ? 'gunLine' : 'gunOne'), true); }
        if (d < 50 && (this.reloadCallT ?? -99) + 25 < this.t) {
          this.reloadCallT = this.t;
          this.after(wait + 1.6, () => { if (g.count > 2 && this.player.u.alive && !this.over && this.distTo(g.center()) < 55) this.bark(voice(this, 'reload')); });
        }
      },
      onGunMisfire: () => { if (!this.misfireNoted) { this.misfireNoted = true; this.bark('敵の鉄砲、火縄が湿って撃てぬらしい'); } },
      // 敵の鉄砲組が一斉に放った後の、弾込めの間（近い時だけ。詰めて槍を入れる好機）
      onFoeReload: (g) => { const c = g.center(), P = this.player.u; if (P.alive && Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 70) this.after(1.2, () => this.bark('敵の鉄砲は弾込めの間じゃ！　今のうちに詰めよ！')); },
      // 味方の武将が危なくなって隊の後ろへ下がる時の一声（同じ武将は 20 秒に一度）
      onGeneralBack: (u) => { if (Math.hypot(u.pos.x - this.player.u.pos.x, u.pos.z - this.player.u.pos.z) < 40) this.say(u.name.replace(/^.* /, ''), 'ちと下がる。ここは任せたぞ！', 2.5); },
      onFocusDone: (g) => { this.unmark('focus'); this.bark(`足軽たち「${voice(this, 'focusDone')}」`); g.order = 'follow'; },
      onStructHit: (s) => this.def.onStructHit && this.def.onStructHit(this, s),
      onStructDestroyed: (s) => this.def.onStructDestroyed && this.def.onStructDestroyed(this, s),
    });
    // 戦の側の音：どの音かを覚えてから鳴らす（遠くまで届く音の大きさと、届くまでの遅れを決めるため）
    // 近くの一斉射撃・騎馬の駆け抜けは、足もとが震えるように画面も小さく揺れる
    const play0 = this.army.play.bind(this.army);
    this.army.play = (name, pos, vol = 1) => {
      if (!pos) return play0(name, pos, vol);
      this.sndName = name;
      try { play0(name, pos, vol); } finally { this.sndName = null; }
      const q = SHAKE_SOUND[name];
      if (q && this.player && this.camera) {
        const c = this.camera.position, d = Math.hypot(pos.x - c.x, pos.z - c.z);
        if (d < q[1]) this.player.addShake(q[0] * (1 - d / q[1]) * Math.min(1.5, vol));
        // すぐそばの鉄砲は耳が遠くなる
        const dz = DEAF_SOUND[name];
        if (dz && d < dz) deafen((1 - d / dz) * 0.8);
      }
    };
    this.army.shadows = Q.shadows;
    this.army.shadowDist = Q.shadowDist;
    this.army.blobShadows = !Q.shadows;
    this.army.maxAttackers = this.D.attackers;
    // 足軽の最初の二戦（普通）は、本人へ同時に打ちかかる敵を二人までに（受ける傷の 0.6 倍は player.js）
    this.firstFights = this.D === DIFFICULTY.normal && index <= 1 && !this.G.lord && !def.dojo && !def.mapCastle && (this.G.rank || 0) === 0;
    if (this.firstFights) { this.army.maxAttackers = Math.min(this.army.maxAttackers, 2); this.army.mobCapMax = index === 0 ? 3 : 4; }   // 初めの戦は、囲まれても同時に打つのは四人まで
    this.tracker = new MeritTracker(def.trackerIndex ?? index);
    this.objectives = [];
    this.markers = [];
    this.interacts = [];
    this.timers = [];
    this.squad = [];
    this.squadGroups = [];
    this.rings = [];
    this.hostGroup = null;
    this.t = 0;
    this.phase = '';
    this.pt = 0;
    this.over = false;
    this.flags = {};
    this.warnT = {};
    this.hintQ = [];      // 後に回したヒント
    this.holdLeft = 0;    // 手ほどきの間に、敵の寄せを遅らせてよい残りの秒
    this.player = new Player(this, def.spawn);
    // 描く直前（行列を新しくした後）に、遠い軽い兵の部品をまとめる（Army.batchDraw）
    { const ob = this.scene.onBeforeRender; this.scene.onBeforeRender = (r, sc, cam, rt) => { ob.call(sc, r, sc, cam, rt); if (this.army) this.army.batchDraw(cam); }; }
    // 馬上で始まるときは、乗り方を一度だけ教える
    if (this.player.mounted) this.after(4, () => this.hint('ride'));
    this.army.playerUnit = this.player.u;
    this.hud.reset();
    this.ready = false;
    // 戦ごとの環境音：川のある戦・夕暮れや夜・嵐
    silence();
    setScene({ river: (def.world && (def.world.water || (def.world.streams && def.world.streams.length))) ? 0.5 : 0, night: def.world && def.world.time === 'dusk', wind: def.world && def.world.time === 'storm' ? 1 : 0.3 });
    // 建物・陣幕・置き物の当たり：この戦で置く物だけにして、人と馬を押し戻す（units.js collide）
    SOLIDS.length = 0;
    this.army.solids = SOLIDS;
    flReset();   // 床の層（floors.js）：この戦で城の部品が置いた分だけ使う。置かなければ decks は空のまま＝今までと同じ速さ
    resetLadders();
    def.setup(this);
    this.taisho = taishoInit(this);   // 両軍の総大将（taisho.js）
    // 戦が始まった後に出る敵は、見える所（カメラから 60m 内で画面の中）に湧かせない（guardSpawn）
    this.army.spawnGuard = (g, list) => this.guardSpawn(g, list);
    // 隊を動かす大将の頭（ai.js）。戦の定義の下知の中で、寄せ・回り込み・入れ替わりを決める
    this.ai = new Commander(this);
    // 侍大将（出世の道の四段目）で出たときは、鉄砲隊と騎馬隊も率いる。組の無い戦でも槍・弓の組をつける
    // 信長で遊ぶ戦が供の数を決めている時（def.lordHata：本能寺のわずかな供など）は足さない
    if (this.G.trialStep >= 3 && !def.dojo && !(this.G.lord && def.lordHata)) {
      const p = this.player.u.pos, h = this.player.u.heading || 0;
      const back = { x: p.x - Math.sin(h) * 6, z: p.z - Math.cos(h) * 6 };
      if (!this.squad.length) this.makeSquad(back, h, [{ kind: 'spear', n: 20 }, { kind: 'bow', n: 10 }]);
      this.makeSquad(back, h, [{ kind: 'gun', n: 20, ranks: 2 }, { kind: 'cavalry', n: 10 }]);
    }
    // 供（ともの者）：問屋で雇った家来が、自分のすぐ後ろについて戦う（組とは別。稽古場・信長・地図の城攻めでは出さない）
    this.tomoUnits = [];
    if (!def.dojo && !def.mapCastle && !this.G.lord) this.makeTomo();
    realmBattle(this);
    this.ready = true;
    this.tracker.subsInit = this.squad.length;
    // 幟をはためかせる
    this.noboriFlags = [];
    this.scene.traverse((o) => { if (o.userData && o.userData.flag) this.noboriFlags.push(o.userData.flag); });
    // 初めての戦なら、手ほどきを一つずつ出す（済んでいれば、歩き方のヒントだけ）
    if (!this.coachStart()) this.hint('move');
    // 開戦の瞬間：題の札が出ている間、斜め横の少し離れた所から、ゆっくり自分の背へ寄る（映画の頭の一場面）
    this.player.introT = 4.2;
    if (!TOFF) this.despairShot();
    // 雷鳴：落ちた遠さの分だけ遅れ、近い雷は裂ける音、遠い雷は低い唸りだけ
    this.world.onBolt = (d = 900) => { this.after(Math.min(8, d / 343), () => { if (d < 900) sfx('crack', 1.2 - d / 900); sfx('thunder', Math.min(1, 0.35 + 350 / d)); }); };
    if (this.squad.length) this.after(12, () => this.hint('squad'));
    // この身分で新しく使えるようになった号令を、戦の始めに一度だけ知らせる（号令の輪にも「新」）
    if (this.squad.length) {
      const nw = RADIAL.filter((it) => it.min && it.min === this.G.rank).map((it) => it.label);
      if (nw.length) this.after(9, () => this.hud.toast(0, `新しく使える号令：${nw.join('・')}`));
    }
    this.after(40, () => this.hint('map'));
  }

  // 開戦の見せ場：題の札の間に、膝の高さから敵の大軍を望遠で数秒見せる（地平まで埋まる旗と兵が、ゆっくり動く）
  // 敵の一番大きな隊（か大軍どうしの押し合いの敵方）を見る。敵がはっきり多い戦は、組の者が数に息をのむ
  despairShot() {
    const P = this.player, u = P.u, def = this.def;
    // 朝霧の戦（world.mist）は、霧で敵が見えないので撮らない（見えない怖さの方を生かす）
    if (S.reduceMotion || def.dojo || def.noDespair || P.camShot || (this.G.lord && def.lordHata) || (def.world && def.world.mist)) return;
    let best = null, foe = 0, own = 0;
    for (const g of this.army.groups) {
      if (!g.count) continue;
      if (g.team === u.team) { own += g.count; continue; }
      const c = g.center(), d = Math.hypot(c.x - u.pos.x, c.z - u.pos.z);
      if (d > 420) continue;
      foe += g.count;
      if (!best || g.count > best.n) best = { x: c.x, z: c.z, n: g.count, d };
    }
    // 本物の敵がまだ遠い・いない大軍の戦（def.force がある）：向いている先の遠景の大軍を見る
    if ((!best || best.d > 300 || foe < 25 || (this.world.clashes || []).length) && def.force) {
      const h = u.heading || 0;
      best = { x: u.pos.x + Math.sin(h) * 150, z: u.pos.z + Math.cos(h) * 150, n: 200, d: 150 };
    }
    if (!best || best.d < 30 || foe + (best.n >= 200 ? 200 : 0) < 25) return;
    const F = def.force ? def.force(this) : null;
    const many = F ? F.b > F.a * 1.2 : foe > own * 1.3;
    const dx = (best.x - u.pos.x) / best.d, dz = (best.z - u.pos.z) / best.d, sx = dz, sz = -dx;
    // 味方の一番前の列より 6m 前へ出て、敵だけが画面を埋めるように（味方の背で塞がれない）
    let front = 8;
    for (const o of this.army.units) {
      if (!o.alive || o.team !== u.team || o.isStruct) continue;
      const ox = o.pos.x - u.pos.x, oz = o.pos.z - u.pos.z, a = ox * dx + oz * dz;
      if (a > front && a < best.d * 0.6 && Math.abs(ox * dz - oz * dx) < 25) front = a;
    }
    const k = Math.min(best.d * 0.6, front + 6);
    const from = { x: u.pos.x + dx * k + sx * 5, z: u.pos.z + dz * k + sz * 5 };
    const at = { x: best.x, z: best.z };
    if (!P.showShot(from, at, 4.8, { h: 0.75, lookH: 2.4, drift: 0.9, ang: Math.atan2(-sz, -sx), zoom: 32 })) return;
    P.introT = 8.6;   // 見せ場の後、いつもの開戦の引きへつなぐ
    this.hud.shotBars(4.6);   // 見せ場の間は画面の札を消し、上下に黒い帯（映画の一場面）
    this.flags.despair = true;
    this.after(0.4, () => this.army.play('jindaiko', at, 1.3));
    this.after(1.6, () => this.army.play('tramp', at, 1.4));
    this.after(2.6, () => this.army.play('toki', at, 1.3));
    if (many) {
      this.hud.peekArmy(12);
      const n = this.squad.filter((x) => x.alive).length;
      this.after(3.2, () => this.bark(n ? '組の者「……な、なんという数じゃ」' : '味方の足軽「……あれが皆、敵か」', true));
    }
  }

  // 囲み：自分の 45m 内の敵を 16 の向きに分け、敵のいない向きの一番広い開き（退き口）を測る
  // 退き口が 135 度を切れば「囲まれつつある」、70 度を切れば「囲まれた」。画面の縁に敵のいる向きを赤く（hud.js）
  checkEncircle() {
    const u = this.player.u, N = 16, sec = new Array(N).fill(0);
    let n = 0;
    this.army.forNear(u.pos.x, u.pos.z, 45, (o) => {
      if (!o.alive || o.team === u.team || o.isStruct || o.fleeing || o.type === 'dummy' || o.type === 'porter') return;
      const a = Math.atan2(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      sec[Math.min(N - 1, Math.floor((a + Math.PI) / (2 * Math.PI) * N))]++; n++;
    });
    let gap = 0, run = 0;
    const occ = sec.map((c) => c >= 2);
    if (!occ.some(Boolean)) gap = N;
    else for (let i = 0; i < 2 * N; i++) { if (!occ[i % N]) { run++; gap = Math.max(gap, run); } else run = 0; }
    const gapDeg = Math.min(N, gap) * 360 / N;
    const lv = n < 10 ? 0 : gapDeg <= 70 ? 2 : gapDeg <= 135 ? 1 : 0;
    const prev = this.encircle ? this.encircle.lv : 0;
    this.encircle = { sec, lv, n };
    if (lv > prev && (this.encSayT ?? -99) + (lv === 2 ? 12 : 25) < this.t) {
      this.encSayT = this.t;
      this.bark(voice(this, lv === 2 ? 'encircle2' : 'encircle1'), true);
      this.army.play('toki', { x: u.pos.x - Math.sin(this.player.yaw) * 30, z: u.pos.z - Math.cos(this.player.yaw) * 30 }, 1.1);
    }
  }

  // 組の減り方（0＝皆いる、1＝皆討たれた）。半分より減ると声が怯える
  squadFear() {
    const n0 = this.tracker.subsInit || 0;
    if (!n0) return 0;
    return 1 - this.squad.filter((x) => x.alive).length / n0;
  }

  // 倒れる寸前の一撃：時が一瞬止まり、耳が遠のき、闇が画面を覆って引く。鼓動が一つ大きく鳴る
  brink() {
    this.game.hitstop = Math.max(this.game.hitstop || 0, 0.14);
    this.player.addShake(0.3);
    deafen(0.9);
    sfx('heart', 1.4);
    this.hud.brink();
    if ((this.brinkSayT ?? -99) + 25 < this.t) { this.brinkSayT = this.t; this.bark('あと一太刀で倒れる……！', true); }
  }

  applyQuality() {
    const Q = QUALITY[S.quality] || QUALITY.high;
    this.world.sun.castShadow = Q.shadows;
    if (this.world.sun.shadow.mapSize.x !== Q.shadowMap) {
      this.world.sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
      if (this.world.sun.shadow.map) { this.world.sun.shadow.map.dispose(); this.world.sun.shadow.map = null; }
    }
    if (this.army) { this.army.shadows = Q.shadows; this.army.shadowDist = Q.shadowDist; }
  }

  // ---------------- 進行の道具 ----------------
  setPhase(p) {
    // 行軍の始まりは、法螺と陣太鼓で「出陣」を知らせ、周りの味方が一斉に槍を立てて応える
    if (p === 'march' && this.phase !== 'march' && this.ready) {
      sfx('sig_susume', 0.6);
      const P = this.player.u.pos;
      this.army.forNear(P.x, P.z, 25, (o) => { if (o.alive && o.team === 0 && !o.isPlayer) this.after(0.4 + Math.random() * 0.6, () => { if (o.alive && !o.atk) o.cheer = 0.8; }); });
      this.after(0.8, () => sfx('toki', 0.5));
    }
    this.phase = p; this.pt = 0;
  }
  after(sec, fn) { this.timers.push({ t: sec, fn }); }
  // 同じ台詞は8秒に一度まで（同じ名の隊がいくつも崩れた時などに続けて言わない）
  say(sp, text, dur = 4) {
    const m = this._saidAt || (this._saidAt = new Map()), t0 = m.get(text), now = this.t || 0;
    if (t0 != null && now - t0 < 8 && now >= t0) return;
    m.set(text, now);
    this.hud.say(sp, text, dur);
  }
  banner(t, s) { this.hud.banner(t, s); }
  // 束ねて出さない知らせは、HUD に渡す前に止める（同じ知らせを何度も呼ばない）
  bark(text, warn) { if (this.hud.barkOk && !this.hud.barkOk(text, warn)) return; this.hud.bark(text, warn); }
  // 場面の声（開戦・勝ち）：殿なら旗本、組があれば組の者、無ければ組頭が言う。言葉づかいは身分で変える
  cry(k) {
    const lord = !!this.G.lord, sub = this.squad && this.squad.find((x) => x.alive);
    const boss = lord ? '殿' : this.G.rank >= 4 ? '御大将' : this.G.rank >= 3 ? 'お頭' : '組頭';
    const who = lord ? '旗本' : sub ? (sub.name || '組の者') : '組頭';
    const key = k + (lord && k === 'open' ? 'Lord' : lord || sub ? 'High' : 'Low');
    this.say(who, voice(this, key, null, boss), 2);
  }

  hint(id) {
    if (!S.hints || hintSeen(id) || !HINTS[id]) return;
    const h = isTouch && id in HINTS_TOUCH ? HINTS_TOUCH[id] : HINTS[id];
    if (!h) { markHint(id); return; }
    // 札は一度に一つ。手ほどきの間や、別のヒントが出ている間は、急ぎでないものを後に回す
    if (!HINT_NOW.has(id) && (this.tut || this.tutPause || this.hud.hintBusy())) { if (!this.hintQ.some((q) => q.id === id)) this.hintQ.push({ id, t: this.t }); return; }
    markHint(id);
    this.hud.hint(h[0], h[1], /^waza/.test(id) ? 11000 : 0);
  }

  // ---------------- 手ほどき（一つずつ出す札） ----------------
  // items：[id, 文]。文の「（…）」は操作の説明として分けて出す。指の端末では TUT_TOUCH の言葉に
  tutStart(title, items, onDone, o = {}) {
    // 初めて遊ぶ人には、任意の稽古の長い札（九つの段）を出さない。代わりに初めての手ほどき（一つずつ・短く）を出す
    if (!o.auto && /任意/.test(title) && this.firstCoach()) return false;
    const list = [];
    for (const [id, label, pc, touch] of items) {
      const m = label.match(/^(.*?)（(.*)）$/);
      let how = pc !== undefined ? pc : m ? m[2] : '';
      if (isTouch) how = touch !== undefined ? touch : id in TUT_TOUCH ? TUT_TOUCH[id] : how;
      if (how === null) continue;   // 指の端末ではできない事
      list.push({ id, label: m && pc === undefined ? m[1] : label, how, done: false });
    }
    if (!list.length) return false;
    this.tut = { title, items: list, onDone, auto: !!o.auto };
    this.hud.renderTut(this.tut);
    return true;
  }
  tutMark(id) {
    const t = this.tut || (this.tutPause && this.tutPause.t);
    if (!t) return;
    // 号令はどれをしても「号令」の段は済み
    if (t.auto && (/^cmd_/.test(id) || id === 'radial')) id = 'c_cmd';
    const it = t.items.find((x) => x.id === id && !x.done);
    if (!it) return;
    it.done = true;
    if (t.auto) {
      markHint(id);
      // 手ほどきで覚えた事は、同じ中身のヒントを出さない
      for (const h of { c_look: ['move'], c_guard: ['guard'], c_swing: ['practice'], c_cmd: ['squad'] }[id] || []) markHint(h);
    }
    sfx('merit', 0.6);
    // 間を置いている間に先にやった段は、札を出さずに済ませる
    if (!this.tut) {
      if (t.items.every((x) => x.done)) { this.tutPause = null; this.hud.flash('手ほどき　済み', 'gold'); if (t.onDone) t.onDone(); }
      return;
    }
    // いま出している段が済んだら、少しの間「よし」を見せてから次へ
    const cur = t.items.find((x) => !x.done || x === it);
    if (cur === it) { t.ok = it.label; t.okT = t.auto ? 0.8 : 1.1; }
    this.hud.renderTut(t);
    if (t.items.every((x) => x.done)) {
      this.hud.flash(t.auto ? '手ほどき　済み' : '手ほどき　皆伝', 'gold');
      t.okT = Math.max(t.okT || 0, 1.2);
      if (t.onDone) t.onDone();
    }
  }
  // 「よし」を見せる間（after の時計は手ほどきの間ゆっくりなので、ここで数える）
  tutTick(dt) {
    const t = this.tut;
    if (!t || !(t.okT > 0)) return;
    t.okT -= dt;
    if (t.okT > 0) return;
    t.ok = null;
    if (t.items.every((x) => x.done)) this.tut = null;
    else if (t.auto) {
      // 次の札までは何も出さず、行軍を進ませる（札が消えたら、やった事は覚えた）
      const nx = t.items.find((x) => !x.done);
      const gap = COACH_GAP[nx.id] || 0;
      if (gap > 0) { this.tut = null; this.tutPause = { t, left: gap }; }
    }
    this.hud.renderTut(this.tut);
  }
  // 間が明けたら、次の札を出す
  tutPauseTick(dt) {
    const w = this.tutPause;
    if (!w) return;
    if (this.tut || this.choice) return;
    w.left -= dt;
    if (w.left > 0) return;
    this.tutPause = null;
    if (w.t.items.some((x) => !x.done)) { this.tut = w.t; this.hud.renderTut(this.tut); }
  }
  // 戦の定義が終わらせるのは、その戦の手ほどき（稽古）だけ。初めての手ほどきは、行軍の間も続ける
  tutEnd() { if (this.tut && this.tut.auto) return; this.tut = null; this.hud.renderTut(null); }
  // まだ一度も手ほどきを済ませていない人か
  firstCoach() { return !!S.hints && !hintSeen('c_move') && !this.def.dojo && !(this.G && this.G.lord); }

  // 初めての戦の手ほどき（まだ済ませていない段だけ）。始めたら true
  coachStart() {
    if (!S.hints || this.def.dojo || this.player.mounted || this.tut) return false;
    const steps = COACH().filter(([id]) => !hintSeen(id) && (id !== 'c_cmd' || this.squad.length > 0));
    if (!steps.length) return false;
    const ok = this.tutStart('手ほどき', steps, null, { auto: true });
    // 敵の寄せを少し遅らせてよい戦（def.tutorialHold 秒まで）
    if (ok) { this.holdLeft = this.def.tutorialHold || 0; this.coachSwing = this.player.u.swing; this.coachLook = 0; this.coachView = S.view; }
    return ok;
  }
  // 手ほどきの段が済んだかを、プレイヤーの動きから見る
  coachTick(dt, input) {
    const t = this.tut || (this.tutPause && this.tutPause.t);
    if (!t || !t.auto) return;
    const p = this.player;
    if (p.movedAcc > 6) this.tutMark('c_move');
    this.coachLook += Math.abs(input.dx || 0) + Math.abs(input.dy || 0);
    if (this.coachLook > 360) this.tutMark('c_look');
    if (p.u.swing && p.u.swing !== this.coachSwing) this.tutMark('c_swing');
    this.coachSwing = p.u.swing;
    if (p.guard && p.guardT > 0.4) this.tutMark('c_guard');
    if (p.dodgeT > 0.05) this.tutMark('c_dodge');
    if (S.view !== this.coachView) this.tutMark('c_view');
    // 号令は、どの号令でも済み（キーの号令・輪の号令・指の号令のどれでも。自分が出した号令だけを見る）
    const lc = this.player.lastCmd;
    if (lc && lc !== this.coachCmd && this.coachCmd !== undefined) this.tutMark('c_cmd');
    this.coachCmd = lc || null;
  }

  // 戦の中の選択（1・2 のキーで選ぶ。選ばなければ既定の方）
  // 斬り合いの最中（敵が近い・打たれた直後）は判断の札を出さず、落ち着いてから出す（邪魔にならないように）
  choose(title, options, onPick, timeout = 25) {
    if (this.player && this.player.inCombatT > 0) { this.pendingChoice = { title, options, onPick, timeout }; return; }
    this.choice = { title, options, onPick, t: timeout };
    this.hud.renderChoice(this.choice);
    sfx('obj');
  }
  pickChoice(i) {
    const c = this.choice;
    if (!c || !c.options[i]) return;
    this.choice = null;
    this.hud.renderChoice(null);
    sfx('ui');
    c.onPick(i);
  }

  // 号令への返事
  // 遠くの道を行き交う伝令の騎馬（戦には加わらない。戦場が自分の周りだけでないことを見せる）
  buildCouriers(wdef) {
    this.couriers = [];
    const path = (wdef.paths || [])[0];
    if (!path || this.def.dojo) return;
    const side = this.def.sides ? this.def.sides.a.mon : scenario().mon;
    for (let k = 0; k < 2; k++) {
      const u = {};
      const m = buildModel(u, { armor: 0x1d1d1f, lace: 0x3c5a8a, hat: 'kabuto', sode: true, pole: true, flag: side, weapon: 'none', skin: 0xb08a66, horo: k ? 0xb8412c : 0xe6dfcf });
      const h = buildHorse();
      m.add(h);
      for (const part of [u.body, u.hand, u.flag]) if (part) part.position.y += 0.95;
      seatLegs(u);
      u.lookWeapon = 'none'; poseArms(u);
      m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(m);
      this.couriers.push({ m, h, u, path, s: k * 0.5, dir: k ? -1 : 1, speed: 9 + k * 1.5 });
    }
  }

  updateCouriers(dt) {
    const P = this.player.u.pos;
    for (const c of this.couriers) {
      const pts = c.path;
      let total = 0;
      for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      c.s += (c.dir * c.speed * dt) / total;
      if (c.s > 1) { c.s = 1; c.dir = -1; } else if (c.s < 0) { c.s = 0; c.dir = 1; }
      let d = c.s * total, i = 0;
      while (i < pts.length - 2 && d > Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])) { d -= Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); i++; }
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az) || 1, t = Math.min(1, d / L);
      // 道の脇を走る
      const nx = (bz - az) / L * 2.5, nz = -(bx - ax) / L * 2.5;
      const x = ax + (bx - ax) * t + nx * c.dir, z = az + (bz - az) * t + nz * c.dir;
      c.m.position.set(x, this.world.heightAt(x, z), z);
      c.m.rotation.y = Math.atan2((bx - ax) * c.dir, (bz - az) * c.dir);
      // 自分の近くでは邪魔にならないよう消す
      c.m.visible = Math.hypot(x - P.x, z - P.z) > 28;
      if (c.m.visible) { animateHorse(c.h, dt, c.speed); if (Math.random() < dt * 3) this.world.puff(x, z, 2); }
    }
  }

  // 号令への返事：号令ごとに言葉を変え、同じ返事を続けない
  // 遠くの隊へは使番が走る。その時は使番の声がすぐ、隊の返事は届いてから
  ack(id) {
    const alive = this.squad.filter((s) => s.alive);
    if (!alive.length) return;
    const W = {
      attack: ['参る！', '押せ押せっ！', '応っ、かかれ！', 'えいやっ、突っかかれ！', '遅れを取るな！', '一番槍はわしじゃ！', '突っ込めえっ！'], retreat: ['退けっ！', '下がれ、下がれ！', '承知、退きまする！', '背を見せるな、構えて退け！'],
      hold: ['承知！', 'ここで踏みとどまる！', 'はっ！', '一歩も退かぬ！', '心得た！'], follow: ['応！', 'お供いたす！', '続けっ！', '遅れるな！', 'お頭に続け！', '離れるな！'],
      yari: ['槍を揃えよ！', '応っ、槍衾！', '穂先を揃えい！'], focus: ['あやつか、承知！', '狙うぞ！', '首はもろうた！'], move: ['進めっ！', '応！', '足を急げ！'],
      face: ['向き直れっ！', '応、こちらじゃ！', '向きを変えい！'], gather: ['集まれ、集まれ！', 'お頭のもとへ！', '寄れ、寄れい！'],
    }[id] || ['おう！', '承知！', 'はっ！', '応っ！'];
    // 号令の種類を問わない短い返事も混ぜる（同じ返事ばかりにしない）
    W.push(...['おう！', '承知！', '応っ！', 'はっ、ただいま！', 'おおーっ！', '合点じゃ！', '心得た！'].filter((x) => !W.includes(x)).slice(0, 4));
    // 身分の高い主には、返事も改まる
    if (this.G.lord || this.G.rank >= 4) W.push(...({ attack: ['ははっ、参りまする！'], hold: ['御意！'], follow: ['お供仕る！'], retreat: ['承知仕った！'] }[id] || ['御意！']));
    let w = W[Math.floor(Math.random() * W.length)];
    if (w === this.lastAck && W.length > 1) w = W[(W.indexOf(w) + 1) % W.length];
    this.lastAck = w;
    // 返事は号令を受けた組の士気で変わる：意気盛んは力強く、動揺は弱く、崩れかけは返事が無い
    const gs = this.squad.length ? this.player.selectedGroups().filter((g) => g.count > 0) : [];
    const mg = gs.length ? gs : this.squadGroups;
    const mor = mg.length ? mg.reduce((a, g) => a + g.morale, 0) / mg.length : 100;
    if (mor < 35) w = voice(this, 'shaky');
    const dl = RELAYED.has(id) && gs.length ? Math.min(...gs.map((g) => this.orderDelay(g))) : 0;
    if (dl > 0) {
      const who = gs.length === 1 && this.squadGroups.length > 1 ? (GROUP_NAME[gs[0].kind] || '組') : '組';
      if ((this.runnerSayT || -99) + 6 < this.t) { this.runnerSayT = this.t; this.bark(`使番「${who}へ、しかと伝えまする！」`); }
      sfx('ack', 0.35);
    }
    if (mor < 18) { this.after(dl + 0.8, () => this.bark(`……組から返事が無い（兵が怯えている。${isTouch ? '「鼓舞」を押す' : K('rally') + ' で鼓舞'}）`, true)); return; }
    // 返事をするのは組頭（名のある者）がいればその者、いなければ足軽たち
    const ld = gs.map((g) => g.leader).find((l) => l && l.alive && l.name && !l.isPlayer);
    const who = ld ? ld.name.replace(/^.* /, '') : '足軽たち';
    this.after(dl + 0.35, () => { this.bark(`${who}「${w}」`); sfx('ack', mor < 35 ? 0.35 : 0.6); sfx('fukusho', (mor < 35 ? 0.35 : mor > 70 ? 0.85 : 0.7) * (dl > 0 ? 0.6 : 1)); });
  }

  obj(id, text, kind = 'main') {
    const o = this.objectives.find((x) => x.id === id);
    if (o) {
      const changed = o.text !== text;
      o.text = text; o.kind = kind; o.state = '';
      if (changed && this.ready && kind !== 'order') this.hud.objNew(text);
      return o;
    }
    const n = { id, text, kind, state: '', progress: '', t: this.t };
    this.objectives.push(n);
    if (this.ready) { this.hud.objNew(text); sfx('obj'); }
    return n;
  }
  objDone(id) { const o = this.objectives.find((x) => x.id === id); if (o && o.state !== 'done') { o.state = 'done'; sfx('obj', 0.8); } }
  objFail(id) { const o = this.objectives.find((x) => x.id === id); if (o && o.state !== 'fail') { o.state = 'fail'; sfx('neg', 0.8); } }
  objRemove(id) { this.objectives = this.objectives.filter((x) => x.id !== id); }
  objProgress(id, s) { const o = this.objectives.find((x) => x.id === id); if (o) o.progress = s; }

  marker(id, pos, label, o = {}) { this.unmark(id); this.markers.push({ id, pos, label, ...o }); }
  unmark(id) { this.markers = this.markers.filter((m) => m.id !== id); }

  // o.prio：近くにほかの物（首など）があっても、この m だけ近いものとして先に選ぶ（筋書きの大事な長押し）
  addInteract(id, pos, label, fn, o = {}) { this.interacts.push({ id, pos, label, fn, r: o.r || 3, ttl: o.ttl ?? Infinity, hold: o.hold || 0, prio: o.prio || 0 }); }
  uninteract(id) { this.interacts = this.interacts.filter((i) => i.id !== id); }

  // 地面に描く輪（指示地点・号令先など）
  ring(x, z, r, color = 0xc2a25a, opacity = 0.55) {
    const geo = new THREE.RingGeometry(r - 0.12, r, 48);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.position.set(x, this.world.heightAt(x, z) + 0.15, z);
    m.renderOrder = 2;
    this.scene.add(m);
    return m;
  }
  // 地面の輪を坂に沿わせる（平らな輪は坂で地面に埋まる）。動いた時だけ頂点の高さを直す
  drapeRing(m, x, z) {
    const y0 = this.world.heightAt(x, z);
    m.position.set(x, y0 + 0.15, z);
    const d = m.userData;
    if (d.dx != null && Math.abs(d.dx - x) < 0.2 && Math.abs(d.dz - z) < 0.2) return;
    d.dx = x; d.dz = z;
    const pos = m.geometry.attributes.position;
    if (!d.base) d.base = Float32Array.from(pos.array);
    for (let i = 0; i < pos.count; i++) {
      const bx = d.base[i * 3], bz = d.base[i * 3 + 2];
      pos.setY(i, this.world.heightAt(x + bx, z + bz) - y0);
    }
    pos.needsUpdate = true;
  }
  zone(id, x, z, r) {
    this.unzone(id);
    const m = this.ring(x, z, r, 0xc2a25a, 0.45);
    m.userData.id = id;
    this.rings.push(m);
  }
  unzone(id) {
    for (const m of this.rings.filter((r) => r.userData.id === id)) this.scene.remove(m);
    this.rings = this.rings.filter((r) => r.userData.id !== id);
  }

  nearestInteract() {
    const p = this.player.u.pos;
    let best = null, bd = Infinity;
    for (const it of this.interacts) {
      const q = typeof it.pos === 'function' ? it.pos() : it.pos;
      if (!q) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < it.r && d - (it.prio || 0) < bd) { bd = d - (it.prio || 0); best = it; }
    }
    return best;
  }

  // 戦功を加算して差分を通知する（逓減・上限を反映した実際の増分を出す）
  award(fn, label, pos) {
    const before = this.tracker.raw();
    fn(this.tracker);
    const diff = this.tracker.raw() - before;
    if (diff !== 0) {
      this.hud.toast(diff, label); sfx(diff > 0 ? 'merit' : 'neg');
      if (pos) this.hud.floatText(pos, `${diff > 0 ? '+' : ''}${diff}`, diff < 0);
      // 大きな働きの直後は、上役がひと言かける（一分に一度まで）
      const bi = BATTLES[this.index], boss = bi && bi.boss;
      // 下知を守り通した褒美には、上役の一言を必ず添える
      // 信長で遊ぶ時は、上役（足軽の時の上役）が主君を褒める形にする
      if (diff > 0 && boss && /下知を守/.test(label || '')) this.after(1.2, () => this.say(this.G.lord ? '近習' : boss.replace(/^.*\s/, ''), this.G.lord ? '殿、お見事な采配にござる' : 'よう下知を守った。それでこそ織田の兵じゃ', 2.5));
      else if (diff >= 15 && boss && !this.over && (this.praiseT ?? -99) + 60 < this.t) {
        this.praiseT = this.t;
        const who = this.G.lord ? '近習' : boss.replace(/^.*\s/, '');
        this.after(1.4, () => { if (!this.over) this.say(who, voice(this, this.G.lord ? 'praiseLord' : 'praise'), 2); });
      }
    }
    // 上限に届いたら一度だけ知らせる
    if (!this.capNoted && this.tracker.raw() >= this.tracker.battle.cap) { this.capNoted = true; this.hud.toast(0, `この戦の戦功は上限（${this.tracker.battle.cap}）に届いた`); }
    return diff;
  }

  violation(reason, scold) {
    this.award((t) => t.violations.push(reason), `命令違反：${reason}`);
    // 叱りの言葉が決まっていなければ、上役がその場で理由を言って叱る（なぜ減ったかがその場で分かる）
    if (!scold) { const bi = BATTLES[this.index]; if (bi && bi.boss && (this.scoldT ?? -99) + 15 < this.t) { this.scoldT = this.t; scold = this.G.lord ? ['近習', `殿、${reason}は、御下知に背きまする`] : [bi.boss.replace(/^.*\s/, ''), `${this.G.name}、勝手をするな！　${reason}は下知に背くぞ`]; } }
    if (scold) {
      this.say(scold[0], scold[1], 3.5);
      // 叱る上役がこちらを見ている事が分かるように：上役がこちらへ向き直り、戦っていなければ目がそちらへ向く
      const P = this.player.u.pos;
      const who = this.army.units.find((u) => u.alive && u.team === 0 && !u.isPlayer && u.name && (u.name === scold[0] || u.name.endsWith(scold[0])));
      if (who && Math.hypot(who.pos.x - P.x, who.pos.z - P.z) < 80) {
        who.heading = Math.atan2(P.x - who.pos.x, P.z - who.pos.z);
        if (!this.player.lock && !(this.player.inCombatT > 0)) this.player.cine = { x: who.pos.x, z: who.pos.z, t: 0.9 };
      }
    }
  }

  groupAlive(g) { return g.count > 0 && !g.routed; }

  distTo(p) { const u = this.player.u.pos; return Math.hypot(p.x - u.x, p.z - u.z); }
  // 敵の新手・待ち伏せが、目の前の何もない所から湧かないように：
  //   出る所がカメラから 60m 内で画面に入る（または 28m 内）なら、見えない所（画面の外か 60m より遠く）まで出る所をずらし、
  //   そこから元の持ち場へ駆けて来させる。ずらす時は、その向きから鬨の声・土煙と「どちらから来る」の知らせで接近を分からせる
  //   軽い兵を本物に替えた隊（wake・合戦の備の兵）は、見えている軽い兵の場所に立つのでずらさない。戦の定義は g.noGuard で外せる
  guardSpawn(g, list) {
    if (this.t < 1 || this.over || g.noGuard || !this.player || g.team === this.player.u.team) return list;
    if (g.name === '備の兵' || g.name === '陣の者' || g.name === '本陣の旗本') return list;
    const cam = this.camera; if (!cam) return list;
    // 出る所の真ん中（持ち場か、置き場を決めた兵の真ん中）と広がり
    let cx = 0, cz = 0, k = 0;
    for (const s of list) if (s.o && s.o.x != null) { cx += s.o.x; cz += s.o.z; k++; }
    if (k) { cx /= k; cz /= k; } else { cx = g.anchor.x; cz = g.anchor.z; }
    const n = list.reduce((a, s) => a + s.n, 0);
    const rad = 3 + Math.min(14, Math.sqrt(n) * 1.3);
    cam.updateMatrixWorld(); this.projView.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.projView);
    const c = cam.position, sph = this._gsS || (this._gsS = new THREE.Sphere());
    const hidden = (x, z) => {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d >= 62 + rad) return true;
      if (d < 28 + rad) return false;
      sph.center.set(x, this.world.heightAt(x, z) + 1, z); sph.radius = rad + 2;
      return !this.frustum.intersectsSphere(sph);
    };
    if (hidden(cx, cz)) return list;
    // 見えない所を探す：元の所から離れる向き（カメラから外へ）を先に、近い所から
    const L = 172, away = Math.atan2(cx - c.x, cz - c.z);
    const cross = (ax, az, bx, bz) => (this.army.structs || []).some((s) => s.alive && s.seg && segX(ax, az, bx, bz, s.seg));
    let best = null;
    for (const r of [20, 30, 42, 56, 72, 90]) {
      for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]) {
        const x = cx + Math.sin(away + da) * r, z = cz + Math.cos(away + da) * r;
        if (Math.abs(x) > L || Math.abs(z) > L || !hidden(x, z) || cross(x, z, cx, cz)) continue;
        best = { x, z }; break;
      }
      if (best) break;
    }
    if (!best) return list;
    const dx = best.x - cx, dz = best.z - cz;
    // 持ち場はそのまま（ずらした所から歩いて来る）。置き場を決めた兵も同じだけずらす
    if (!k) { const a0 = { ...g.anchor }; g.anchor = { x: a0.x + dx, z: a0.z + dz }; this.after(0, () => { if (g.anchor.x === a0.x + dx && g.anchor.z === a0.z + dz) g.anchor = a0; }); }
    const out = list.map((s) => (s.o && s.o.x != null ? { ...s, o: { ...s.o, x: s.o.x + dx, z: s.o.z + dz } } : s));
    // 駆けて来る（着くまで少し速く）
    const sp0 = g.speed; g.speed = Math.max(sp0, 3.3); this.after(Math.hypot(dx, dz) / 3.3 + 2, () => { g.speed = sp0; });
    // 接近の知らせ：その向きから鬨の声と土煙、少し遅れて「どちらから来る」
    this.army.play('toki', best, 1.5);
    if (n >= 8) this.army.play('tramp', best, 1.2);
    if (!(this.world.rainLevel > 0.4)) { this.world.dustCloud(best.x, best.z, n >= 10); this.world.dustCloud(best.x + dz * 0.1, best.z - dx * 0.1, false); }
    if ((this.approachSaid ?? -99) + 8 < this.t) {
      this.approachSaid = this.t;
      const P = this.player.u, a = Math.atan2(best.x - P.pos.x, best.z - P.pos.z) - (P.heading || 0);
      const w = Math.atan2(Math.sin(a), Math.cos(a));
      const dir = Math.abs(w) < 0.6 ? '前' : Math.abs(w) > 2.4 ? '後ろ' : w > 0 ? '左手' : '右手';
      this.after(0.8, () => { if (!this.over) this.bark(`${dir}から敵が来るぞ！`, true); });
    }
    return out;
  }

  // 左右の定位（カメラの右が +1）
  panAt(p) {
    const c = this.camera.position;
    const dx = p.x - c.x, dz = p.z - c.z;
    const d = Math.hypot(dx, dz) || 1;
    // 戦の側の音（army.play）は、遠さの分だけ遅れて、こもって届く（audio.js の withPan が使う）
    if (this.sndName) {
      // カメラの向きと比べて、後ろの音か
      const fx = Math.sin(this.player.yaw), fz = Math.cos(this.player.yaw);
      farNext(d, Math.max(0, -(dx * fx + dz * fz) / d));
    }
    const yaw = this.player.yaw;
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);
    return ((dx * rx + dz * rz) / d) * 0.7;
  }

  // 称号（その場で得られるもの）
  grantTitle(id) {
    const G = this.G;
    if (!TITLES[id] || G.titles.includes(id)) return;
    G.titles.push(id);
    this.hud.toast(0, `称号「${TITLES[id].name}」`);
    sfx('flute', 0.6);
  }

  volumeAt(p) {
    const c = this.camera.position;
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    // 大きな音（鉄砲・法螺・太鼓・鬨の声・騎馬の地鳴り）は遠くまで届く。遠いほどゆるやかに小さく
    const R = FAR_SOUND[this.sndName];
    if (R) return d > R * 9 ? 0 : 1 / (1 + Math.pow(d / R, 1.35));
    return Math.max(0, 1 - d / 55) ** 1.5;
  }

  // 戦術マップで選んだ地点へ組を向かわせる
  commandMoveTo(pt) {
    if (!this.squad.some((s) => s.alive)) return;
    if (this.G.rank < 2) { this.hud.flash('地図での指図は組頭から', 'dim'); return; }
    for (const g of this.player.selectedGroups()) {
      const before = snapOf(g);
      g.focus = null;
      g.order = 'move'; g.dest = { x: pt.x, z: pt.z }; g.speed = 4.0;
      g.facing = Math.atan2(pt.x - g.center().x, pt.z - g.center().z);
      g.onArrive = (gg) => { gg.order = 'hold'; gg.aggro = 7; };
      for (const u of g.units) u.aiT = 0;
      this.relayOrder(g, 'move', before);
    }
    this.say(this.G.name, 'あの地点まで進め！', 2);
    this.ack('move');
    sfx('taiko', 0.35);
  }

  // 自分の組を編成
  makeSquad(center, facing, list) {
    const flag = this.G.aijirushi || 'ichimonji';
    const lead = 1 + 0.08 * (this.G.stats.lead - 1);   // 陣羽織の効き目は、下の組の士気（+5）で出す
    const roster = (this.G.roster || []).filter((r) => r.alive);
    // 城下・出陣の前で決めた組の中身（G.kumi）があれば、戦の定義の決め打ちより優先する（侍大将の試しは除く）
    const km = this.G.trialStep >= 3 ? null : kumiList(this.G, list.reduce((a, s) => a + (s.n || 0), 0));
    if (km) list = km;
    let ri = 0;
    for (const spec of list) {
      if (!spec.n) continue;
      const g = this.army.addGroup({ team: 0, faction: this.G.lordFaction || scenario().faction, order: 'follow', formation: 'line', facing, anchor: { ...center }, isPlayerSquad: true, dmgMult: lead, aggro: 8, spacing: 1.6 });
      g.kind = spec.kind;
      g.fire = true;
      // 上役に尊敬されているほど、自分の組の士気が上がる（人間関係を戦に効かせる。既定の尊敬40を基準に）
      const bi0 = BATTLES[this.index], relR = bi0 && bi0.rel ? relOf(this.G, bi0.rel) : null;
      g.morale = Math.min(100, 90 + (this.G.stats.lead - 1) * 3 + (this.G.equip.coat ? 5 : 0) + (this.G.feast ? 10 : 0) + (relR ? Math.round((relR.respect - 40) * 0.25) : 0));
      // 組の種類：spear（槍）・bow（弓）・gun（鉄砲。二段で入れ替わる）・cavalry（騎馬）
      if (spec.ranks) g.ranks = spec.ranks;
      const type = { bow: 'bow', gun: 'gun', cavalry: 'cavalry' }[spec.kind] || 'ashigaru';
      const units = this.army.spawn(g, [{ type, n: spec.n, o: { flag } }]);
      const mine = km ? roster.slice(ri, ri += spec.n) : roster.filter((r) => r.kind === spec.kind);
      units.forEach((u, i) => {
        u.isSub = true;
        // 名簿の者を割り当てる。古参ほど強い
        const r = mine[i];
        const vet = r ? Math.min(3, r.battles + (r.drill || 0)) : 0;
        // 初めての組（組頭候補）は選りすぐりの兵を預ける。最初の組をすぐ失わないように
        const first = this.G.rank <= 1 ? 1.3 : 1;
        u.hp = u.maxHp = u.maxHp * 1.15 * (1 + 0.08 * vet) * first;
        u.dmg *= 1 + 0.08 * vet;
        u.kills = 0;
        if (r) { u.name = r.name; u.roster = r; }
      });
      // 副頭：組でいちばん古参の者（五人より多い組だけ）。生きていれば、自分が離れても組をまとめる（updateFuku）
      if (units.length >= 5 && !this.squadGroups.some((q) => q.fuku)) {
        const fu = units.reduce((a, u) => ((u.roster ? u.roster.battles || 0 : -1) > (a.roster ? a.roster.battles || 0 : -1) ? u : a), units[0]);
        g.fuku = fu; fu.fuku = true;
        this.after(12, () => { if (fu.alive) this.bark(`副頭の${fu.name || '古参'}が組をまとめる（離れても組が崩れにくい）`); });
      }
      this.squad.push(...units);
      this.squadGroups.push(g);
      // 号令先を示す輪（待て・前進・槍衾・退け のとき）と、選択中の組を示す輪
      g.orderRing = this.ring(0, 0, 2.4, 0xc2a25a, 0.5);
      g.orderRing.visible = false;
      g.selRing = this.ring(0, 0, 3.4, 0xd8b04a, 0.3);
      g.selRing.visible = false;
    }
    if (this.squadGroups.length > 1) this.after(20, () => this.hint('bows'));
    if (this.G.feast) { this.after(3, () => this.bark('振る舞いの酒が効いて、組は意気盛んだ')); this.G.feast = false; }
    this.after(30, () => this.hint('roster'));
    this.after(55, () => this.hint('alt'));
    // 弓の射程と、前進先の予告を示す輪
    this.bowRing = this.ring(0, 0, 34, 0x9ab0c8, 0.3); this.bowRing.visible = false;
    this.moveRing = this.ring(0, 0, 2.4, 0xece4d2, 0.4); this.moveRing.visible = false;
  }

  // 供を出す：一人ずつ名簿（G.tomo）の者。身分で連れて行ける数が決まる。討たれたら戦の後に名簿から外す（main.js）
  makeTomo() {
    const T = tomoAlive(this.G).slice(0, tomoCap(this.G));
    if (!T.length) return;
    const P = this.player.u, h = P.heading || 0;
    const g = this.army.addGroup({ team: 0, faction: this.G.lordFaction || scenario().faction, name: '供', order: 'follow', formation: 'line', facing: h,
      anchor: { x: P.pos.x - Math.sin(h) * 2.4, z: P.pos.z - Math.cos(h) * 2.4 }, noAI: true, noRout: true, aggro: 7, spacing: 1.4, width: 3, morale: 100 });
    g.kind = 'tomo'; g.isTomo = true; g.fire = true;
    for (const t of T) {
      const td = TOMO[t.kind] || TOMO.yarimochi;
      const [u] = this.army.spawn(g, [{ type: td.type, n: 1, o: { flag: null } }]);
      u.tomo = t; u.isTomo = true; u.name = t.name; u.kills = 0;
      // 古参ほど強い（戦歴一つにつき 8%、三つまで）
      const vet = Math.min(3, t.battles || 0);
      u.hp = u.maxHp = u.maxHp * 1.25 * (1 + 0.08 * vet);
      u.dmg *= 1 + 0.08 * vet;
      this.tomoUnits.push(u);
    }
    this.tomoGroup = g;
    this.after(6, () => this.bark(`供の${T.map((t) => t.name).join('・')}が後ろに付き従う`));
  }

  // 稽古相手：ゆっくり打ちかかってくる（受け流しの練習用。傷は浅い）
  sparring(x, z) {
    const g = this.army.addGroup({ team: 1, faction: 'oda', order: 'attack', seekRange: 7, noRout: true, anchor: { x, z }, facing: Math.PI });
    const u = this.army.addUnit(g, { type: 'ashigaru', x, z, flag: null, name: '古参の八助', armor: 0x5a4a38, lace: 0x7a6a44 });
    u.noTarget = true; u.noHead = true;
    u.hp = u.maxHp = 99999; u.dmg = 1.5; u.windup = 0.95; u.cdBase = 2.4;
    g.focus = this.player.u;
    return u;
  }

  // 藁人形（試し突き用）
  dummy(x, z, facing = 0) {
    const g = this.army.addGroup({ team: 1, faction: 'oda', order: 'hold', aggro: 0, noRout: true, anchor: { x, z }, facing });
    const u = this.army.addUnit(g, { type: 'dummy', x, z, heading: facing, flag: null, armor: 0x9c8a5a, lace: 0x7a6a44, hat: 'none', weapon: 'none' });
    u.noTarget = true;
    u.noHead = true;
    return u;
  }

  // ---------------- 各種フック ----------------
  onKill(v, k) {
    if (v.isPlayer) return;
    // 近くの味方が討たれる：断末魔と、少し遅れて体が地に崩れる音。一息に何人も倒れれば、周りが怯える
    // （城下で斬った町の人 v.civ は「味方を失った」とは数えない）
    if (v.team === this.player.u.team && !v.civ && !v.isStruct && this.player.u.alive && this.distTo(v.pos) < 24) {
      if ((this.allyCryT ?? -99) + 0.5 < this.t) { this.allyCryT = this.t; this.army.play('cry', v.pos, 0.8 + Math.random() * 0.3); }
      this.after(0.35 + Math.random() * 0.3, () => this.army.play('thud', v.pos, 0.8));
      const A = this.allyDeaths = (this.allyDeaths || []).filter((t) => this.t - t < 6); A.push(this.t);
      if (A.length >= 4 && (this.allyFallT ?? -99) + 30 < this.t && !this.over) {
        this.allyFallT = this.t;
        this.bark(`味方の足軽「${voice(this, 'allyFall')}」`, true);
      }
    }
    if (k && (k.isSub || k.isTomo)) k.kills = (k.kills || 0) + 1;
    if (v.isTomo) { this.bark(`供の${v.name}が討たれた`, true); this.say(this.G.name, `${v.name}……！`, 2); }
    if (v.isSub) {
      const left = this.squad.filter((s) => s.alive).length;
      // 討たれた者の最期の声を先に（呼び名は身分で変える）、それから知らせ
      const boss = this.G.rank >= 4 ? '御大将' : this.G.rank >= 3 ? 'お頭' : '組頭';
      if (left > 0 && Math.random() < 0.5) this.say(v.name || '足軽', voice(this, 'subDie', null, boss), 1.8);
      // 組が半分を切ってから討たれると、残った者の声が震える
      else if (left > 0 && this.squadFear() > 0.5 && (this.fearT ?? -99) + 12 < this.t) { this.fearT = this.t; const s2 = this.squad.find((x) => x.alive); this.say((s2 && s2.name) || '組の者', voice(this, 'fearMore', null, boss), 2); }
      this.bark(`${v.name ? v.name + 'が' : '部下が'}討たれた（残り${left}人）`, true);
      if (left > 0 && (this.allyDownLineT ?? -99) + 20 < this.t) { this.allyDownLineT = this.t; this.bark(`味方「${pickLine(this, 'allyDown', 'ally')}」`, true); }
      if (v.roster && v.roster.special === 'yashichi') this.say(this.G.name, '弥七……！', 2.5);
    }
    // 名のある武将が討たれると、周りの旗本が叫び、その隊の旗が一斉に傾く
    if (v.name && v.type === 'busho') {
      this.army.play('cry', v.pos, 1.3); this.after(0.35, () => this.army.play('eshout', v.pos, 1.2));
      if (this.distTo(v.pos) < 70) { this.hud.cineFlash(2.2); if ((this.hushT ?? -99) + 20 < this.t) { this.hushT = this.t; hush(2.5); } }
      for (const st of (v.group && v.group.stds) || []) if (st.userData && st.userData.std) st.userData.std.dipT = 1.6;
      if (!this.over && (this.bushoSayT ?? -99) + 10 < this.t && this.distTo(v.pos) < 90) {
        this.bushoSayT = this.t;
        if (v.team !== 0) this.after(1.4, () => { if (!this.over) this.bark(`味方「${voice(this, 'bushoKilled')}」`); });
        else this.after(0.8, () => { if (!this.over) this.bark(`味方の足軽「${voice(this, 'allyBushoFall')}」`, true); });
      }
    }
    // 名のある敵将が味方に討たれた時は、戦っていなければその方へ一瞬目を向ける（大事な瞬間を見逃さない）
    if (v.name && v.type === 'busho' && v.team !== 0 && !(k && k.isPlayer) && !this.player.lock && !(this.player.inCombatT > 0) && this.distTo(v.pos) < 70) this.player.cine = { x: v.pos.x, z: v.pos.z, t: 1.2 };
    if (k && k.isPlayer && v.team !== 0) {
      this.stats.kills++;
      this.hud.killMark();
      // 討ち取った一撃は、時が一瞬止まり（名のある者ほど長く）、視野がわずかにすぼまる
      this.game.hitstop = Math.max(this.game.hitstop || 0, v.name || v.type === 'busho' ? 0.16 : 0.1);
      if (!S.reduceMotion) this.player.fovKick = Math.min(this.player.fovKick || 0, -1.8);
      sfx('kill', 0.8);
      // 少し遅れて、相手の体が地に崩れる音（倒した事が耳で分かる）
      this.after(0.5, () => this.army.play('thud', v.pos, 0.9));
      this.grantTitle('firstBlood');
      if (v.type === 'busho') {
        this.grantTitle('busho');
        // 武将を討った瞬間は時がゆっくり流れる
        this.game.slowmo = 0.9;
        this.banner(`${v.name || '敵武将'}、討ち取ったり`);
      }
      const at = { x: v.pos.x, y: v.pos.y, z: v.pos.z };
      if (v.type === 'samurai') this.award((t) => t.c.samurai++, '敵侍撃破', at);
      else if (v.type === 'busho') this.award((t) => t.busho.push(v.name || '敵武将'), `敵武将撃破：${v.name || ''}`, at);
      else this.award((t) => t.c.ashigaru++, '敵足軽撃破', at);
    } else if (k && k.isSub && v.team !== 0) {
      this.award((t) => t.c.subKills++, '部下の撃破');
      // 自分の鉄砲組の一斉射撃で倒れた数をまとめて知らせる（間が空いたら、その時までの数で出す）
      if (k.type === 'gun') {
        this.volleyKillN = (this.volleyKillN || 0) + 1;
        const tok = (this.volleyKillTok = (this.volleyKillTok || 0) + 1);
        this.after(0.4, () => { if (this.volleyKillTok === tok && this.volleyKillN > 0 && !this.over) { this.bark(`鉄砲組が${this.volleyKillN}人を倒した`); this.volleyKillN = 0; } });
      }
    }
    // 首級
    if (v.team !== 0 && (v.type === 'samurai' || v.type === 'busho') && !v.noHead && k && (k.isPlayer || k.isSub)) {
      const id = 'head' + v.id;
      const pos = { x: v.pos.x, z: v.pos.z };
      this.hint('head');
      this.addInteract(id, pos, `首を取る（${v.name || (v.type === 'busho' ? '敵武将' : '敵侍')}）`, () => {
        this.uninteract(id);
        this.award((t) => t.c.heads++, '首級獲得');
        if (this.def.onHead) this.def.onHead(this, v);
      }, { r: 2.6, ttl: 14, hold: 0.8 });
    }
    if (this.def.onKill) this.def.onKill(this, v, k);
    taishoKill(this, v, k);
  }

  onFlank(g) {
    if (g.flankAwarded || g.flankHits < 6) return;
    g.flankAwarded = true;
    this.award((t) => t.c.flank++, '側面攻撃成功');
    if (this.tracker.c.flank >= 2) this.grantTitle('flank2');
    this.say('足軽', '横槍が入ったぞ！敵が崩れる！', 2.5);
  }

  onFlankHit(g) {
    if (g.flankAwarded) return;
    const now = this.t;
    if (!g.flankBarkT || now - g.flankBarkT > 2.5) {
      g.flankBarkT = now;
      this.bark(`横腹を突いている（${Math.min(6, g.flankHits)}/6）`);
    }
  }

  onRout(g) {
    if (g.team !== 0) {
      this.bark(voice(this, 'rout'));
      // 崩れた敵勢の悲鳴が乱れて聞こえる
      const c = g.center();
      this.army.play('cry', c, 1.6);
      this.after(0.3, () => this.army.play('cry', c, 1.2));
    }
    else if (!this.over && (this.withdrawT ?? -99) + 25 < this.t && this.distTo(g.center()) < 60) { this.withdrawT = this.t; this.bark(`味方の侍「${voice(this, 'withdraw')}」`, true); }
    if (this.def.onRout) this.def.onRout(this, g);
  }

  // 名のある武将が、退いて地図の外・遠景の手前へ消えた（討たれたのではない）。戦功・任務の数えには入れない
  onFlee(u) {
    if (!this.over) this.bark(`${u.name}、落ち延びた`, true);
    if (this.def.onFlee) this.def.onFlee(this, u);
  }

  onPlayerHit(t) {
    if (t.type === 'dummy') { this.flags.dummyHits = (this.flags.dummyHits || 0) + 1; }
    if (this.def.onPlayerHit) this.def.onPlayerHit(this, t);
  }
  onSquadCommand(id, target) {
    // 号令は隊ごとに届く（遠い隊ほど遅れる）
    if (RELAYED.has(id) && this.squad.length) for (const g of this.player.selectedGroups()) if (g.count) this.relayOrder(g, id, g._snap);
    if (id === 'focus' && target) this.marker('focus', () => (target.alive ? { x: target.pos.x, z: target.pos.z, y: target.pos.y } : null), '狙え', { red: true, h: 2.6 });
    if (this.def.onSquadCommand) this.def.onSquadCommand(this, id, target);
  }

  interact() {
    const it = this.nearestInteract();
    // 長押しが要るもの（首・旗）は update で進める
    if (it && !it.hold) it.fn(this);
  }

  // 長押しの進み具合（首取りなど。その間は無防備）
  updateHold(dt, input) {
    const it = this.nearestInteract();
    if (it && it.hold && input.key('KeyE')) {
      this.holdT = (this.holdId === it.id ? this.holdT : 0) + dt;
      this.holdId = it.id;
      if (this.holdT >= it.hold) { this.holdT = 0; this.holdId = null; it.fn(this); }
    } else { this.holdT = 0; this.holdId = null; }
    this.holdPct = it && it.hold && this.holdId === it.id ? this.holdT / it.hold : 0;
  }

  // 名のある武将（def.famous）：史実でその場にいた武将を、その家の隊に一人ずつ加える
  //   一つ：{ name, team: 0|1, g: /隊の名/, loose（g に合う隊が無ければ大きな隊へ）, at: 秒, line: '名乗りの台詞', horse, mortal, near（そばの隊にも加える）, lord（true 信長の時だけ・false 足軽の時だけ） }
  //   隊は「名にその武将の名を含む隊」→ g に合う隊 → いちばん大きな隊の順で選ぶ。まだ隊が無ければ、出るまで待つ
  //   戦が始まった後の敵は、自分から 45m 内の隊には加えない（目の前に湧かせない）。味方は討たれない（mortal で討たれる）
  placeFamous() {
    const L = this.famousLeft || (this.famousLeft = this.def.famous.map((e) => ({ ...e })));
    if (!L.length || this.over) return;
    const p = this.player.u.pos, used = this.famousGroups || (this.famousGroups = new Set());
    for (let i = L.length - 1; i >= 0; i--) {
      const e = L[i], team = e.team ?? 1;
      if ((e.lord === false && this.G.lord) || (e.lord === true && !this.G.lord)) { L.splice(i, 1); continue; }
      if (e.at && this.t < e.at) continue;
      if (this.army.units.some((u) => u.name === e.name)) { L.splice(i, 1); continue; }
      const ok = (g) => g.team === team && !g.routed && !g.isPlayerSquad && !g.recyclable && !used.has(g) && g.count >= 4
        && !g.units.some((u) => u.alive && u.type === 'busho' && u.name)
        && !(team !== 0 && !e.near && this.t > 1 && Math.hypot(g.center().x - p.x, g.center().z - p.z) < 45);
      const gs = this.army.groups.filter(ok);
      const g = gs.find((x) => x.name && x.name.includes(e.name)) || (e.g && gs.filter((x) => e.g.test(x.name || '')).sort((a, b) => b.count - a.count)[0])
        || (!e.g || e.loose ? gs.sort((a, b) => b.count - a.count)[0] : null);
      if (!g) continue;
      const ng = g.noGuard; g.noGuard = true;
      const [u] = this.army.spawn(g, [{ type: 'busho', n: 1, o: { name: e.name, horse: e.horse, invuln: team === 0 && !e.mortal } }]) || [];
      g.noGuard = ng;
      const lead = u || g.units[g.units.length - 1];
      if (!lead || lead.name !== e.name) continue;
      if (e.line) lead.nanori = e.line;
      if (team === 0) lead.allyLine = e.line || `${e.name}の手、ここにあり。遅れを取るな！`;
      g.leader = lead; used.add(g); L.splice(i, 1);
    }
  }
  // 味方の名のある武将：そばへ寄ると一声かける（一人に一度）
  allyHail(p) {
    for (const u of this.army.units) {
      if (!u.alive || !u.allyLine || u.hailed || u.team !== this.player.u.team) continue;
      if (Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 16) continue;
      u.hailed = true;
      if ((this.hailT ?? -99) + 12 > this.t) return;
      this.hailT = this.t;
      this.say(u.name, u.allyLine, 3);
      return;
    }
  }

  // 名乗り：敵の武将が近づくと名を名乗る
  checkNanori() {
    if (this.def.famous) this.allyHail(this.player.u.pos);
    const p = this.player.u.pos;
    for (const u of this.army.units) {
      if (!u.alive || u.team === 0 || u.type !== 'busho' || u.invuln || u.announced) continue;
      if (Math.hypot(u.pos.x - p.x, u.pos.z - p.z) > 24) continue;
      u.announced = true;
      const nm = u.name || '敵の侍大将';
      const who = nm.replace(/^.*?(侍大将|方の)\s*/, '');
      this.say(nm, u.nanori ? u.nanori : who && who !== '侍大将' ? `やあやあ、我こそは${who}なり！　腕に覚えのある者はかかって参れ！` : `${nm.replace(/の?侍大将$/, '')}の侍大将、ここにあり！　腕に覚えのある者はかかって参れ！`, 3.5);
      this.hud.banner(`${nm}`, '名乗りを上げた');
      this.hud.cineFlash(2.8);
      if ((this.hushT ?? -99) + 20 < this.t) { this.hushT = this.t; hush(3); }
      this.army.play('eshout', u.pos, 1.2);
      // 戦っていなければ、名乗った武将の方へ目を向ける（勝手に向きすぎないよう一瞬だけ）
      if (!this.player.lock && !(this.player.inCombatT > 0)) this.player.cine = { x: u.pos.x, z: u.pos.z, t: 0.8 };
      // 名乗りの間は、まわりの隊が手を止めて一歩退き、道を開ける（3 秒ほどで元に戻る）
      const held = [];
      for (const g of this.army.groups || []) {
        if (!g.units || g.count === 0 || g.routed || g === u.group || g.noNanoriHold) continue;
        const c = g.center();
        const d = Math.hypot(c.x - u.pos.x, c.z - u.pos.z);
        if (d > 16 || d < 0.1) continue;
        held.push({ g, order: g.order, aggro: g.aggro, anchor: g.anchor });
        g.order = 'hold'; g.aggro = 0;
        g.anchor = { x: c.x + (c.x - u.pos.x) / d * 3, z: c.z + (c.z - u.pos.z) / d * 3 };
      }
      if (held.length) this.after(3.2, () => { for (const h of held) if (h.g.order === 'hold' && h.g.aggro === 0) { h.g.order = h.order; h.g.aggro = h.aggro; h.g.anchor = h.anchor; } });
      // 組を持つ身分なら、名乗り返せる（4 秒のうちに）。名乗り合えば組の士気が上がる
      if (this.squad.length && !this.def.dojo) {
        this.uninteract('nanori');
        this.addInteract('nanori', () => ({ x: this.player.u.pos.x, z: this.player.u.pos.z }), '名乗り返す', () => {
          this.uninteract('nanori');
          const fam = (this.def.sides && this.def.sides.a && this.def.sides.a.name) || '';
          this.say(this.G.name, `応！　${fam ? fam.replace(/軍$/, '家') + 'の' : ''}${this.rankName()}、${this.G.name}なり！　その首、もらい受ける！`, 3);
          this.army.play('shout', this.player.u.pos, 1.2);
          for (const g of this.squadGroups) g.morale = Math.min(100, (g.morale || 0) + 15);
          this.hud.flash('名乗り返した（組の士気が上がる）', 'gold');
        }, { r: 99, ttl: 4 });
      }
    }
  }

  // 組の輪と警告
  updateSquadAids(dt) {
    const p = this.player;
    // 得物を持ち替えた直後の 2 秒だけ、足もとに今の得物の間合いを薄い輪で（槍と刀の届く遠さの違いが分かるように）
    if (p.reachT > 0) {
      p.reachT -= dt;
      const r = p.weapon === 'spear' ? 2.9 : p.weapon === 'sword' ? 2.0 : 0;
      if (r && (!this.reachRing || this.reachRing.userData.r !== r)) { if (this.reachRing) this.scene.remove(this.reachRing); this.reachRing = this.ring(0, 0, r, 0xf1e9d6, 0.4); this.reachRing.userData.r = r; }
      if (this.reachRing) {
        this.reachRing.visible = !!r && p.reachT > 0;
        this.reachRing.position.set(p.u.pos.x, this.world.heightAt(p.u.pos.x, p.u.pos.z) + 0.12, p.u.pos.z);
        this.reachRing.material.opacity = 0.4 * Math.min(1, p.reachT / 0.6);
      }
    } else if (this.reachRing) this.reachRing.visible = false;
    // 狙い定めた相手の足元の輪
    if (!this.lockRing) { this.lockRing = this.ring(0, 0, 0.9, 0xe36a52, 0.8); this.lockRing.visible = false; }
    this.lockRing.visible = !!(p.lock && p.lock.alive);
    if (this.lockRing.visible) this.lockRing.position.set(p.lock.pos.x, p.lock.pos.y + 0.12, p.lock.pos.z);
    // 自分を狙う攻撃の届く範囲を、足元に朱の弧で
    if (!this.arcs) {
      this.arcs = [];
      // 攻めの届く所は、塗った三角でなく細い朱の弧（地面を赤く塗らない）
      const geo = new THREE.RingGeometry(2.55, 2.85, 20, 1, -0.45, 0.9);
      geo.rotateX(-Math.PI / 2);
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xd8341c, transparent: true, opacity: 0.25, depthWrite: false }));
        m.visible = false; m.renderOrder = 3;
        this.scene.add(m); this.arcs.push(m);
      }
    }
    const th = (this.army.threats || []).filter((u) => Math.hypot(u.pos.x - p.u.pos.x, u.pos.z - p.u.pos.z) < 6).slice(0, 3);
    this.arcs.forEach((m, i) => {
      const u = th[i];
      m.visible = !!u && !S.reduceMotion;
      if (!u) return;
      // 坂でカメラが低い時、平らな弧を横から見ると画面を横切る帯になるので隠す
      const cp = this.camera.position, gy = this.world.heightAt(u.pos.x, u.pos.z) + 0.1;
      if (Math.hypot(cp.x - u.pos.x, cp.z - u.pos.z) < 4 || cp.y - gy < 1.2) { m.visible = false; return; }
      m.position.set(u.pos.x, gy, u.pos.z);
      m.rotation.y = u.heading - Math.PI / 2;
      m.material.opacity = 0.25 + 0.45 * Math.max(0, 1 - (u.atk ? u.atk.t : 0.6) / 0.6);
    });
    // 号令先の隊：足もとに薄い金の輪。号令の輪や指揮の札を開いている時と、切り替えた直後ははっきり
    const uiOpen = p.cmdOpen || p.radial || this.hud.bigmap;
    if (this.selFlashT > 0) this.selFlashT -= dt;
    const many = this.squadGroups.filter((g) => g.count > 0).length > 1;
    for (const g of this.squadGroups) {
      // 行き先（前進）は白い小旗で示すので、輪は待て・槍衾・退けの時だけ
      const show = g.count > 0 && ['hold', 'yari', 'retreat'].includes(g.order);
      g.orderRing.visible = show;
      if (show) this.drapeRing(g.orderRing, g.anchor.x, g.anchor.z);
      const picked = g.count > 0 && (p.selGroup === 'all' || p.selGroup === g.kind);
      const sel = picked && (uiOpen || this.selFlashT > 0 || (many && p.selGroup !== 'all'));
      g.selRing.visible = sel;
      if (sel) {
        const c = g.center();
        // 輪の大きさは隊の広がりに合わせる
        let r = 0;
        for (const u of g.units) if (u.alive) r = Math.max(r, Math.hypot(u.pos.x - c.x, u.pos.z - c.z));
        g.selR = (g.selR || r) + (r - (g.selR || r)) * Math.min(1, dt * 3);
        const k = Math.max(2.4, Math.min(10, g.selR + 1.3)) / 3.4;
        g.selRing.scale.set(k, 1, k);
        g.selRing.position.set(c.x, this.world.heightAt(c.x, c.z) + 0.16, c.z);
        const flash = this.selFlashT > 0 ? Math.min(1, this.selFlashT) * (0.5 + 0.5 * Math.cos((4 - this.selFlashT) * 5)) : 0;
        g.selRing.material.opacity = (uiOpen ? 0.6 : 0.3) + (S.reduceMotion ? 0.2 * Math.min(1, this.selFlashT || 0) : flash * 0.3);
      }
    }
    const bows = this.squadGroups.find((g) => g.kind === 'bow');
    if (this.bowRing) this.bowRing.visible = !!(p.cmdOpen && bows && bows.count > 0);
    if (this.bowRing && this.bowRing.visible) { const c = bows.center(); this.bowRing.position.set(c.x, this.world.heightAt(c.x, c.z) + 0.2, c.z); }
    // 前進の行き先の下見：照準の先に薄い白い小旗（決めた後の小旗と同じ形）
    const wantMove = this.G.rank >= 2 && (p.cmdOpen || (p.radial && p.radialSel >= 0 && RADIAL[p.radialSel].id === 'move'));
    if (this.moveRing) this.moveRing.visible = wantMove;
    if (wantMove && !this.ghostFlag) { this.ghostFlag = this.buildDestFlag(0.45); this.ghostFlag.route.visible = false; }
    if (this.ghostFlag) this.ghostFlag.root.visible = wantMove;
    if (wantMove) {
      const a = p.aimPoint(), hy = this.world.heightAt(a.x, a.z);
      this.moveRing.position.set(a.x, hy + 0.2, a.z);
      this.ghostFlag.root.position.set(a.x, hy, a.z);
    }
    if (this.stats.parries >= 10) this.grantTitle('parry10');
    if (!this.squad.length) return;
    const alive = this.squad.filter((s) => s.alive);
    if (!alive.length) return;
    const g0 = this.squadGroups[0];
    const c = g0.center();
    const far = Math.hypot(c.x - p.u.pos.x, c.z - p.u.pos.z);
    const warn = (id, cond, fn, every = 25) => {
      if (!cond) return;
      if ((this.warnT[id] || -99) + every > this.t) return;
      this.warnT[id] = this.t;
      fn();
    };
    warn('far', far > 38 && g0.order !== 'follow', () => { this.bark(isTouch ? '組と離れすぎている（「号令」から「ついて来い」）' : `組と離れすぎている（${K('follow')} でついて来い）`, true); this.hint('far'); });
    const mor = this.squadGroups.reduce((a, g) => a + g.morale, 0) / this.squadGroups.length;
    warn('mor', mor < 45, () => { this.bark(isTouch ? '組が動揺している！　「鼓舞」を押せ' : `組が動揺している！　${K('rally')} で鼓舞`, true); this.hint('rally'); });
  }

  // ---------------- 更新 ----------------
  // 柵を使う：近くの柵を引き倒す（長押し）、倒れた味方の柵を立て直す（長押し）。一番近い柵一つだけを 0.5 秒ごとに選び直す
  updateFences(dt) {
    this.fenceT = (this.fenceT || 0) - dt;
    if (this.fenceT > 0) return;
    this.fenceT = 0.5;
    this.uninteract('fence');
    const P = this.player.u;
    if (!P.alive || this.over || this.player.mounted) return;
    let best = null, bd = 2.6;
    for (const s of this.army.structs) {
      if (!s.seg || !/柵/.test(s.name || '') || s.maxHp > 1e8 || s.burn >= 3 || s.gate !== undefined) continue;
      if (!s.alive && s.team !== P.team) continue;   // 立て直せるのは味方の柵だけ
      const d = distToSeg(P.pos.x, P.pos.z, s.seg);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return;
    const s = best, mid = { x: (s.seg[0] + s.seg[2]) / 2, z: (s.seg[1] + s.seg[3]) / 2 };
    // 柵のすぐ陰にいて、柵の向こうに敵の鉄砲・弓がいれば、一戦に一度だけ知らせる（柵の陰は弾が通りにくい）
    if (s.alive && bd < 1.6 && !this.flags.fenceCoverNoted) {
      const sh = this.army.nearestEnemy(P, 60, (o) => o.type === 'gun' || o.type === 'bow');
      if (sh && this.army.wallBetween(sh.pos, sh.team, P.pos)) { this.flags.fenceCoverNoted = true; this.bark('柵の陰に入った。ここなら弾や矢が通りにくい'); }
    }
    // 札の置き場は柵の上の、本人にいちばん近い所（ほかの札より近いとは限らない）
    const [ax, az, bx, bz] = s.seg, dx = bx - ax, dz = bz - az, tt = Math.max(0, Math.min(1, ((P.pos.x - ax) * dx + (P.pos.z - az) * dz) / (dx * dx + dz * dz || 1)));
    const cp = { x: ax + dx * tt, z: az + dz * tt };
    if (s.alive) {
      this.addInteract('fence', cp, '柵を引き倒す', () => {
        if (!s.alive) return;
        s.hitFrom = { x: P.pos.x, z: P.pos.z }; s.alive = false; s.hp = 0;
        this.army.structFall(s);
        // 打ち壊した時と同じく、戦の定義にも知らせる（柵を破る任務などが進むように）
        if (this.army.hooks && this.army.hooks.onStructDestroyed) this.army.hooks.onStructDestroyed(s);
        this.bark('柵を引き倒した');
      }, { r: 3, hold: 1.2 });
    } else {
      this.addInteract('fence', cp, '柵を立て直す', () => {
        if (s.alive) return;
        s.alive = true; s.hp = s.maxHp * 0.6; s.wearLv = 0; s.tiltA = 0; s.knock = 0;
        if (this.army.falling) this.army.falling = this.army.falling.filter((F) => F.s !== s);
        const m = s.mesh;
        if (m) { m.visible = true; m.matrix.identity(); m.matrixAutoUpdate = true; m.updateMatrix(); m.matrixWorldNeedsUpdate = true; }
        this.army.play('knock', mid, 0.8);
        this.bark('柵を立て直した（まだ緩い）');
      }, { r: 3, hold: 1.8 });
    }
  }

  // 後詰：本人のまわり（80m）の本物の味方が 10 人を割ったら、本人の後ろ（敵と反対）から後詰の足軽が駆けつける（全戦共通。45 秒に一度、五度まで）
  //   戦の定義が def.noReserve を立てた戦（籠城・一騎駆けの筋書きなど）では出さない
  updateReserves() {
    const P = this.player.u;
    if (this.over || !P.alive || this.def.noReserve || this.def.noWake || this.def.dojo || this.army.duel || this.phase === 'duel' || this.t < 30) return;
    if ((this.resT || 0) > this.t || (this.resN || 0) >= 5) return;
    this.resT = this.t + 3;
    let near = 0, all = 0;
    for (const u of this.army.units) {
      if (!u.alive) continue;
      all++;
      if (u.team === P.team && !u.isPlayer && !u.fleeing && Math.abs(u.pos.x - P.pos.x) + Math.abs(u.pos.z - P.pos.z) < 110) near++;
    }
    if (near >= 10 || all > 215) return;
    const foe = this.army.nearestEnemy(P, 60, (o) => !o.fleeing);
    if (!foe) return;
    this.resT = this.t + 45; this.resN = (this.resN || 0) + 1;
    const dx = P.pos.x - foe.pos.x, dz = P.pos.z - foe.pos.z, dl = Math.hypot(dx, dz) || 1;
    const x = Math.max(-165, Math.min(165, P.pos.x + dx / dl * 32)), z = Math.max(-165, Math.min(165, P.pos.z + dz / dl * 32));
    const ref = this.army.groups.find((g) => g.team === P.team && !g.isPlayerSquad && g.faction) || this.squadGroups[0];
    const flagU = this.army.units.find((u) => u.team === P.team && !u.isPlayer && u.look && u.look.flag);
    const face = Math.atan2(-dx, -dz);
    const g = this.army.addGroup({ team: P.team, faction: (ref && ref.faction) || this.G.lordFaction || scenario().faction, name: '後詰の足軽', order: 'attack', formation: 'line',
      anchor: { x, z }, facing: face, width: 8, aggro: 14, seekRange: 50, morale: 85, speed: 3.2 });
    const o = flagU ? { flag: flagU.look.flag } : {};
    this.army.spawn(g, [{ type: 'samurai', n: 1, o }, { type: 'ashigaru', n: 9, o }]);
    this.bark('後詰の足軽が駆けつけてきた！');
  }
  // 自分の組が崩れた（動ける者が一人以下）：近く（45m）の味方の隊から、名の無い兵を組へ回して立て直す（30 秒に一度）
  regroupSquad() {
    const P = this.player.u;
    if (!this.squadGroups.length || this.over || !P.alive || (this.regroupT || 0) > this.t) return;
    if (this.squad.filter((s) => s.alive && !s.fleeing).length > 1) return;
    this.regroupT = this.t + 3;
    let best = null, bd = 45;
    for (const g of this.army.groups) {
      if (g.team !== P.team || g.isPlayerSquad || g.routed || g.count < 4 || g.guard || g === this.tomoGroup || g === this.hostGroup) continue;
      const c = g.center(), d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
      if (d < bd) { bd = d; best = g; }
    }
    if (!best) return;
    const want = Math.max(3, Math.min((RANKS[this.G.rank] && RANKS[this.G.rank].squad) || 5, Math.floor(best.count / 2)));
    const take = best.units.filter((u) => u.alive && !u.fleeing && !u.name && !u.invuln && u.type !== 'busho' && u !== best.leader && !u.mounted).slice(0, want);
    if (take.length < 2) return;
    this.regroupT = this.t + 30;
    const g = this.squadGroups.find((q) => q.kind === 'spear' || !q.kind) || this.squadGroups[0];
    for (const u of take) {
      best.units.splice(best.units.indexOf(u), 1);
      u.group = g; u.slot = g.units.length; g.units.push(u);
      u.isSub = true; u.target = null; u.atk = null; u.aiT = 0;
      this.squad.push(u);
    }
    g.initial = Math.max(g.initial || 0, g.units.length);
    g.routed = false; g.rallied = true; g.order = 'follow'; g.focus = null;
    g.morale = Math.max(g.morale, 70);
    g.anchor = { x: P.pos.x, z: P.pos.z };
    this.banner('組を立て直す', `${best.name || '味方の隊'}から ${take.length} 人が組に加わった`);
  }

  update(dt, input) {
    this.updateFences(dt);
    this.updateReserves();
    this.regroupSquad();
    kamaeTick(this);
    if (this.over && this.endT !== undefined) {
      this.endT -= dt;
      if (this.endT <= 0 && !this.ended) { this.ended = true; this.game.endBattle(this); }
    }
    this.t += dt;
    this.pt += dt;
    if (!this.openSaid && this.player.inCombatT > 0 && this.t > 4 && !this.over && !this.def.dojo) {
      this.openSaid = true; this.cry('open');
      this.after(2.4, () => { if (!this.over) this.bark(`敵勢「${pickLine(this, 'nanori', 'enemy', monOf(this))}」`); });
    }
    // ざわめき：戦況の知らせが無い間、たまに足軽の呟きを短く挟む（8秒に一度までの決まりよりずっとまばら）
    if (!this.over && this.t > 6 && this.hud.subQ.length === 0 && (this.ambLineT ?? -99) + 22 + Math.random() * 16 < this.t) {
      this.ambLineT = this.t;
      const side = Math.random() < 0.5 ? 'ally' : 'enemy';
      this.bark(`${side === 'ally' ? '味方' : '敵'}の足軽「${pickLine(this, 'ambient', side, side === 'enemy' ? monOf(this) : null)}」`);
    }
    // 手ほどきの間は、戦の段取り（after の時計）をゆっくり進め、敵の寄せを遅らせる（def.tutorialHold の秒まで）
    let tdt = dt;
    if (this.holdLeft > 0) {
      if (this.tut && this.tut.auto && !this.over) { tdt = dt * 0.3; this.holdLeft -= dt - tdt; }
      else this.holdLeft = 0;
    }
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= tdt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(this); }
    }
    for (let i = this.interacts.length - 1; i >= 0; i--) {
      const it = this.interacts[i];
      it.ttl -= dt;
      if (it.ttl <= 0) this.interacts.splice(i, 1);
    }
    // 溜めていた判断は、斬り合いが落ち着いたら出す（時間切れは待っている間は進めない）
    if (this.pendingChoice && !(this.player.inCombatT > 0)) {
      const p = this.pendingChoice; this.pendingChoice = null;
      this.choice = { title: p.title, options: p.options, onPick: p.onPick, t: p.timeout };
      this.hud.renderChoice(this.choice);
      sfx('obj');
    }
    if (this.choice) {
      // 表示中にまた斬り合いが始まったら、時計は止めて待つ（急ぎで答えたければ数字の釦は使える）
      if (!(this.player.inCombatT > 0)) this.choice.t -= dt;
      if (input.pressed('Digit1')) { this.pickChoice(0); input.edge?.delete('Digit1'); }
      else if (input.pressed('Digit2')) { this.pickChoice(1); input.edge?.delete('Digit2'); }
      else if (this.choice && this.choice.t <= 0) this.pickChoice(0);
      else if (this.choice) this.hud.choiceTime(this.choice.t);
    }
    this.army.rain = this.world.rainLevel;
    this.updateHold(dt, input);
    if (!((this.nanoriT = (this.nanoriT || 0) - dt) > 0)) { this.nanoriT = 0.5; this.checkNanori(); }
    if (this.def.famous && !((this.famousT = (this.famousT || 0) - dt) > 0)) { this.famousT = 1.5; this.placeFamous(); }
    // 号令の前の隊の様子を覚えておく（遠い隊へは使番が届けるまで前のまま）
    for (const g of this.squadGroups) g._snap = snapOf(g);
    this.tutTick(dt);
    this.tutPauseTick(dt);
    this.coachTick(dt, input);
    if (this.player.u.alive) this.player.update(dt, input);
    // 後に回したヒントを、手ほどきが済んでから一つずつ
    // 古くなったヒント（60秒より前の事）は捨てる
    if (this.hintQ.length && !this.tut && !this.tutPause && !this.hud.hintBusy() && (this.hintGapT = (this.hintGapT || 0) + dt) > 3) {
      this.hintGapT = 0;
      while (this.hintQ.length && this.t - this.hintQ[0].t > 60) this.hintQ.shift();
      if (this.hintQ.length) this.hint(this.hintQ.shift().id);
    }
    this.camera.updateMatrixWorld();
    this.projView.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    if (this.ai && !this.over) this.ai.update(dt);
    this.army.update(dt, this.player.u.pos, this.camera.position, this.frustum);
    if (FL.ladders.length) updateLadders(this.army, dt);   // 床の層：梯子を登っている兵を進める（docs/castle-design.md 4章）
    this.world.update(dt, this.player.u.pos);
    this.updateCouriers(dt);
    if (!this.over) this.def.update(this, dt);
    taishoTick(this, dt);
    this.updateSquadAids(dt);
    this.updateArmyAids(dt);
    // 敵が近づいたら戦い方のヒント
    if (!this.flags.hintAtk && this.army.nearestEnemy(this.player.u, 10, (o) => o.type !== 'dummy')) { this.flags.hintAtk = true; this.hint('attack'); }
    // 初めて見る物：柵のそば・敵の槍衾（一秒ごとに見る）
    if ((this.hintSeeT = (this.hintSeeT || 0) - dt) <= 0) {
      this.hintSeeT = 1;
      const P = this.player.u.pos;
      if (!this.flags.hintFence && (this.army.structs || []).some((st) => st.alive && st.seg && /柵/.test(st.name || '') && Math.hypot((st.seg[0] + st.seg[2]) / 2 - P.x, (st.seg[1] + st.seg[3]) / 2 - P.z) < 7)) { this.flags.hintFence = true; this.hint('fence'); }
      if (!this.flags.hintYari && (this.army.groups || []).some((g) => g.team !== 0 && g.formation === 'yari' && g.count > 3 && !g.routed && (() => { const c = g.center(); return Math.hypot(c.x - P.x, c.z - P.z) < 22; })())) { this.flags.hintYari = true; this.hint('yarifusuma'); }
    }
    // 危ない時（深手に近い・背後から打たれた）は、一度だけ字幕で身の守り方を教える
    if (!this.flags.dangerTip && !this.over && this.player.u.alive) {
      const pu = this.player.u, lh = this.player.lastHit;
      const low = pu.hp > 0 && pu.hp <= pu.maxHp * 0.4;
      const back = lh && lh.back && this.t - lh.t < 1.5;
      if (low || back) {
        this.flags.dangerTip = true;
        this.say('', isTouch ? '危ない！　「構え」を押したまま下がれ。味方の列の中へ戻れ' : '危ない！　右クリックで構えたまま下がれ。味方の列の中へ戻れ', 4);
        this.bark(back ? '後ろだ！　構えて下がれ' : '構えて下がれ！', true);
        if (this.def.onDanger) this.def.onDanger(this);
      }
    }
    // 死が近い：大きく削られて一割八分を切った一撃は、倒れる寸前として大きく知らせる
    {
      const pu = this.player.u, ph = this.prevHp ?? pu.hp;
      if (pu.alive && pu.hp > 0 && pu.hp < ph - 1 && pu.hp < pu.maxHp * 0.18 && ph >= pu.maxHp * 0.18) this.brink();
      this.prevHp = pu.hp;
      this.aimedT = Math.max(0, (this.aimedT || 0) - dt);
    }
    // 重傷
    if (this.player.u.alive && this.player.u.hp <= 0) this.playerDown();
    // 戦場の喧噪と環境音
    let near = 0, marching = 0;
    this.army.forNear(this.player.u.pos.x, this.player.u.pos.z, 25, (o) => { if (o.alive && (o.target || o.atk)) near++; if (o.alive && o.team === 0 && o.moving > 0.3) marching++; });
    const heat = Math.min(1, near / 12);
    // 遠くの大軍どうしのぶつかり合い（world の clash）も、遠い唸りとして喧噪に混ぜる（近いほど大きく）
    let farHeat = 0;
    for (const c of this.world.clashes || []) {
      if (c.phase === 'wait') continue;
      const d = Math.hypot(c.x - this.player.u.pos.x, c.z - this.player.u.pos.z);
      farHeat = Math.max(farHeat, Math.max(0, 1 - d / 260) * 0.55);
    }
    setCrowd(Math.max(heat, farHeat));
    setRain(this.world.rainLevel);
    const u = this.player.u;
    // 大勢が歩けば足音と小札の擦れる音、夕暮れは虫の音（audio.js の ambience）
    // 山場：名のある敵の武将と 25m 以内で向き合っている間は、盛り上がりの曲（climax）へ
    this.climaxT = (this.climaxT || 0) - dt;
    if (this.climaxT <= 0) {
      this.climaxT = 0.5;
      this.climax = u.alive && this.army.units.some((o) => o.alive && o.team !== u.team && o.type === 'busho' && o.name && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 25);
      // 「ついて来い」のまま組が 25m 以上遅れたら、どの組か言う
      if (u.alive && (this.lagWarnT ?? -99) + 20 < this.t) {
        const lag = this.squadGroups.find((g) => g.count > 0 && g.order === 'follow' && !g.pending && Math.hypot(g.center().x - u.pos.x, g.center().z - u.pos.z) > 25);
        if (lag) { this.lagWarnT = this.t; this.bark(`${this.squadGroups.filter((g) => g.count > 0).length > 1 ? GROUP_NAME[lag.kind] || '組' : '組'}が遅れている（待つか、道を空けて呼べ）`, true); }
      }
      // 動いている隊の後ろに土煙の帯（乾いた日だけ。騎馬は大きく、駆けるほど多く）。遠くの隊の動きも土煙で分かる
      const W = this.world;
      const dry = !(W.rainLevel > 0.4 || (W.wetness || 0) > 0.5 || (W.def.muddy || 0) > 0.5);
      {
        for (const g of this.army.groups) {
          if (!g.count || g.count < 4) continue;
          const c = g.center(), pc = g._dustC || (g._dustC = { x: c.x, z: c.z });
          // 大きな隊が「かかれ」「退け」に変わった時は、その隊の所から陣太鼓・鉦が鳴る（号令が耳で分かる）
          if (g._ord !== undefined && g._ord !== g.order && g.count >= 12 && !g.isPlayerSquad && (this.drumT ?? -99) + 3 < this.t) {
            this.drumT = this.t;
            if (g.order === 'attack' || g.order === 'assault') this.army.play('jindaiko', c, 1.1);
            else if (g.order === 'retreat') this.army.play('kane', c, 1);
          }
          g._ord = g.order;
          const mdx = c.x - pc.x, mdz = c.z - pc.z, v = Math.hypot(mdx, mdz) / 0.5; pc.x = c.x; pc.z = c.z;
          if (v < 1.6 || v > 30 || Math.hypot(c.x - u.pos.x, c.z - u.pos.z) > 220) continue;
          const cav = g.kind === 'cavalry' || g.units.some((x) => x.alive && x.mounted);
          // 寄せてくる敵の隊は、姿より先に足音・蹄の地鳴りで分かる（遠いほど遅れて、こもって届く）
          if (g.team !== 0 && Math.random() < 0.45) this.army.play(cav ? 'gallop' : 'tramp', c, Math.min(1.4, 0.5 + g.count / 40));
          // 大きな敵の隊がこちらへ寄せて来る：戦っていなければ、膝の高さから迫る隊を数秒見せる（一戦に二度まで、90 秒あけて）
          if (g.team !== 0 && g.count >= 25 && u.alive && !this.over && (this.approachN || 0) < 2 && (this.approachT ?? -99) + 90 < this.t && !(this.player.inCombatT > 0) && !this.player.lock && !this.player.camShot) {
            const dd = Math.hypot(c.x - u.pos.x, c.z - u.pos.z);
            if (dd > 45 && dd < 150 && ((u.pos.x - c.x) * mdx + (u.pos.z - c.z) * mdz) / (dd * (Math.hypot(mdx, mdz) || 1)) > 0.7) {
              const ex = (c.x - u.pos.x) / dd, ez = (c.z - u.pos.z) / dd;
              if (this.player.showShot({ x: u.pos.x + ex * 3 - ez * 2.5, z: u.pos.z + ez * 3 + ex * 2.5 }, () => g.center(), 3.4, { h: 0.6, lookH: 1.8, drift: 0.5, ang: Math.atan2(ex, -ez), zoom: 18 })) {
                this.approachT = this.t; this.approachN = (this.approachN || 0) + 1;
                this.army.play('jindaiko', c, 1.2); this.after(1.2, () => this.army.play('toki', c, 1.3));
                this.bark(cav ? '騎馬の大軍が来る……！' : '来るぞ……敵の大軍が寄せて来る！', true);
                // 寄せて来る敵勢の鬨の中に、その家の言葉が混じって聞こえる
                const ft = (foeTongue(this, 'push') || []).concat([pickLine(this, 'pushing', 'enemy', monOf(this))].filter(Boolean));
                if (ft.length) this.after(2.6, () => { if (!this.over) this.bark(`敵勢「${ft[Math.floor(Math.random() * ft.length)]}」`); });
              }
            }
          }
          const n = Math.min(3, Math.floor((cav ? 1.5 : 0.6) + v / (cav ? 4 : 5) + g.count / 40));
          const ml = Math.hypot(mdx, mdz) || 1, f = { x: mdx / ml, z: mdz / ml }, sx = -f.z, sz = f.x;
          for (let i = 0; i < (dry ? n : 0); i++) {
            const lat = (Math.random() - 0.5) * Math.min(24, 4 + g.count * 0.35), back = 2 + Math.random() * 5;
            W.dustCloud(c.x - f.x * back + sx * lat, c.z - f.z * back + sz * lat, cav && v > 5);
          }
        }
      }
      // 30 秒ほど同じ所から動かず、戦ってもいない時は、上役が行き先を一言教え、そちらへ目を向けさせる
      const sp0 = this.stuckP || (this.stuckP = { x: u.pos.x, z: u.pos.z, t: this.t });
      if (Math.hypot(u.pos.x - sp0.x, u.pos.z - sp0.z) > 4 || this.player.inCombatT > 0 || this.over || this.phase === 'wait') { sp0.x = u.pos.x; sp0.z = u.pos.z; sp0.t = this.t; }
      else if (this.t - sp0.t > 30 && u.alive && (this.stuckN || 0) < 2) {
        sp0.t = this.t + 30;
        const mk = this.markers.find((m) => !m.red) || this.markers[0];
        const q = mk && (typeof mk.pos === 'function' ? mk.pos() : mk.pos);
        if (q && Math.hypot(q.x - u.pos.x, q.z - u.pos.z) > 25) {
          this.stuckN = (this.stuckN || 0) + 1;
          const bi = !this.def.mapCastle && !this.def.dojo && BATTLES[this.index], who = this.G.lord ? '近習' : this.def.bossName || (bi && bi.boss ? bi.boss.replace(/^.*\s/, '') : '組頭');
          const where = mk.label ? `「${String(typeof mk.label === 'function' ? mk.label() : mk.label).replace(/・.*$/, '')}」はあちら、旗の方` : 'あちら';
          // 信長で遊ぶ時は、近習が主君に道を申し上げる（上役が主君を呼び捨てにしない）
          this.say(who, this.G.lord ? `殿、${where}にございます` : `${this.G.name}、こっちじゃ！　${where}へ進め`, 2.5);
          if (!this.player.lock) this.player.cine = { x: q.x, z: q.z, t: 1 };
        }
      }
      // 近くに隊旗（幟・指物）があれば、風で布が鳴る（突風ほど強く）
      this.flagNear = this.army.groups.some((g) => g.team === 0 && g.count > 0 && (g.stds || []).length && Math.hypot(g.center().x - u.pos.x, g.center().z - u.pos.z) < 18);
      // 周りで戦う兵の声：近くで斬り合っている者から、ときどき掛け声や叫びが上がる（字は出さず、音の向きと遠さで）
      this.shoutT = (this.shoutT || 0) - 0.5;
      if (this.shoutT <= 0) {
        const cand = [];
        this.army.forNear(u.pos.x, u.pos.z, 22, (o) => { if (o.alive && !o.isPlayer && (o.atk || o.target) && cand.length < 12) cand.push(o); });
        if (cand.length) {
          this.shoutT = 1.2 + Math.random() * 2.2 - Math.min(0.8, cand.length * 0.06);
          const o = cand[Math.floor(Math.random() * cand.length)];
          this.army.play(o.team === 0 ? 'eshout' : Math.random() < 0.5 ? 'eshout' : 'cry', o.pos, 0.45 + Math.random() * 0.3);
        } else this.shoutT = 2;
      }
      // 深手の時：組の者（いなければ近くの味方）が「退かれよ！」と叫ぶ（18 秒に一度）
      if (u.alive && !this.over && u.hp < u.maxHp * 0.3 && (this.retreatCallT ?? -99) + 18 < this.t) {
        this.retreatCallT = this.t;
        const boss = this.G.rank >= 4 ? '御大将' : this.G.rank >= 3 ? 'お頭' : '組頭';
        const sub = this.squad.find((x) => x.alive && this.distTo(x.pos) < 25);
        if (sub) { this.bark(`${sub.name || '組の者'}「${boss}、退かれよ！　お命が！」`, true); this.army.play('eshout', sub.pos, 0.6); }
        else if (this.army.units.some((o) => o.alive && o.team === u.team && !o.isPlayer && this.distTo(o.pos) < 15)) this.bark(`味方の足軽「${voice(this, 'retreatMe')}」`, true);
      }
      // 囲まれつつあるか（四方の敵の並びと、残る退き口の広さ）
      if (u.alive && !this.over) this.checkEncircle(); else this.encircle = null;
      // 自分を狙って火蓋を切ろうとしている敵の鉄砲がいれば、画面の縁が赤く脈打つ
      if (u.alive) this.army.forNear(u.pos.x, u.pos.z, 60, (o) => { if (o.alive && o.type === 'gun' && o.team !== u.team && o.atk && o.atk.ranged && o.atk.target === u) this.aimedT = Math.max(this.aimedT || 0, 0.7); });
      // 組が半分より減ったら、戦いの合間に怯えた声が漏れる
      if (u.alive && !this.over && this.player.inCombatT > 0 && this.squadFear() > 0.5 && (this.fearT ?? -99) + 35 < this.t) {
        const sub = this.squad.find((x) => x.alive && this.distTo(x.pos) < 25);
        if (sub) {
          this.fearT = this.t;
          this.say(sub.name || '組の者', voice(this, 'fear'), 2);
          this.army.play('umeki', sub.pos, 0.4);
        }
      }
      // 騎馬の突撃が初めてこちらへ来た時だけ、その方へ目を向けさせる（どこから来るか分かるように）
      if (u.alive && !this.cavSeen && !this.player.lock) {
        const cv = this.army.units.find((o) => o.alive && o.team !== u.team && o.charging && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 32);
        if (cv) { this.cavSeen = true; this.player.cine = { x: cv.pos.x, z: cv.pos.z, t: 0.9 }; this.bark(voice(this, 'cavCome'), true); }
      }
    }
    const lowK = u.alive && u.hp < u.maxHp * 0.3 ? 1 - u.hp / (u.maxHp * 0.3) : 0;
    ambience(dt, { heat, calm: near === 0, rain: this.world.rainLevel > 0.2, hurt: u.alive && u.hp < u.maxHp * 0.3, hurtK: lowK, march: Math.min(1, marching / 20), night: this.world.timeKey === 'dusk', climax: this.climax && !this.over,
      wet: this.world.rainLevel > 0.3 || (this.world.wetness || 0) > 0.5 || (this.world.def.muddy || 0) > 0.5,
      flap: this.flagNear ? Math.max(0, (WIND_STATE.gust || 1) - 0.6) : 0,
      summer: this.isSummer ?? (this.isSummer = /夏/.test(this.def.date ? this.def.date(this) : '')), after: this.world.timeKey === 'after',
      pant: u.alive && !this.player.mounted ? Math.max(0, 1 - this.player.sta / (this.player.maxSta * 0.45), u.hp < u.maxHp * 0.3 ? 0.45 + lowK * 0.5 : 0) : 0 });
    this.player.updateCamera(dt, this.camera);
    updateHumans(this, dt);   // 近くの兵を骨の入った人で描く（humans.js）
    this.hud.update(dt, this);
  }

  playerDown() {
    const u = this.player.u;
    // 足軽の最初の二戦は一度だけ、倒れる寸前に仲間が割って入り、引き起こしてくれる（初めての人が最初の戦で終わらないように）
    // 筋書きの最初の戦（手ほどきの戦）は三度まで
    if (this.firstFights && (this.flags.secondWind || 0) < (this.index === 0 ? 3 : 1) && !this.over) {
      this.flags.secondWind = (this.flags.secondWind || 0) + 1;
      u.hp = u.maxHp * 0.5;
      this.player.iframe = 1.5;
      this.army.forNear(u.pos.x, u.pos.z, 5, (o) => { if (o.alive && o.team !== u.team && !o.isStruct) { o.stagger = 1.4; o.atk = null; o.cd = 1.6; } });
      const bi = BATTLES[this.index], who = bi && bi.boss ? bi.boss.replace(/^.*\s/, '') : '仲間';
      this.say(who, `${this.G.name}、死に急ぐな！　一度下がって息を整えよ。構えたまま、味方の列の中へ！`, 4);
      this.bark('仲間が割って入った', false);
      this.flags.dangerTip = true;
      return;
    }
    // 初陣（def.carryBack の戦）は、二度まで上役が後ろへ引きずって下げてくれ、後ろから戦を続けられる（討死のある難しさは除く）
    if (this.def.carryBack && !this.D.perma && (this.flags.carried || 0) < 2 && !this.over && this.index === 0) {
      this.flags.carried = (this.flags.carried || 0) + 1;
      const back = this.def.carryBack(this);
      if (back) {
        u.pos.x = back.x; u.pos.z = back.z; u.pos.y = this.world.heightAt(back.x, back.z);
        u.hp = u.maxHp * 0.6;
        this.player.iframe = 3;
        fadeAway(1.5);
        this.banner('深手', '組頭に引きずられ、後ろへ下げられた');
        const bi = BATTLES[this.index], who = bi && bi.boss ? bi.boss.replace(/^.*\s/, '') : '組頭';
        this.say(who, `${this.G.name}、無理をするな。ここで息を整えてから、また前へ出よ`, 4);
        return;
      }
    }
    // 組の者・供が近く（14m）にいれば、一つの戦で一度だけ、駆け寄って主を囲み、担ぎ起こしてくれる（組頭を見捨てない）
    const helpers = [...(this.squad || []), ...(this.tomoUnits || [])].filter((o) => o && o.alive && !o.fleeing && Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z) < 14);
    if (helpers.length && !this.flags.rescued && !this.over) {
      this.flags.rescued = true;
      u.hp = 1;
      this.player.iframe = 4.5;
      this.army.forNear(u.pos.x, u.pos.z, 4, (o) => { if (o.alive && o.team !== u.team && !o.isStruct) { o.stagger = 1.2; o.atk = null; o.cd = 1.4; } });
      // 組は主のまわりに円陣を組んで守る
      const saved = (this.squadGroups || []).map((g) => ({ g, order: g.order, form: g.formation }));
      for (const g of this.squadGroups || []) { g.order = 'hold'; g.anchor = { x: u.pos.x, z: u.pos.z }; g.formation = 'ring'; g.aggro = 6; for (const o of g.units) o.aiT = 0; }
      helpers.sort((a, b) => Math.hypot(a.pos.x - u.pos.x, a.pos.z - u.pos.z) - Math.hypot(b.pos.x - u.pos.x, b.pos.z - u.pos.z));
      const h = helpers[0], who = h.name ? h.name.replace(/^.* /, '') : '足軽';
      fadeAway(1.2);
      this.banner('深手', '組の者が駆け寄ってくる');
      this.say(who, `お頭！　お頭を守れ、囲めっ！`, 2.5);
      this.after(2.8, () => {
        if (this.over || !u.alive) return;
        // 味方の側（組の者のいる側）へ担いで数歩下げ、傷を縛って立たせる
        const dx = u.pos.x - h.pos.x, dz = u.pos.z - h.pos.z, L = Math.hypot(dx, dz) || 1;
        const bx = u.pos.x - dx / L * 5, bz = u.pos.z - dz / L * 5;
        u.pos.x = bx; u.pos.z = bz; u.pos.y = this.world.heightAt(bx, bz);
        u.hp = u.maxHp * 0.35;
        this.player.iframe = 2;
        this.banner('救われた', '組の者に担がれ、傷を縛ってまた立った');
        this.say(who, 'まだ死なせませぬぞ。無理はなされるな！', 3);
        for (const q of saved) { if (!q.g.count) continue; q.g.formation = q.form === 'ring' ? 'line' : q.form; q.g.order = q.order === 'hold' ? 'hold' : 'follow'; }
      });
      return;
    }
    u.hp = 0;
    u.alive = false;
    u.fall = 1; u.deadT = 0;
    if (this.D.perma) {
      fadeAway(4);
      this.banner('討死', `${this.G.name}、この地に果てる`);
      this.say('', '――槍を握ったまま、膝が崩れた。', 4);
      this.finish({ down: true, dead: true }, 5);
      return;
    }
    this.G.injured = true;
    fadeAway(3.5);   // 戦場の音が遠のく
    this.banner('重傷', '味方に担がれ、後方へ送られた');
    // 何にやられたかを一行で（次にどうすればよいかの手がかりも添える）。そのあと遠のく音の一行
    const lh = this.player.lastHit;
    let why = false;
    if (lh && this.t - lh.t < 6) {
      const who = lh.name || { ashigaru: '敵の足軽', samurai: '敵の侍', busho: '敵の武将', bow: '敵の弓', gun: '敵の鉄砲', cavalry: '敵の騎馬' }[lh.type] || '敵';
      const how = lh.ranged ? '遠くから撃たれた' : lh.mounted ? '馬上から突かれた' : lh.back ? '背後から突かれた' : lh.side ? '横から突かれた' : '正面から打ち負けた';
      const tip = lh.ranged ? '物陰か味方の列の後ろへ' : lh.mounted ? '騎馬は槍を揃えた列の中で待つ' : lh.back || lh.side ? '囲まれる前に下がり、味方と肩を並べる' : isTouch ? '「構え」を押し、打たれる直前に受け流す' : '右クリックで構え、打たれる直前に受け流す';
      this.say('', `${who}に${how}。次は：${tip}`, 3.2);
      why = true;
    }
    this.say('', '――深手を負った。戦場の音が遠のいていく……', 3);
    this.finish({ down: true }, why ? 7 : 5);
  }

  // 行軍・待ちを飛ばす
  skip() {
    const msg = this.def.canSkip && this.def.canSkip(this);
    // 飛ばせる場面でなければ、いま出ている台詞を一つ送る（長い台詞の列を読み終えたら先へ）
    if (!msg) { this.hud.nextSub(); return; }
    this.def.skip(this);
  }

  finish(info = {}, delay = 6) {
    if (this.over) return;
    this.over = true;
    // 戦の後の静けさ（太鼓が止み、烏と遠いうめき声と風）
    afterBattle(true);
    if (!info.down && this.tracker.main === true) {
      sfx('victory', 0.9); this.army.celebrate(0);
      // 勝鬨：「えい、えい、おう」を三度。生き残った味方が多いほど厚く
      const n = this.army.units.filter((o) => o.alive && o.team === 0).length;
      const v = 0.55 + Math.min(0.55, n / 160);
      for (const t of [1.1, 3.3, 5.5]) this.after(t, () => sfx('eiei', v));
      if (!this.def.dojo) this.after(2, () => this.cry('win'));
    } else if (!info.down && this.tracker.main === false) {
      // 負け戦：退き鉦が鳴り、遠くで敵の勝鬨が上がる
      sfx('sig_hike', 0.7);
      this.after(1, () => this.bark(`味方の侍「${voice(this, 'withdraw')}」`, true));
      this.after(2.4, () => { hush(4); sfx('far', 0.8); });
    }
    this.tutEnd();
    if (this.pendingChoice) { const p = this.pendingChoice; this.pendingChoice = null; p.onPick(0); }
    if (this.choice) this.pickChoice(0);
    this.result = info;
    if (this.def.onFinish) this.def.onFinish(this, info);
    if (info.down && this.tracker.main === null) this.tracker.main = false;
    this.tracker.subsAlive = this.squad.filter((s) => s.alive).length;
    this.tracker.finalized = true;
    this.endT = delay;
  }

  dispose() {
    // 兵のジオメトリは戦をまたいで共有しているので、地形と一時的な素材だけ解放する
    // 火縄銃・弓の札（player.js が出す）
    document.getElementById('rangedui')?.remove();
    this.world.terrain.geometry.dispose();
    this.scene.traverse((o) => {
      if (o.material && o.material.map && o.material.map.userData?.clone) o.material.map.dispose();
    });
    // 遠景の大軍・軽い大軍の合戦（addDistantArmy・addClash）は戦ごとに形を作り直すので、ここで解放する
    // （disposeしないと戦をまたいで溜まり、重い戦の始まりで固まりやすくなる）
    if (this.world.dispose) this.world.dispose();
  }

  // ---------------- 軍勢の印：隊旗・号令の届き・行き先 ----------------
  // 号令が届くまでの間（近い隊はすぐ、遠い隊ほど遅い）
  orderDelay(g) {
    // 声の届く 22m までは使番を走らせない。その先も遅れは 3 秒まで（号令が効かないように見えないように）
    const d = this.distTo(g.center());
    return d <= 22 ? 0 : Math.min(3, (d - 14) / 8);
  }
  // 号令を隊に伝える。遠い隊は前の号令に戻し、使番が着いた時に切り替える
  relayOrder(g, id, before) {
    const dl = this.orderDelay(g);
    if (dl <= 0 || !before) { if (g.pending) g.pending = null; this.after(0.3, () => this.replyGroup(g)); return 0; }
    const now = snapOf(g);
    applySnap(g, before);
    // 同じ号令を重ねて出しても、走っている使番の着く時は変えない
    if (g.pending && g.pending.id === id) { g.pending.st = now; return g.pending.t; }
    g.pending = { id, st: now, t: dl };
    this.sendRunner(g, dl);
    return dl;
  }
  // 号令を取り消す時のために、組の今の号令を覚える・戻す（player.command）
  squadSnaps() { return this.squadGroups.map((g) => [g, snapOf(g)]); }
  restoreSquad(list) {
    for (const [g, st] of list || []) {
      if (!g.count) continue;
      g.pending = null; g._gather = false;
      applySnap(g, st);
      this.replyGroup(g, true);
    }
  }
  // 隊の返事：隊旗が一斉に前へ傾き、兵が「応」と槍を上げる
  //   返事は士気で変わる：崩れかけの隊は旗が揺れるだけで槍も上がらず、動揺した隊は控えめに
  replyGroup(g, soft) {
    if (!g.count) return;
    if (g.team === 0 && g.morale < 18) return;
    if (g.morale < 35) soft = true;
    for (const s of g.stds || []) s.userData.std.dipT = 0.9;
    let k = 0;
    for (const u of g.units) {
      if (!u.alive || u.target || u.atk || u.isPlayer) continue;
      const d = (k++ % 5) * 0.06 + Math.random() * 0.1;
      this.after(d, () => { if (u.alive && !u.atk) u.cheer = soft ? 0.6 : 0.85; });
    }
    // 忍んで進む間（戦の定義が flags.quiet を立てる）は声を出さない。返事は旗の動きと字幕だけ
    if (this.flags.quiet) { this.hud.flash('組「……承知」', 'dim'); return; }
    sfx('ack', 0.2 + 0.35 * this.volumeAt(g.center()));
  }
  // 隊旗を持たせる者：組頭格か、隊の真ん中の後ろ寄りの者
  pickCarrier(g, avoid) {
    // 名のある武将・馬上の者には持たせない（武将は采配を執る。旗は旗持ちが持つ）
    if (g.leader && g.leader.alive && g.leader !== avoid && !g.leader.stdHeld && !g.leader.isPlayer && !g.leader.name && !g.leader.mounted && g.leader.type !== 'busho') return g.leader;
    const c = g.center(), f = g.forward();
    let best = null, bs = Infinity;
    for (const u of g.units) {
      if (!u.alive || u.isPlayer || u === avoid || u.stdHeld || u.type === 'busho') continue;
      const dx = u.pos.x - c.x, dz = u.pos.z - c.z;
      const sc = Math.abs(dx * f.z - dz * f.x) + Math.max(0, dx * f.x + dz * f.z) * 0.8;
      if (sc < bs) { bs = sc; best = u; }
    }
    return best;
  }
  attachStd(s, u) {
    const d = s.userData;
    if (d.carrier) d.carrier.stdHeld = false;
    d.carrier = u; u.stdHeld = true;
    u.mesh.add(s);
    s.userData.std.baseY = u.mounted ? 1.05 : 0.1;
    s.position.set(0.34, s.userData.std.baseY, -0.06);
    s.rotation.set(0, 0, 0);
    // 兵の体格の違いで旗の高さが変わらないように
    s.scale.set(1 / u.mesh.scale.x, 1 / u.mesh.scale.y, 1 / u.mesh.scale.z);
  }
  // 新しい隊に隊旗を持たせる（一秒ごとに見る）。自分の組・本陣・鉄砲・騎馬・旗持ちのいない槍の隊
  scanStandards() {
    const sideMon = this.def.sides ? this.def.sides.a.mon : scenario().mon;
    for (const g of this.army.groups) {
      if (g._stdChecked || !g.units.length || this.def.dojo) continue;
      g._stdChecked = true;
      g.stds = [];
      if (g.units.every((u) => u.type === 'dummy' || u.type === 'porter' || u.noTarget)) continue;
      const kind = g._kind = groupKind(g);
      const gen = kind === 'honjin' ? groupGeneral(g) : null;
      const fac = (FACTION[g.faction] || {}).flag || 'oda';
      const mon = g.isPlayerSquad ? sideMon : gen ? ((GENERALS[gen.name.replace(/^.* /, '')] || {}).mon || fac) : fac;
      let n = 0;
      if (g.isPlayerSquad) n = 1;
      else if (kind === 'honjin') n = 2;
      else if (g.initial >= 6 && ((kind !== 'spear' && kind !== 'bow') || !g.units.some((u) => u.banner))) n = 1;
      for (let i = 0; i < n; i++) {
        const u = this.pickCarrier(g) || (gen && !gen.stdHeld ? gen : null);
        if (!u) break;
        const s = buildStandard(kind, mon, g.faction, g.isPlayerSquad);
        this.attachStd(s, u);
        g.stds.push(s);
      }
    }
  }
  updateStandards(dt) {
    this.stdScanT = (this.stdScanT || 0) - dt;
    if (this.stdScanT <= 0) { this.stdScanT = 1; this.scanStandards(); }
    const t = this.t, cam = this.camera.position, wind = this.army.wind || 0.6;
    const p = this.player;
    const selSet = new Set(this.squad.length ? p.selectedGroups() : []);
    const many = this.squadGroups.filter((g) => g.count > 0).length > 1;
    for (const g of this.army.groups) {
      if (!g.count && !(g.stds && g.stds.length)) continue;
      // 士気で旗の姿勢を変える：落ちると揺らいで下がり、崩れかけは大きく傾き、潰走では倒れかける
      const m = g.morale;
      const L = g.routed ? 0.85 : m < 30 ? 0.32 : m < 55 ? 0.13 : 0;
      const low = g.routed ? 1.3 : m < 30 ? 0.8 : m < 55 ? 0.3 : 0;
      const amp = g.routed ? 0.2 : m < 30 ? 0.14 : m < 55 ? 0.07 : 0.025;
      const fq = m < 30 ? 2.6 : m < 55 ? 1.7 : 1.1;
      // 兵の背の指物も、乱れた隊では傾いて揺れる（近い兵だけ）
      if (L > 0 || g._tilted) {
        g._tilted = L > 0;
        for (const u of g.units) {
          if (!u.alive || !u.flag || u.offscreen || u.isPlayer) continue;
          u.flag.rotation.x = g._tilted ? -L * (0.5 + (u.id % 3) * 0.25) + Math.sin(t * fq + u.id) * amp : 0;
        }
      }
      if (!g.stds) continue;
      for (let i = g.stds.length - 1; i >= 0; i--) {
        const s = g.stds[i], d = s.userData.std, u = s.userData.carrier;
        // 旗持ちが討たれたら、旗はしばらく倒れたまま。やがて隣の者が拾い上げる
        if (!u || !u.alive) {
          d.downT = (d.downT || 0) + dt;
          if (d.downT > 2.4) {
            const nu = g.count && !g.routed ? this.pickCarrier(g, u) : null;
            if (nu) {
              d.downT = 0; this.attachStd(s, nu); d.dipT = 0.9; d.lean = 0.6;
              // 旗を拾い上げた所から「旗を守れ！」の声（近い味方の旗なら字でも）
              this.army.play('eshout', nu.pos, 1.1);
              if (g.team === 0 && this.distTo(nu.pos) < 30 && (this.flagCallT ?? -99) + 20 < this.t) { this.flagCallT = this.t; this.bark(`足軽「${voice(this, 'flag')}」`); }
            }
            else if (!u || u.gone || !u.mesh.parent) { if (s.parent) s.parent.remove(s); g.stds.splice(i, 1); }
          }
          continue;
        }
        const dc = Math.hypot(u.pos.x - cam.x, u.pos.z - cam.z);
        // 本陣の大旗：旗持ちが遠くて軽い絵（まとめ描き）に替わった間は、旗だけ場面に置いて立て続ける
        if (d.kind === 'honjin') {
          if (u.imp || !u.mesh.visible) {
            if (s.parent !== this.scene) { this.scene.add(s); s.scale.set(1, 1, 1); }
            s.position.set(u.pos.x + Math.cos(u.heading) * 0.34, u.pos.y + (d.baseY || 0.1), u.pos.z - Math.sin(u.heading) * 0.34);
            s.rotation.y = u.heading;
          } else if (s.parent !== u.mesh) this.attachStd(s, u);
        }
        // 本陣の大旗は霧の奥まで残す（大将の居場所が遠くから分かる。旗持ちの体が描かれている間）
        s.visible = dc < (d.kind === 'honjin' ? 900 : 320);
        if (!s.visible) continue;
        d.lean += (L - d.lean) * Math.min(1, dt * 1.2);
        d.low += (low - d.low) * Math.min(1, dt * 1.2);
        let dip = 0;
        if (d.dipT > 0) { d.dipT -= dt; dip = Math.sin(Math.max(0, d.dipT) / 0.9 * Math.PI) * 0.45; }
        const ph = u.id * 1.7;
        s.rotation.x = -d.lean + dip + Math.sin(t * fq + ph) * amp;
        s.rotation.z = Math.sin(t * fq * 0.7 + ph * 1.3) * amp * 0.8 - d.lean * 0.3;
        s.position.y = d.baseY - d.low + (s.parent === this.scene ? u.pos.y : 0);
        if (dc < 150) {
          // 布は風に振れる。吹流しは風下へ流れる
          if (d.kind === 'cavalry') { d.cloth.rotation.y = wind - u.heading - Math.PI / 2 + Math.sin(t * 1.9 + ph) * 0.3; d.cloth.rotation.z = -0.2 + Math.sin(t * 2.7 + ph) * 0.06; }
          else d.cloth.rotation.y = Math.sin(t * 1.3 + ph) * 0.28;
        }
        if (d.tag) { const k = tagOf(g); if (d.tagK !== k) { d.tagK = k; d.tag.material = plainMat('tag_' + k, TAG_COL[k], { basic: true }); } }
        if (d.sel) d.sel.visible = many && selSet.has(g) && !g.routed;
      }
    }
  }
  // 使番（伝令）：号令を遠くの隊へ走って届ける
  sendRunner(g, t) {
    this.runners = this.runners || [];
    let r = this.runners.find((x) => x.on && x.g === g) || this.runners.find((x) => !x.on);
    if (!r) {
      if (this.runners.length >= 3) return;
      const u = {};
      const m = buildModel(u, { armor: 0x1d1d1f, lace: 0x3c5a8a, hat: 'kabuto', sode: true, flag: null, weapon: 'none', skin: 0xb08a66, horo: 0xe6dfcf });
      u.lookWeapon = 'none'; poseArms(u);
      m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(m);
      r = { m, u, anim: 0, pos: { x: 0, z: 0 } };
      this.runners.push(r);
    }
    if (!(r.on && r.g === g)) {
      const P = this.player.u.pos, h = this.player.u.heading || 0;
      r.pos.x = P.x - Math.cos(h) * 1.2; r.pos.z = P.z + Math.sin(h) * 1.2;
    }
    r.on = true; r.g = g; r.m.visible = true;
  }
  updateRunners(dt) {
    for (const r of this.runners || []) {
      if (!r.on) continue;
      const g = r.g;
      if (!g.pending || !g.count) { r.on = false; r.m.visible = false; continue; }
      const c = g.center();
      let dx = c.x - r.pos.x, dz = c.z - r.pos.z;
      const d = Math.hypot(dx, dz);
      // 敵を避けて回り込む（0.3 秒ごとに近くの敵を見る）
      r.scanT = (r.scanT || 0) - dt;
      if (r.scanT <= 0) { r.scanT = 0.3; r.foe = this.army.nearestEnemy({ pos: r.pos, team: 0 }, 11, (o) => !o.fleeing && o.type !== 'dummy'); }
      const f = r.foe && r.foe.alive ? r.foe : null;
      if (f && d > 3) {
        const fx = r.pos.x - f.pos.x, fz = r.pos.z - f.pos.z, fd = Math.hypot(fx, fz) || 1;
        const k = Math.max(0, 11 - fd) / 11 * 1.6;
        dx = dx / d + fx / fd * k; dz = dz / d + fz / fd * k;
        // 間近で斬りかかられると、使番が討たれて号令が届かない
        if (fd < 2.2 && Math.random() < dt * 0.9) { this.runnerDown(r, g); continue; }
      }
      const L = Math.hypot(dx, dz) || 1;
      const sp = Math.min(11, Math.max(3, d / Math.max(0.15, g.pending.t)));
      const st = Math.min(d, sp * dt);
      if (d > 0.01) { r.pos.x += dx / L * st; r.pos.z += dz / L * st; }
      r.m.position.set(r.pos.x, this.world.heightAt(r.pos.x, r.pos.z), r.pos.z);
      // カメラのすぐ前を走る間は消す（視界をふさがない）
      const cam = this.camera.position;
      r.m.visible = Math.hypot(r.pos.x - cam.x, r.pos.z - cam.z) > 6;
      if (d > 0.3) r.m.rotation.y = Math.atan2(dx, dz);
      r.anim += dt * (4 + sp * 1.1);
      const sw = Math.sin(r.anim) * 0.85, U = r.u;
      U.legL.rotation.x = sw; U.legR.rotation.x = -sw;
      if (U.shinL) { U.shinL.rotation.x = Math.max(0, -Math.cos(r.anim)) * 1.1; U.shinR.rotation.x = Math.max(0, Math.cos(r.anim)) * 1.1; }
      U.body.rotation.x = 0.22;
      U.body.position.y = Math.abs(Math.sin(r.anim)) * 0.07;
      poseArms(U, r.anim);
    }
  }
  // 副頭：自分が 20m より離れている間、副頭が生きていれば組の士気をゆっくり支える。討たれると組がざわつく
  updateFuku(dt) {
    if ((this.fukuT = (this.fukuT || 0) - dt) > 0) return;
    this.fukuT = 1;
    for (const g of this.squadGroups) {
      const f = g.fuku;
      if (!f || g.fukuGone) continue;
      if (!f.alive) {
        g.fukuGone = true;
        if (g.count) { g.morale = Math.max(0, g.morale - 8); this.bark(`副頭の${f.name || '古参'}が討たれた！　組がざわつく`, true); }
        continue;
      }
      if (g.count && !g.routed && g.morale < 70 && this.distTo(g.center()) > 20) g.morale = Math.min(70, g.morale + 0.8);
    }
  }
  // 使番が討たれた：号令はその隊へ届かず、隊は前の号令のまま
  runnerDown(r, g) {
    r.on = false; r.m.visible = false; r.foe = null;
    this.army.play('eshout', r.pos, 1);
    if (g.pending) g.pending = null;
    g._gather = false;
    const who = GROUP_NAME[g.kind] || '組';
    this.bark(`使番が討たれた。${who}に号令が届いておらぬ（もう一度命じよ）`, true);
  }
  // 行き先の小旗（戦術マップの旗と同じ白い小旗）と、地面に引く薄い点線の道筋
  buildDestFlag(op = 1) {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(poleGeo(1.9, 0.022), plainMat('pole', 0x2a1d12)));
    const cloth = new THREE.Mesh(clothGeo(0.62, 0.44, 0.04), destFlagMat(op));
    cloth.position.set(0.02, 1.88, 0);
    root.add(cloth);
    if (!STD_CACHE.has('destRingGeo')) { const g0 = new THREE.RingGeometry(0.85, 1.0, 32); g0.rotateX(-Math.PI / 2); STD_CACHE.set('destRingGeo', g0); }
    const ring = new THREE.Mesh(STD_CACHE.get('destRingGeo'), plainMat('destRing' + op, 0xf1e9d6, { basic: true, opacity: 0.55 * op }));
    ring.position.y = 0.14; ring.renderOrder = 2;
    root.add(ring);
    this.scene.add(root);
    if (!STD_CACHE.has('dashGeo')) { const g0 = new THREE.PlaneGeometry(0.22, 0.8); g0.rotateX(-Math.PI / 2); STD_CACHE.set('dashGeo', g0); }
    const route = new THREE.InstancedMesh(STD_CACHE.get('dashGeo'), plainMat('dash', 0xf1e9d6, { basic: true, opacity: 0.55 }), 64);
    route.count = 0; route.frustumCulled = false; route.renderOrder = 2;
    this.scene.add(route);
    return { root, cloth, route, t: 0, op };
  }
  updateDestMarks(dt) {
    const M = this._m4 || (this._m4 = new THREE.Matrix4());
    const wind = this.army.wind || 0.6;
    for (const g of this.squadGroups) {
      // 使番が走っている間の前進も、決めた行き先として見せる（少し薄く）
      const pend = g.pending && g.pending.st.order === 'move' ? g.pending.st : null;
      const dest = pend ? pend.dest : g.order === 'move' ? g.dest : null;
      const show = !!dest && g.count > 0;
      if (!g.destFlag) { if (!show) continue; g.destFlag = this.buildDestFlag(); }
      const F = g.destFlag;
      F.root.visible = show; F.route.visible = show;
      if (!show) continue;
      F.root.position.set(dest.x, this.world.heightAt(dest.x, dest.z), dest.z);
      F.cloth.rotation.y = wind - Math.PI / 2 + Math.sin(this.t * 1.4) * 0.25;
      F.cloth.material = destFlagMat(pend ? 0.6 : 1);
      F.t -= dt;
      if (F.t > 0) continue;
      F.t = 0.1;
      // 着くまでの道筋（隊は真っすぐ進む）
      const c = g.center();
      const dx = dest.x - c.x, dz = dest.z - c.z, L = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      let n = 0;
      for (let s = 2.4; s < L - 1.4 && n < 64; s += 1.7) {
        const x = c.x + dx / L * s, z = c.z + dz / L * s;
        M.makeRotationY(ang); M.setPosition(x, this.world.heightAt(x, z) + 0.13, z);
        F.route.setMatrixAt(n++, M);
      }
      F.route.count = n;
      F.route.instanceMatrix.needsUpdate = true;
    }
  }
  updateArmyAids(dt) {
    const p = this.player;
    // G で号令先を切り替えたら、選んだ隊が「応」と槍を上げ、旗が傾いて返事
    if (this.lastSel !== p.selGroup) {
      if (this.lastSel !== undefined && this.squad.length) {
        this.selFlashT = 4;
        for (const g of p.selectedGroups()) this.replyGroup(g, true);
      }
      this.lastSel = p.selGroup;
    }
    // 使番が着いたら号令が切り替わり、隊が返事をして動き出す
    for (const g of this.squadGroups) {
      if (!g.pending) continue;
      g.pending.t -= dt;
      if (g.pending.t > 0 && g.count) continue;
      const st = g.pending.st;
      g.pending = null;
      if (!g.count) continue;
      applySnap(g, st);
      g.units.forEach((s, k) => { s.aiT = s === g.leader ? 0.1 : 0.2 + Math.min(0.5, k * 0.03) + Math.random() * 0.25; });
      this.replyGroup(g);
    }
    // 「集まれ」で呼び戻した組は、集まり終えたら「ついて来い」に戻す
    for (const g of this.squadGroups) if (g._gather && !g.pending && g.order !== 'retreat') { g._gather = false; if (g.order === 'hold') g.order = 'follow'; }
    this.updateFuku(dt);
    this.updateStandards(dt);
    this.updateRunners(dt);
    this.updateDestMarks(dt);
  }

  rankName() { return RANKS[this.G.rank].name; }
}
