// 島津家編 12戦目「高原城の戦い」（天正四年（1576）八月　日向国 高原城）。軽い型（light_battle.js）・K647（docs/house_shimazu.md ⑥）
//   史実：島津義久・義弘が、伊東方の高原城を囲み、水の手を断って開城させた。これを境に伊東の崩れが始まる（『上井覚兼日記』A・小林市の解説 C）。城将の名・兵数は推。
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { foe, wave, fightS, holdS, moveS, restS, boss } from './house_steps.js';
import * as THREE from 'three';
import { withCastle } from './light_castle.js';
import { TAKAHARU_PLAN } from './castles/takaharu.js';

const SHIMAZU = { flag: 'shimazu', armor: 0x1c1a1a };
const FOE = { flag: 'ito', armor: 0x2a2a30 };
const SPAWN = { x: 0, z: 70 };

// 11/26 クラウドさ K655：城と霧島が場に無く「どの戦か当てられない」（窓口の目視）。山城（castles/takaharu.js）と、城の奥（西南）に霧島の峰と薄い噴煙を足す。
//   霧島の峰は遠くの山並みの奥の層（world_sky.js の mountainProfile）を一所だけ高くする＝描く回数は増えない。噴煙は板（スプライト）四枚をカメラから峰の向きへ置く。
//   天正のころの霧島の噴火の記録（御鉢・新燃岳）の年は諸説あり、この日の噴煙は推。
const KIRI_A = Math.PI + 0.52, KIRI_W = 0.46;   // 霧島の向き（+z が南の戦の座標で、城の奥の西南）・裾の広さ（角度）
function kirishimaProfile(a, layer) {
  if (layer !== 2) return undefined;
  let d = a - KIRI_A; if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  const t = Math.abs(d) / KIRI_W;
  if (t >= 1) return undefined;
  // 高千穂の峰：裾は長く反り、頂は御鉢の火口で少し平ら。北（左）の肩に韓国岳の低い峰（推）
  const cone = 118 * Math.pow(1 - Math.min(1, Math.max(0, t - 0.03) / 0.97), 2.1);
  const kara = d < 0 ? 64 * Math.max(0, 1 - Math.abs(d + 0.3) / 0.12) ** 1.4 : 0;
  return 52 + Math.max(cone - (t < 0.03 ? 4 : 0), kara);
}
const KIRI_SMOKE = [[0, 176, 16], [7, 196, 26], [16, 218, 36], [27, 238, 46]];   // 峰の頂から立つ噴煙の板：[風下へのずれ, 高さ, 大きさ]（440m 先の値）
function kirishimaSmoke(rt) {
  const M = rt.world?.mountains; if (!M) return;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(214,210,202,0.8)'); gr.addColorStop(0.6, 'rgba(196,192,184,0.32)'); gr.addColorStop(1, 'rgba(186,182,176,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, transparent: true, depthWrite: false, opacity: 0.5 });
  const sx = Math.sin(KIRI_A), sz = Math.cos(KIRI_A), T = new THREE.Vector3();
  // 峰は遠くの山並み（描く遠さ 150m の外・本人の所を中心に動く）。噴煙は描く遠さの内（135m）に、描く時のカメラから峰の頂と同じ向きへ縮めて置く
  //   （止めた時の写真のカメラでも合うよう、毎コマの更新でなく描く直前に置く）
  for (const [dr, h, sc] of KIRI_SMOKE) {
    const s = new THREE.Sprite(mat); s.renderOrder = -1; s.frustumCulled = false; s.name = '霧島の噴煙'; s.userData.noFreeze = true;
    s.onBeforeRender = (r, sc0, cam) => {
      T.set(M.position.x + sx * 440 + dr * sz, h, M.position.z + sz * 440 - dr * sx).sub(cam.position);
      const k = 135 / T.length();
      s.position.copy(cam.position).addScaledVector(T, k); s.scale.setScalar(sc * k); s.updateMatrix(); s.matrixWorld.copy(s.matrix);
    };
    rt.scene.add(s);
  }
}
function scene(rt) { try { kirishimaSmoke(rt); } catch (e) { /* 小道具が無くても戦は続ける */ } }

export const s12_takahara = withCastle(lightBattle({
  id: "s12_takahara",
  date: "天正四年（1576）八月　日向国 高原城",
  intro: "日向の山城、高原城。島津の兵は水の手の沢を押さえ、城を渇かせる。あなたは沢を守る足軽。",
  history: "天正四年（1576）八月、島津義久・義弘は、伊東方の高原城を囲んだ。島津勢は城の水の手を断ち、城兵は水に困って開城した。この城を失った伊東義祐は力を落とし、日向の伊東の崩れが始まった。城将の名・兵数は諸説ある（『上井覚兼日記』A・小林市の解説 C）。",
  sides: { a: { name: "島津義久・義弘の軍", mon: 'shimazu', faction: 'shimazu' }, b: { name: "高原城の伊東方", mon: "ito", faction: "ito" } },
  force: { a: 8000, b: 4000 },
  thick: true, playerTaken: 0.38,   // K652②（11/25）：10分の戦に延ばした（act bot が受けの段で倒れた＝0.45→0.38）＝受けの段に三の手（thickWaves）・長い戦で体が持つよう受ける傷を少し軽く
  allyLook: SHIMAZU, foeLook: FOE,
  allyDmg: 0.38, foeDmg: 0.5, friendsSend: 2, minutes: 5,
  setup: scene,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1576, time: "day", fogFar: 300,
    hills: [[0, -50, 60, 16], [-80, 10, 40, 8], [80, 10, 40, 8]],
    paths: [{ pts: [[0, 150], [0, 70], [-10, 24], [0, -16], [0, -60]], w: 3 }],
    groves: [{ x: -70, z: 40, r: 26, n: 26 }, { x: 70, z: 40, r: 26, n: 26 }],
    trees: 320, tufts: 1300,
    sky: { mountainProfile: kirishimaProfile },
  },
  allies: [
    { name: "島津義弘の旗本", at: { x: SPAWN.x + -8, z: SPAWN.z + 4 }, list: [busho("島津義弘"), uS(4), uA(10)] },
    { name: "鉄砲衆", at: { x: SPAWN.x + 10, z: SPAWN.z + 2 }, list: [uS(1), uG(8)] },
    { name: "槍衆", at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(3), uA(14)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [["島津義弘", "高原城は山の上。攻めれば損が多い。水の手を断つ", 3.6], ["組頭", "沢を押さえよ。城から水を汲みに出る者を一人も通すな", 3.2]] },
    { kind: 'move', at: { x: 0, z: 24 }, label: "水の手の沢", obj: "水の手の沢まで進む", r: 12, max: 90,
      say: [["島津義弘", "沢へ急げ。城の水は、あそこから来る", 3]] },
    { kind: 'hold', at: { x: 0, z: 24 }, label: "水の手の沢", obj: "沢を守り、水を取りに出る城兵を押し返す", r: 16, dur: 55, title: "水の手", sub: "沢を押さえる",
      say: [["組頭", "ここを取られるな。一日で城は渇く", 3]],
      waves: [{ t: 6, say: ["城兵", "水を取れ！　沢へ出ろ！"], foes: [{ name: "水を取りに出る城兵", from: { x: 0, z: 6 }, list: [uS(2), uA(10)] }] }, { t: 24, say: ["城兵", "皆で出るぞ！　押し破れ！"], foes: [{ name: "城兵の大勢", from: { x: -8, z: 2 }, list: [uS(3), uA(12), uG(3)] }] }],
      reward: "水の手の沢を守り抜いた" },
    { kind: 'rest', dur: 8, heal: 0.4, say: [["島津義弘", "城の水が尽きた。門が開く", 3]] },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['組頭', '傷を縛れ。まだ続くぞ', 3]], 0.5),
    fightS({ x: -40, z: 0 }, '城の西の付け城の伊東の兵を破る', '西の付け城', '伊東の付け城が水の手を見張る', [['島津義弘', '付け城を取れば、囲みが閉じる', 3]],
      [foe('付け城の伊東の兵', -46, -14, [uS(2), uA(12)])], { later: [wave(28, '城兵', '付け城を守れ！', [foe('付け城の弓', -60, 0, [uS(1), uB(6)])])], reward: '西の付け城を取った' }),
    holdS({ x: 40, z: 0 }, '東の谷', '東の谷を守り、佐土原から来た伊東の後詰を受ける', '伊東の後詰', '佐土原から後詰が来る', [['組頭', '伊東の後詰じゃ！　谷で止めよ！', 3]],
      [wave(0, '伊東の侍', '高原を助けよ！', [foe('伊東の後詰', 70, 30, [uS(2), uA(12)])]), wave(24, '伊東の侍', '横から回れ！', [foe('伊東の後詰の二', 76, -10, [uS(2), uA(10)])])], { reward: '伊東の後詰を退けた' }),
    fightS({ x: 0, z: -20 }, '城の麓の柵を破る', '麓の柵', '柵の内に城兵', [['島津義弘', '後詰は来ぬ。柵を破れ', 3]],
      [foe('麓の柵の兵', 0, -32, [uS(2), uA(12)])], { later: [wave(26, '城兵', '柵を守れ！', [foe('麓の柵の鉄砲', 16, -36, [uS(1), uG(4)])])], reward: '麓の柵を破った' }),
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'hold', at: { x: -16, z: 20 }, label: '水の手の沢で', obj: '水の手の沢で、水を取りに出る城兵を受け止める', r: 16, dur: 32,
      say: [['見張り', '水を取りに出て来る！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '水を取りに出る城兵', from: { x: -4, z: 8 }, list: [uS(3), uA(9)] }] },
        { t: 16, foes: [{ name: '水を取りに出る城兵', from: { x: -30, z: 34 }, list: [uS(2), uA(7)] }] }],
      reward: '水の手の沢を守った' },
    { kind: 'fight', at: { x: 14, z: -8 }, obj: '二の曲輪の堀で、渇いて打って出る城の兵を破る', max: 100, limit: 90,
      say: [['組頭', '渇いて死に物狂いじゃ。構えよ', 3.2]],
      foes: [{ name: '渇いた城兵', from: { x: 26, z: -20 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '二の曲輪の堀で城兵を破った' },
    { kind: 'fight', at: { x: -10, z: -50 }, obj: '本丸の門で、伊東の旗本を討つ', max: 100, limit: 90,
      say: [['組頭', '旗本を崩せ。城は落ちる', 3.2]],
      foes: [{ name: '伊東の旗本', from: { x: 2, z: -62 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '本丸の門を破った' },
    { kind: 'fight', at: { x: 0, z: -56 }, obj: "城門を破り、渇いた城兵を破る", title: "高原城", sub: "城門", max: 130,
      say: [["城兵", "もう水が無い……それでも退くな！", 3]],
      foes: [{ name: "城門の兵", from: { x: 0, z: -68 }, list: [busho('福永丹波', { horse: false }), uS(3), uA(10)] }],
      reward: "高原城の門を破った" },
    // K652②（11/25 kaito「全部の戦を10分ぐらいに。15分楽しめる質」）：段を足す（史実の流れ・house_steps.js）
    restS([['組頭', '高原は落ちた。三ツ山の城の伊東の兵も、まだ戦う気じゃ', 3.2]]),
    fightS({ x: 60, z: -60 }, '三ツ山の城の伊東の兵を払う', '三ツ山', '近くの城の伊東の兵', [['島津義弘', '一つ落ちれば、ほかも続く。押せ', 3]],
      [foe('三ツ山の伊東の兵', 70, -74, [uS(2), uA(12)])], { later: [wave(28, '伊東の侍', '城を守れ！', [foe('三ツ山の弓', 50, -84, [uS(1), uB(6)])])], reward: '三ツ山の城の兵を払った' }),
  ],
  win: {
    banner: "高原城 開く", sub: "水を断って、山城を落とした", award: "水の手を断って高原城を落とした",
    say: [["島津義弘", "伊東の崩れが始まる。日向が動くぞ", 3.2]],
  },
}), { plan: TAKAHARU_PLAN, at: { x: 0, z: -50 }, lift: 10, team: 1, life: false });
export default s12_takahara;
