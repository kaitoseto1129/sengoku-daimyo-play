// ======================================================================
// 山崎の戦い　序「備中の本陣と中国大返し」（docs/yamazaki_spec_1109.md。操作できる三〜四分）
//   本能寺の終わり（伝令が西へ）からつなぐ。山崎の布陣からは始めない。
//   幕0 備中高松の羽柴本陣（夜・戦なし）：伝令の馬が駆け込み、急報が官兵衛から秀吉へ。皆すぐは喋らない。秀吉「戻るぞ。」→「第二章 豊臣編」
//   幕1 備中（夜・小雨）：陣を畳む本陣の脇で、遅れた足軽の組をまとめて街道の口へ。遠くに毛利の旗（講和。背の緊張）
//   幕2 姫路（朝）：城下で兵糧を受け取り、新手を連れる。秀吉が騎馬で隊列の横を通る
//   幕3 播磨〜摂津（雨の夜・泥・松明）：合流の地へ急ぐ。明智の物見が道へ出る（小さな妨害だけ）
//   その後、山崎の手前（本筋の①）へ：諸将の旗が増え、走っていた軍が戦う軍勢になる。
//   日数は出さない。場面の変わり目は暗転と短い見出しだけ。山崎の兵（本物）はこの段が済んでから並べる（ctx.deploy）。
// 場所は山崎の地図の南の端（z 120〜170）を使い回し、時刻・雨・置き物で場面を分ける（遊びのための場面転換）。
// ======================================================================
import * as THREE from 'three';
import { allyGroup, enemyGroup } from '../bhelp.js';
import { nobori, tawara, kagaribi, jinmaku, kobune, hut } from '../props.js';
import { ladderStep } from '../state.js';
import { report } from './far.js';
import { wayLitter } from '../gap_scene.js';

// 幕ごとの始まりの所と行き先（heading π＝北向き）
export const SCENE = [null,
  { at: { x: -30, z: 136, heading: Math.PI }, pins: [{ x: -80, z: 156 }, { x: -6, z: 164 }] },
  { at: { x: 66, z: 164, heading: Math.PI }, pins: [{ x: 84, z: 128 }, { x: 40, z: 104 }] },
  { at: { x: -74, z: 150, heading: Math.PI / 2 }, pins: [{ x: 22, z: 136 }] },
];
// K149（kaito 11/9「操作できる中国大返し3〜4分」・11/14 の act bot で約二分）：姫路で兵糧の荷駄を先に通す（野盗が出る）・摂津の先の丘から京の方を見る、を足す
const NIDA = { from: { x: 70, z: 118 }, to: { x: -22, z: 100 } };
const HILL = { foot: { x: -112, z: 128, heading: Math.PI }, top: { x: -148, z: 92 } };
export const TEXT = ['', '備中で遅れた足軽の組をまとめ、街道の口へ急ぐ', '姫路の城下で兵糧を受け取り、荷駄を先に通す', '雨の街道を進み、摂津の合流地点へ急ぐ'];
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
// K364 ①：本陣の幕・水攻めの湖（高松城）・反転する陣の兵と、宗治の舟を見届ける岸
const HON = { x: -34, z: 120 }, LAKE = { x: -112, z: 136 }, SHORE = { x: -70, z: 140 };
const PIN = { x: 0, z: 0, r: 8, hide: 6, always: true, silent: true, enemy: false, unit: null, follow: false, fire: false, gate: false, defend: false, waiting: false, arrived: false, area: false, route: false };

// 置き物（setup で一度だけ）：備中の本陣の篝火・毛利の旗・姫路の兵糧の俵
export function props(rt) {
  const W = rt.world, list = rt.flags.proProps = [];
  const add = (object) => { list.push(object); rt.scene.add(object); };
  try { for (const [x, z] of [[-44, 126], [-24, 126], [-50, 106], [-18, 106]]) add(kagaribi(W, x, z)); } catch (e) { /* 篝火なしでも進む */ }
  // 遠くの毛利の旗（講和したが、まだそこにいる。背の緊張）
  for (const [x, z] of [[-150, 176], [-142, 188], [-156, 164]]) add(nobori(W, x, z, 'mori'));
  try { for (const [x, z, r] of [[88, 124, 0.3], [92, 130, 1.2], [80, 122, 2.1]]) add(tawara(W, x, z, r, 6)); } catch (e) { /* 俵なしでも進む */ }
  // K364 要件書58（大軍を兵だけで見せない）：雨の夜の街道の両脇に、休む荷車・米俵・樽の荷駄の列（絵だけの兵は作らない＝noFake）。幕3だけ見せる
  try {
    const n0 = rt.scene.children.length;
    wayLitter(rt, [[SCENE[3].at.x, SCENE[3].at.z], [-30, 144], [SCENE[3].pins[0].x, SCENE[3].pins[0].z]], { seed: 1582, step: 11, off: 5.6, kinds: ['cart', 'sack', 'barrel', 'sack', 'cart'] });
    const g = rt.scene.children.slice(n0).find((o) => o.name === 'wayLitter');
    if (g) { g.visible = false; rt.flags.proNida = g; list.push(g); }
  } catch (e) { /* 荷駄の絵なしでも進む */ }
  // K364 ①（docs/specs/drama_req_1117.md 5〜8）：本陣の幕（足軽は外から見る）・水に浮かぶ高松城・清水宗治の舟
  try { const m = jinmaku(W, HON.x, HON.z - 2, 18, 12, 6, { mon: 'toyotomi', solid: false }); rt.flags.proMaku = m; add(m); } catch (e) { /* 幕なしでも進む */ }
  try {
    const y = Math.min(...[[-30, -24], [30, -24], [-30, 24], [30, 24], [0, 0]].map(([dx, dz]) => W.heightAt(LAKE.x + dx, LAKE.z + dz))) + 0.5;
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshStandardMaterial({ color: 0x55666a, roughness: 0.18, metalness: 0.1 }));
    water.rotation.x = -Math.PI / 2; water.scale.set(34, 26, 1); water.position.set(LAKE.x, y, LAKE.z); add(water);
    add(hut(W, LAKE.x - 14, LAKE.z - 6, 9, 6, 0.2, { ita: true }));
    for (const [x, z] of [[LAKE.x - 20, LAKE.z - 10], [LAKE.x - 8, LAKE.z - 12]]) add(nobori(W, x, z, 'mori', 5));
    const boat = new THREE.Group();
    boat.add(kobune(0, 0, 0, Math.PI / 2, 7));
    const robe = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.9 });
    const man = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 1.05, 10), robe); body.position.y = 0.52; man.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.8 })); head.position.y = 1.15; man.add(head);
    man.position.set(0.6, 0.15, 0); boat.add(man);
    boat.position.set(LAKE.x + 26, y + 0.05, LAKE.z + 2); boat.visible = false;
    rt.flags.proBoat = boat; rt.flags.proMan = man; add(boat);
  } catch (e) { /* 水なしでも進む */ }
}

// 主人公・自分の組・連れた隊をまとめて場面の始まりへ移す（暗転の間）
function warp(rt, at, groups) {
  const W = rt.world, P = rt.player.u;
  const place = (u, x, z) => { u.pos.set(x, W.heightAt(x, z), z); u.mesh?.position.copy(u.pos); u.moveTo = null; u.target = null; if (u.vel) u.vel.x = u.vel.z = 0; };
  rt.cutT = rt.t;   // 暗転の間の置き直し（audit が「兵が飛んだ」に数えない）
  place(P, at.x, at.z);
  if (at.heading !== undefined) { P.heading = at.heading; rt.player.yaw = at.heading; }
  let k = 0;
  for (const g of [...(rt.squadGroups || []), ...groups]) {
    if (!g) continue;
    let i = 0;
    for (const u of g.units) if (u.alive && !u.gone && u !== P) { place(u, at.x - 4 + (i % 4) * 1.6, at.z + 4 + k * 3 + Math.floor(i / 4) * 1.6); i++; }
    if (g.anchor) { g.anchor.x = at.x; g.anchor.z = at.z + 4 + k * 3; }
    g.dest = null; g.onArrive = null; g.path = null;
    k += Math.ceil(i / 4) + 1;
  }
  try { rt.army.rebuildGrid?.(); } catch (e) { /* 次のコマ */ }
}
function follow(rt, g) {
  if (!g) return;
  const P = rt.player.u.pos;
  g.order = 'move'; g.dest = { x: P.x + 3, z: P.z + 4 }; g.onArrive = null; g.speed = 4.6;
}

// 同じ幕をやり直しても、前の幕の声や兵の追加を持ち越さない。
function after(rt, sec, fn) {
  const F = rt.flags, pro = F.pro, order = F.proOrder;
  rt.after(sec, () => {
    if (rt.flags !== F || F.pro !== pro || F.proOrder !== order || F.stage || F.proWarp || F.ending || rt.over || rt.retryOpen || !rt.player.u.alive) return;
    fn();
  });
}

// 幕0＋幕1：備中の本陣（setup の後に呼ぶ）
// K364 ①（drama_req_1117 5〜8・20）：急報→毛利の使い（恵瓊）→翌朝 宗治の最期（遠景）→陣払いで軍が反転、まで歩いて見る。
//   身分で見え方を変える：足軽大将候補より下は幕の外。急報の中身は聞こえず、静まり返った幕と触れだけ（主人公が知らない事は見せない）。
export function start(rt, ctx, cine = true) {
  const F = rt.flags;
  F.proOrder = (F.proOrder || 0) + 1;
  F.pro = 1; F.oStep = 0; F.proT0 = rt.t; F.holdPlayer = cine; F.proLake = false;
  const inner = F.proInner = ladderStep(rt.G || {}) >= 2;
  rt.world.dayClock = null; rt.world.setTime('night', true);
  if (rt.world.setRainTarget) { rt.world.setRainTarget(0.15); rt.world.rainLevel = 0.15; }
  if (F.proMaku) F.proMaku.visible = true;
  F.proCut = 0;
  for (const g of [F.turnG, F.kei]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
  F.turnG = F.kei = null;
  if (F.proBoat) { F.proBoat.visible = false; F.proMan.rotation.set(0, 0, 0); }
  warp(rt, inner ? { x: HON.x + 3, z: HON.z + 2, heading: Math.PI } : SCENE[1].at, [F.ikeda]);
  // 本陣の人々（秀吉・秀長・官兵衛・蜂須賀・宮部と使番）。動かず、討てない
  F.proHon = allyGroup(rt, { name: '羽柴の本陣', anchor: { ...HON }, facing: 0, width: 8, formation: 'line', fixed: true, noRout: true, fullStrength: true, aggro: 0, seekRange: 0, order: 'hold' },
    ctx.fl([{ type: 'busho', n: 1, o: { name: '羽柴秀吉', invuln: true } }, { type: 'busho', n: 1, o: { name: '羽柴秀長', invuln: true } },
      { type: 'busho', n: 1, o: { name: '黒田官兵衛', invuln: true, flag: ctx.KU } }, { type: 'busho', n: 1, o: { name: '蜂須賀正勝', invuln: true, flag: 'hachisuka' } },
      { type: 'busho', n: 1, o: { name: '宮部継潤', invuln: true } }, { type: 'samurai', n: 4, o: { keep: true } }], ctx.HA));
  for (const u of F.proHon.units) { u.invuln = true; u.noTarget = true; }
  // 毛利の方を向いて並ぶ陣の兵（湖の東の岸。陣払いで一斉に向きを変える）
  F.turnG = allyGroup(rt, { name: '羽柴の陣', anchor: { x: -64, z: 128 }, facing: -Math.PI / 2, width: 12, formation: 'line', fixed: true, noRout: true, fullStrength: true, aggro: 0, seekRange: 0, order: 'hold' },
    ctx.fl([{ type: 'ashigaru', n: 10, o: { keep: true } }, { type: 'gun', n: 3, o: { keep: true } }, { type: 'samurai', n: 1, o: { horse: true, keep: true } }, { type: 'porter', n: 3, o: { keep: true } }], ctx.HA));
  for (const u of F.turnG.units) { u.invuln = true; u.noTarget = true; }
  // 疲れ切った伝令の馬（南の街道から本陣の幕の口へ）
  F.rider = allyGroup(rt, { name: '京よりの伝令', anchor: { x: -14, z: 168 }, facing: 0, width: 2, formation: 'column', noRout: true, fullStrength: true, aggro: 0, seekRange: 0, speed: 5 },
    ctx.fl([{ type: 'samurai', n: 1, o: { name: '伝令', horse: true, invuln: true } }], ctx.HA));
  F.rider.order = 'move'; F.rider.dest = { x: HON.x + 1, z: HON.z + 5 }; F.rider.onArrive = (g) => { g.order = 'hold'; };
  if (!cine) return;
  rt.banner('備中高松　羽柴の本陣', '天正十年六月三日の夜');
  after(rt, 2, () => rt.say('使番', '道を開けよ！　京よりの急ぎの使いじゃ！', 2.8));
  if (inner) {
    after(rt, 6, () => rt.say('伝令', '……京にて、上様ご生害。明智日向守の謀反にござる', 3.6));
    after(rt, 10.5, () => rt.say('羽柴秀吉', '…………', 2.6));
    after(rt, 14, () => rt.say('黒田官兵衛', '毛利との和を今夜のうちに結べば、背は空きまする。日向は京。時がござらぬ', 4));
    after(rt, 18.5, () => rt.say('羽柴秀吉', '戻るぞ。', 2.4));
  } else {
    after(rt, 7, () => rt.say('組頭', '……幕の内が、急に静まり返った', 3));
    after(rt, 11.5, () => rt.say('足軽', '何じゃ。誰も出て来ん', 2.6));
    after(rt, 15, () => rt.say('使番', '触れじゃ！　今宵のことは口外無用。陣は一つも動かすな！', 3.4));
  }
  after(rt, 21, () => rt.banner('第二章　豊臣編', '中国大返し'));
  // 毛利の使い（安国寺恵瓊）が西の岸から幕へ。和を結ばねば帰れない
  after(rt, 23, () => {
    F.holdPlayer = false;
    F.kei = allyGroup(rt, { name: '毛利の使い', anchor: { x: -84, z: 140 }, facing: Math.PI / 2, width: 2, formation: 'column', noRout: true, fullStrength: true, aggro: 0, seekRange: 0, speed: 1.6 },
      ctx.fl([{ type: 'porter', n: 1, o: { name: '安国寺恵瓊', invuln: true, flag: null, hat: 'none', kosode: 1, bozu: 1, kosodeCol: 0x24221f, armor: 0x1e1c1a, lace: 0x2a2826, cloth: 0x24221f, haori: null, mon: null } },
        { type: 'samurai', n: 2, o: { keep: true } }], 'mori'));
    for (const u of F.kei.units) { u.invuln = true; u.noTarget = true; }
    F.kei.order = 'move'; F.kei.dest = { x: HON.x - 2, z: HON.z + 6 }; F.kei.onArrive = (g) => { g.order = 'hold'; };
  });
  if (inner) {
    after(rt, 32, () => rt.say('安国寺恵瓊', '清水長左衛門殿の腹一つで、城の者の命は助けていただけまするな', 3.6));
    after(rt, 36.5, () => rt.say('羽柴秀吉', '約定じゃ。明日、水の上で見届ける。それで毛利とは和じゃ', 3.4));
  } else {
    after(rt, 30, () => rt.say('組の者', '墨染の坊主……毛利の使いの安国寺じゃ', 3));
    after(rt, 34.5, () => rt.say('組頭', '和睦の話か。片が付けば、国へ帰れるのう', 3));
  }
  // 翌朝：暗転して朝に（tick の proCut）。岸から水の上の舟を見届ける
  after(rt, 41, () => { F.proCut = 1.3; rt.scene.visible = false; });
}

// 翌朝の場面（暗転が明けた時）：宗治の最期→陣払い→軍の反転→遅れた組をまとめる（幕1）
function morning(rt, ctx) {
  const F = rt.flags, inner = F.proInner;
  rt.scene.visible = true;
  rt.world.dayClock = null; rt.world.setTime('morning', true);
  if (rt.world.setRainTarget) { rt.world.setRainTarget(0); rt.world.rainLevel = 0; }
  warp(rt, { x: SHORE.x + 14, z: SHORE.z + 2, heading: -Math.PI / 2 }, [F.ikeda]);
  if (F.proBoat) F.proBoat.visible = true;
  F.proLake = true;
  rt.banner('高松の城の水の上', '六月四日の朝');
  rt.obj('main', '岸から、水の上の舟を見届ける', 'main');
  after(rt, 2.5, () => rt.say('使番', '高松の城より舟が出たぞ！', 2.6));
  after(rt, 6, () => rt.say('足軽', '舟の上に……白い衣の侍が一人', 2.8));
  after(rt, 10, () => inner ? rt.say('黒田官兵衛', '城主、清水長左衛門殿。城の者の命と引き換えに、腹を召される', 3.6)
    : rt.say('組頭', '城主の清水様じゃ。城の者の命と引き換えに、腹を召されるそうな', 3.6));
  after(rt, 16, () => { if (F.proMan) F.proMan.rotation.x = 1.35; rt.say('足軽', '…………', 2.4); });
  after(rt, 20, () => rt.say('羽柴秀長', '見届けた。――陣払いじゃ。東へ向け！', 3));
  after(rt, 23, () => {
    F.proLake = false; F.oStep = 1;
    rt.army.play('horagai', { ...HON }, 1.0);
    rt.obj('main', TEXT[1], 'main');
    rt.say('蜂須賀正勝', '陣を畳め！　兵糧を積め！　馬の支度じゃ！', 3);
    if (F.proMaku) F.proMaku.visible = false;   // 陣を畳む
    // 毛利の方を向いていた陣の兵が、一斉に背を向けて東の街道へ（旗・荷駄・馬・鉄砲・槍ごと）
    if (F.turnG) { F.turnG.fixed = false; F.turnG.facing = Math.PI / 2; F.turnG.order = 'move'; F.turnG.dest = { x: 24, z: 156 }; F.turnG.speed = 2.6; F.turnG.onArrive = null; }
    if (F.kei) { F.kei.order = 'move'; F.kei.dest = { x: -96, z: 146 }; F.kei.onArrive = null; }
    // 本陣も動き出す（秀吉は騎馬で先へ。ずっと横にはいない）
    if (F.proHon) { F.proHon.fixed = false; F.proHon.order = 'move'; F.proHon.dest = { x: 10, z: 166 }; F.proHon.speed = 3.2; }
    // 遅れた足軽の組（槍を杖に座り込む）
    F.tired = allyGroup(rt, { name: '遅れた足軽の組', anchor: { ...SCENE[1].pins[0] }, facing: 0.6, width: 6, formation: 'line', aggro: 4, seekRange: 8, morale: 70, noRout: true, order: 'hold' },
      ctx.fl([{ type: 'ashigaru', n: 6, o: { flagScale: 1 } }, { type: 'gun', n: 2 }], ctx.HA));
  });
  after(rt, 28, () => rt.say('足軽', '勝ったのに……祝いの酒も無しか', 2.8));
  after(rt, 33, () => rt.say('足軽', '毛利は……後ろから攻めては来ぬのか？', 3));
  after(rt, 37, () => rt.say('羽柴秀長', '和は結んだ。振り返るな。前だけを見よ', 3));
}

function scene(rt, ctx, n) {
  const F = rt.flags;
  F.proOrder = (F.proOrder || 0) + 1;
  F.pro = n; F.oStep = 1; F.proT0 = rt.t; F.proHillCut = 0;
  // 11/18 クラウド：備中の本陣へ来た京の伝令が、姫路・摂津の場面まで同じ所に一騎で立ち残っていた（act bot 186秒の止まり）。場面が変われば去らせる
  if (n === 2) { for (const g of [F.nida, F.bandit, F.turnG, F.kei, F.rider]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u); F.nida = F.bandit = F.turnG = F.kei = F.rider = null; F.banditGone = false; F.proLake = false; F.proCut = 0; }
  // 11/18 クラウド：摂津の場面へ移っても荷駄が「移る」のまま残っていた（act bot 176・196秒の止まり）。場面が替われば立たせる
  if (n === 3 && F.nida) { F.nida.order = 'hold'; F.nida.onArrive = null; }
  rt.obj('main', TEXT[n], 'main');
  if (n === 2) {
    rt.world.dayClock = null; rt.world.setTime('morning', true);
    if (rt.world.setRainTarget) { rt.world.setRainTarget(0); rt.world.rainLevel = 0; }
    warp(rt, SCENE[2].at, [F.ikeda, F.tired]);
    if (F.proNida) F.proNida.visible = false;
    rt.banner('姫路', '備中から駆け通して、城下で一息つく間もない');
    F.newG = allyGroup(rt, { name: '姫路の新手', anchor: { ...SCENE[2].pins[0] }, facing: Math.PI, width: 8, formation: 'line', aggro: 4, seekRange: 8, morale: 90, noRout: true, order: 'hold' },
      ctx.fl([{ type: 'ashigaru', n: 6, o: { flagScale: 1 } }, { type: 'gun', n: 2 }, { type: 'samurai', n: 2 }], ctx.HA));
    after(rt, 3, () => rt.say('足軽', '足が……もう棒のようじゃ', 2.8));
    // 幕の外にいた者は、ここで初めて京の事を知る（触れが出たのは姫路）
    if (!F.proInner) after(rt, 6, () => rt.say('組の者', '聞いたか。上様が京で討たれたそうな……明智の謀反じゃと', 3.4));
    after(rt, 10, () => rt.say('姫路の侍', '傷の重い者は城に残れ！　旗は組ごとに立て直せ！', 3));
  } else if (n === 3) {
    rt.world.dayClock = null; rt.world.setTime('night', true);
    if (rt.world.setRainTarget) { rt.world.setRainTarget(0.7); rt.world.rainLevel = 0.7; }
    if (rt.world.wetness !== undefined) rt.world.wetness = 1;
    warp(rt, SCENE[3].at, [F.ikeda, F.tired, F.newG]);
    rt.banner('播磨から摂津へ', '雨の夜も、松明を掲げて歩き続ける');
    if (F.proNida) F.proNida.visible = true;
    after(rt, 4, () => rt.say('足軽', 'まだ行くのか……', 2.4));
    after(rt, 7, () => rt.say('使番', '京まで止まらんぞ！　遅れるな！', 2.8));
    after(rt, 11, () => rt.say('足軽', '草鞋が切れた……替えはないか', 2.6));
    after(rt, 16, () => report(rt, '摂津の中川様・高山様、こちらに付くとの返事にござる！'));
    // 行軍は走り通しではない（drama_req 10）：歩きながら食い、水を回し、足を引きずる
    after(rt, 22, () => rt.say('組頭', '握り飯は歩きながら食え。止まる暇は無いぞ', 2.8));
    after(rt, 34, () => rt.say('足軽', '水を回してくれ……喉が焼ける', 2.6));
  }
}

export function tick(rt, dt, ctx) {
  const F = rt.flags, P = rt.player.u.pos;
  if (!rt.player.u.alive || rt.retryOpen) return;
  // 暗転中に討たれても、予約処理で次の地へ移さない。生存中の時間だけ進める。
  if (F.proWarp) {
    F.proWarpT -= dt;
    if (F.proWarpT <= 0) {
      const n = F.proNext;
      F.proWarp = false;
      rt.scene.visible = true;
      if (n <= 3) scene(rt, ctx, n);
      else ctx.toYamazaki();
    }
    return;
  }
  if (F.proCut > 0 && (F.proCut -= dt) <= 0) { F.proCut = 0; morning(rt, ctx); }
  if (F.oStep === 0) return;
  const el = rt.t - F.proT0;
  // 連れた隊は主人公の後ろを歩く（行き先は主人公が動いた時だけ置き直す）
  if ((F.proFT = (F.proFT || 0) - dt) <= 0) {
    F.proFT = 1;
    for (const g of [F.ikeda, F.tired && F.tiredJoin ? F.tired : null, F.newG && F.newJoin ? F.newG : null]) {
      if (!g) continue;
      const c = g.center?.();
      if (c && Math.hypot(c.x - P.x, c.z - P.z) > 9 && (!g.dest || Math.hypot(g.dest.x - P.x, g.dest.z - P.z) > 6)) follow(rt, g);
    }
  }
  if (F.pro === 1) {
    if (F.oStep === 1 && F.tired && near(P, SCENE[1].pins[0], 9)) {
      F.oStep = 2; F.tiredJoin = true;
      rt.say('足軽', '……へい。立ちまする', 2.4);
      after(rt, 3, () => rt.say('羽柴秀長', '遅れる者はおらぬか。街道の口で隊を揃えよ', 3));
    } else if (F.oStep === 2 && near(P, SCENE[1].pins[1], 10)) next(rt, ctx, 2);
  } else if (F.pro === 2) {
    if (F.oStep === 1 && near(P, SCENE[2].pins[0], 9)) {
      F.oStep = 2; F.newJoin = true;
      rt.say('足軽', '握り飯じゃ……ありがたい', 2.4);
      // 秀吉が騎馬で隊列の横を通る（ずっと横にはいない）
      if (F.proHon) {
        rt.cutT = rt.t;   // 本陣の置き直し（audit が「兵が飛んだ」に数えない）
        for (const u of F.proHon.units) if (u.alive) { const x = 96, z = 150 + Math.random() * 6; u.pos.set(x, rt.world.heightAt(x, z), z); u.mesh?.position.copy(u.pos); }
        F.proHon.order = 'move'; F.proHon.dest = { x: 10, z: 96 }; F.proHon.speed = 4.6; F.proHon.onArrive = (g) => { g.order = 'hold'; };   // 11/18 クラウド：着いた後も「移る」のまま立ち、act bot の止まり（171・191秒）に出ていた
      }
      // 城の米と銀を皆に配ったという話は軍記（川角太閤記ほか）の伝え。殿の言葉にせず、兵の噂として聞かせる（drama_req 12：確証の弱い逸話は伝承扱い）
      after(rt, 2, () => rt.say('足軽', '殿が城の米も銀も皆に配られた、と噂じゃ。ほんまかのう', 3.4));
      after(rt, 6, () => rt.say('姫路の侍', '新手の者ども、羽柴様の列に付け！', 2.8));
    } else if (F.oStep === 2 && near(P, SCENE[2].pins[1], 10)) {
      // 兵糧の荷駄を先に通す（荷を積んだ馬と人足の列が城下から西の街道へ。主人公の組が脇を守る）
      F.oStep = 3; F.nidaT0 = rt.t;
      F.nida = allyGroup(rt, { name: '兵糧の荷駄', anchor: { ...NIDA.from }, facing: -Math.PI / 2, width: 3, formation: 'column', aggro: 0, seekRange: 0, morale: 80, noRout: true, fullStrength: true },
        ctx.fl([{ type: 'samurai', n: 2, o: { horse: true, keep: true } }, { type: 'ashigaru', n: 6, o: { keep: true } }], ctx.HA));
      for (const u of F.nida.units) { u.invuln = true; u.noTarget = true; }
      F.nida.order = 'move'; F.nida.dest = { ...NIDA.to }; F.nida.speed = 2.6; F.nida.onArrive = (g) => { g.order = 'hold'; };
      rt.say('姫路の侍', '兵糧の荷駄が先じゃ！　道を空けて脇を守れ！', 2.8);
      after(rt, 5, () => rt.say('羽柴秀長', '米が尽きれば足も止まる。荷駄は一つも失うな', 3));
    } else if (F.oStep === 3) {
      const c = F.nida?.center?.() || NIDA.to;
      // 道の半ばで、乱れに乗じた野盗が荷を狙って出る（小さな妨害だけ）
      // 11/18 cloud-06（中学生の bot：荷駄の脇で30秒、印も敵も無く迷った）：野盗は十二秒で出る（20→12）
      if (!F.bandit && (c.x < 30 || rt.t - F.nidaT0 > 12)) {
        F.bandit = enemyGroup(rt, { name: '荷を狙う野盗', anchor: { x: c.x - 8, z: c.z - 22 }, facing: 0, width: 5, formation: 'line', order: 'attack', aggro: 30, seekRange: 40, morale: 50, dmgMult: 0.3 },
          [{ type: 'ashigaru', n: 4 }, { type: 'samurai', n: 1 }]);
        F.bandit.dest = { x: c.x, z: c.z };
        rt.say('足軽', '野盗じゃ！　荷に手を出させるな！', 2.6);
      }
      if (F.bandit && !F.banditGone && ctx.aliveN(F.bandit) <= 1) {
        F.banditGone = true;
        if (ctx.live(F.bandit)) { F.bandit.routed = true; F.bandit.order = 'flee'; }
        rt.say('姫路の侍', '散ったぞ。荷駄は無事じゃ', 2.4);
      }
      // 11/18 クラウド：荷駄は行き先の四 m 手前で人と馬に押されて「移る」のまま止まった（act bot 181秒）。六 m の内へ来たら着いた事にして立たせる
      if (F.nida && F.nida.order === 'move' && near(c, NIDA.to, 6)) F.nida.order = 'hold';
      const arrived = near(c, NIDA.to, 10) || rt.t - F.nidaT0 > 75;
      if (arrived && F.banditGone && near(P, c, 22)) next(rt, ctx, 3);
    }
  } else if (F.pro === 3) {
    // 明智の物見（小さな妨害だけ）：道の半ばで北の藪から
    if (!F.proScouts && (P.x > -30 || el > 30)) {
      F.proScouts = enemyGroup(rt, { name: '明智の物見', faction: 'akechi', anchor: { x: -6, z: 112 }, facing: 0, width: 6, formation: 'line', order: 'attack', aggro: 30, seekRange: 40, morale: 60, dmgMult: 0.35 },
        ctx.ak([{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'ashigaru', n: 3, o: { flagScale: 1 } }, { type: 'gun', n: 1 }]));
      F.proScouts.dest = { x: P.x, z: P.z };
      rt.say('使番', '桔梗の旗！　明智の物見じゃ、追い散らせ！', 2.8);
    }
    const left = F.proScouts ? ctx.aliveN(F.proScouts) : 9;
    if (F.proScouts && left <= 1 && !F.proScoutsGone) {
      F.proScoutsGone = true;
      if (ctx.live(F.proScouts)) { F.proScouts.routed = true; F.proScouts.order = 'flee'; }
      rt.say('足軽', '追い払うたぞ！', 2);
    }
    // 刻限だけで健在の物見を消して山崎へ進めない。合流地点まで追わせ、実際に退けてから移る。
    if (!F.proScoutsGone && F.proScouts && near(P, SCENE[3].pins[0], 10) && el > 95) {
      const g = F.proScouts;
      if (!(g.order === 'move' && g._tateRe) && (!g.dest || !near(g.dest, P, 6))) {
        g.order = 'move'; g.dest = { x: P.x, z: P.z };
        g.onArrive = (q) => { q.order = 'attack'; };
      }
    }
    // K149（kaito 11/9「操作できる中国大返し3〜4分」）：act bot で大返しが約二分だった。合流地点の手前で、明智の物見の二の組が道を塞ぐ（退けてから山崎へ）
    if (F.proScoutsGone && !F.proScouts2) {
      const q = SCENE[3].pins[0];
      F.proScouts2 = enemyGroup(rt, { name: '明智の物見', faction: 'akechi', anchor: { x: q.x - 6, z: q.z - 10 }, facing: 0, width: 6, formation: 'line', order: 'attack', aggro: 30, seekRange: 40, morale: 85, dmgMult: 0.35 },
        ctx.ak([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8, o: { flagScale: 1 } }, { type: 'gun', n: 2 }]));
      after(rt, 1.5, () => rt.say('使番', '合流の地の手前にも物見が出た！　道を空けさせよ！', 2.8));
    }
    const left2 = F.proScouts2 ? ctx.aliveN(F.proScouts2) : 9;
    if (F.proScouts2 && left2 <= 2 && !F.proScouts2Gone) {
      F.proScouts2Gone = true;
      if (ctx.live(F.proScouts2)) { F.proScouts2.routed = true; F.proScouts2.order = 'flee'; }
      rt.say('羽柴秀長', '道は空いた。急げ、摂津はすぐそこじゃ', 2.6);
    }
    if (F.oStep === 1 && near(P, SCENE[3].pins[0], 10) && F.proScoutsGone && F.proScouts2Gone) {
      // 摂津の先の丘へ（暗転の間に麓へ。雨が上がり、夜が明けかける）
      F.oStep = 2; F.proHillCut = 1.2; rt.scene.visible = false;
    }
    if (F.oStep === 2 && F.proHillCut > 0 && (F.proHillCut -= dt) <= 0) {
      F.proHillCut = 0; rt.scene.visible = true;
      rt.world.dayClock = null; rt.world.setTime('morning', true);
      if (rt.world.setRainTarget) { rt.world.setRainTarget(0.1); rt.world.rainLevel = 0.1; }
      warp(rt, HILL.foot, [F.ikeda, F.tired, F.newG]);
      rt.banner('摂津　尼崎の先', '夜明け。丘の上から京の方を見る');
      after(rt, 3, () => rt.say('使番', '丹羽様・信孝様の備え、後ろに続いておりまする！', 2.8));
      // K355（一統記6巻 VOL.49・自分の言葉）：富田で秀吉は雨の泥に膝をつき、信孝を迎えて泣いた（太閤記の伝え＝C）。
      //   主人公は見ていないので、組の者の聞いた話として一行だけ
      after(rt, 7, () => rt.say('組の者', '富田で殿は、雨の泥に膝をついて信孝様を迎え、泣かれたそうじゃ', 3.4));
    }
    if (F.oStep === 2 && !F.proHillCut && near(P, HILL.top, 9)) {
      F.oStep = 3;
      rt.say('足軽', '……あれが、京の方か', 2.6);
      after(rt, 3, () => rt.say('羽柴秀長', '見よ、後ろにも横にも羽柴の兵じゃ。皆、戻ってきたのだ', 3.4));
      after(rt, 7.5, () => rt.say('羽柴秀吉', '日向は山崎に出る。ここからは戦じゃ。旗を立てよ！', 3.2));
      after(rt, 11.5, () => next(rt, ctx, 4));
    }
  }
}

// 暗転して次の場面へ（4 は山崎の手前＝本筋の①）
function next(rt, ctx, n) {
  const F = rt.flags;
  F.proWarp = true;
  F.proWarpT = 1.6; F.proNext = n;
  rt.scene.visible = false;
}

// 山崎へ移る時：序の隊を片付ける（自分の備だけ残す）
export function clear(rt) {
  const F = rt.flags;
  // 備中・姫路だけの旗と荷物を山崎に残さない。終了時の片付けに含めるため場面には保つ。
  for (const object of F.proProps || []) object.visible = false;
  for (const g of [F.proHon, F.rider, F.tired, F.newG, F.proScouts, F.proScouts2, F.nida, F.bandit, F.turnG, F.kei]) if (g) for (const u of g.units) if (u.alive && !u.gone) rt.army.despawn(u);
  F.proHon = F.rider = F.tired = F.newG = F.proScouts = F.proScouts2 = F.nida = F.bandit = F.turnG = F.kei = null;
  F.proLake = false; F.proCut = 0;
  F.pro = 0;
}

// 途中から続ける時の幕の始まり（battle_checkpoint の resumeSteps）
export function resumeScene(rt, ctx, n) {
  const F = rt.flags;
  F.proWarp = false; F.proWarpT = 0; F.proNext = 0; F.proCut = 0;
  rt.scene.visible = true;
  if (n === 1) { start(rt, ctx); return; }
  if (!F.proHon) start(rt, ctx, false);
  F.holdPlayer = false;
  scene(rt, ctx, n);
}

export function pin(F) {
  if (!F.pro || F.proWarp) return null;
  if (F.pro === 1 && F.proLake) { PIN.x = SHORE.x; PIN.z = SHORE.z; return PIN; }
  const S = SCENE[F.pro];
  if (F.pro === 2 && F.oStep === 3) { const c = F.nida?.center?.() || NIDA.to; PIN.x = c.x; PIN.z = c.z; return PIN; }
  if (F.pro === 3 && F.oStep >= 2) { if (F.proHillCut > 0) return null; PIN.x = HILL.top.x; PIN.z = HILL.top.z; return PIN; }
  const p = F.pro === 1 ? S.pins[F.oStep >= 2 ? 1 : 0] : F.pro === 2 ? S.pins[F.oStep >= 2 ? 1 : 0] : S.pins[0];
  PIN.x = p.x; PIN.z = p.z;
  return PIN;
}
// bot：近い物見を討ち、いなければ行き先へ
export function botTarget(F) { return F.oStep ? pin(F) : null; }
