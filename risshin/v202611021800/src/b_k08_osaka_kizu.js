// ======================================================================
// 徳川編 8. 大坂冬の陣・木津川口の戦い（慶長十九年十一月十九日の夜・1614）
// docs/chapter3_tokugawa.md の8を正とする。大坂城を囲む徳川の大軍のうち、蜂須賀至鎮・浅野長晟の手が
// 大坂湾に近い木津川口の豊臣方の砦を夜に襲って奪い、外郭の砦群が縮んで包囲が完成していく。
// 主人公は蜂須賀勢の侍大将。大坂城は遠くに巨大に見えるだけで、天守の前で戦う戦ではない。
// 段：①夜の堤を砦の前へ ②前の鉄砲組を払い、砦の門を破る ③砦の内へ入り守将を討つ ④大坂方の援兵を退けて砦を守り抜く
// 負け：夜明け（8分）までに落とせない・前で支える蜂須賀勢と浅野勢がともに崩れる。
// 地形：大坂の低い平野と木津川の河口を手で復元（標高の表は使わない＝平らな低地。川筋・砦の置き場は推定）。
// 座標：南が +z（徳川勢）、北が −z（砦の奥と大坂）、東が +x（木津川・大坂城の方）、西が −x（大坂湾の湿地）。
// 重さ：本物の兵は段ごとに出し、同時に百ほどまで。大軍は軽い作り（addDistantArmy・addClash）。
// ======================================================================
import * as THREE from 'three';
import { enemyGroup, allyGroup, centerOf, nm, wallLine } from './bhelp.js';
import { flagTexture } from './textures.js';
import { KIT } from './b_nagashinojo.js';
import { nobori, palisade, yagura, kabukimon, kagaribi, kobune } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { farSight } from './far_sight.js';
import { setStages } from './b_k_help.js';

const TOKUGAWA = { flag: 'tokugawa', armor: 0x24221f };
const TOYOTOMI = { flag: 'toyotomi', armor: 0x2c2a26 };

// 置き場（x=東+、z=南+）
const FORT = { x: 0, z: -34 };                 // 砦の中ほど
const GATE = { x: 0, z: -10 };                 // 南の大手の門
const WALL_X = 24, WALL_N = -58;               // 砦の東西の壁・北の壁
const SPAWN = { x: -4, z: 150 };
const APPROACH = { x: 0, z: 40 };              // 砦の前の堤の上
const INSIDE = { x: 0, z: -26 };
const KIZU = [[56, -230], [52, -90], [48, 40], [52, 220]];   // 木津川（東の縁）
const OSAKA = { x: 260, z: -260 };             // 大坂城の方角（遠く）
const TIME_LIMIT = 480;

const alive = (g) => g && !g.routed && g.count > 0;
const broken = (g) => !g || g.routed || g.units.filter((u) => u.alive).length < 3;
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
// 味方の隊は持ち場（anchor）を移すだけ。兵は歩いて付いてくる（名のある武将の隊は order の move で動かない）
const hold = (g, x, z) => { if (!g || g.routed) return; g.anchor.x = x; g.anchor.z = z; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null; };
const gauss =(x, z, cx, cz, s) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / s);

// 低い平野。砦は少し盛り上がった土の上。川の堤と西の湿地だけ起伏を付ける
function height(x, z) {
  let h = 0.25 * Math.sin(x * 0.05 + 0.7) * Math.cos(z * 0.04);
  h += 1.5 * gauss(x, z, FORT.x, FORT.z - 4, 2600);
  h += 0.9 * Math.exp(-(((x - 30) / 6) ** 2));            // 川の堤
  h -= 0.7 * Math.max(0, Math.min(1, (-x - 90) / 60));    // 西の湿地は低い
  return h;
}

const dressOf = (side, name, extra = {}) => ({ name, flag: side.flag, armor: side.armor, ...extra });
const gn = (side, n, type = 'ashigaru') => ({ type, n, o: { flag: side.flag, armor: side.armor } });

function farHost(rt, x, z, w, d, count, facing, side, seed) {
  return rt.world.addDistantArmy({ x, z, w, d, count, facing, team: side === TOYOTOMI ? 1 : 0, armor: side.armor,
    flagTex: flagTexture(side.flag), mon: side.flag, kind: 'mixed', flagRate: 0.35, seed, host: false });
}

const k08_osaka_kizu = {
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  prelude: 12,
  noReserve: true, noWake: true, noTaishoRaid: true,
  sides: { a: { name: '徳川勢', mon: 'tokugawa', faction: 'oda' }, b: { name: '豊臣勢', mon: 'toyotomi', faction: 'oda' } },
  taisho: { a: { name: '徳川家康', def: true }, b: { name: '豊臣秀頼', def: true } },
  date: () => '慶長十九年（1614）十一月十九日　夜　摂津国 木津川口',
  history: '慶長十九年（1614）十月、徳川家康は大坂城に集まった浪人たちを討つため二十万ほどの大軍で大坂を囲んだ。豊臣方は秀頼のもと、真田信繁・毛利勝永・後藤又兵衛・木村重成・長宗我部盛親ら浪人衆と大野治長らを中心に籠城の備えを固め、城の外には木津川口・野田・福島・鴫野・今福などの砦を置いて外郭とした。\n十一月十九日の夜、蜂須賀至鎮・浅野長晟の手が大坂湾に近い木津川口の砦を襲い、これを奪った。砦の守りの主力は不在だったと伝わる。続いて、ほかの外郭の砦も次々に縮められ、徳川方の包囲が整った。\n大坂城は天守の前で戦う城ではなく、外郭の砦群・堀・川を含めた巨大な構えだった。この戦はその外郭の一角が破られた夜の話である。\n両軍の人数・守将・砦の縄張りは遊びのための推定と復元である。',
  force(rt) {
    const F = rt.flags;
    const k = [0, 0.1, 0.3, 0.7, 0.9][F.step || 0] || 0;
    return { a: 30000 - (F.ak || 0) * 30, a0: 30000, b: Math.round(10000 * (1 - k)) - (F.ek || 0) * 30, b0: 10000 };
  },
  world: {
    seed: 1614,
    time: 'dusk',
    muddy: 0.35,
    height,
    waterSlow: true,
    streams: [{ pts: KIZU, w: 30, depth: 2.6 }, { pts: [[-220, 60], [-70, 54], [0, 50], [48, 40]], w: 16, depth: 0.7 }],   // 砦の前を横切る入り江（膝までの浅瀬を渡って寄せる）
    paths: [[[SPAWN.x, SPAWN.z], [-2, 100], [0, 60], [0, 40], [GATE.x, GATE.z + 4]]],
    tint(x, z, h, c) {
      // 低い田と葦の湿地。西ほど濡れた暗い緑、砦の土は褐色
      const w = Math.max(0, Math.min(1, (-x - 60) / 120));
      c.setRGB(c.r * (1 - 0.3 * w), c.g * (1 - 0.2 * w), c.b * (1 - 0.3 * w));
      const d = Math.hypot(x - FORT.x, (z - FORT.z) * 0.8);
      if (d < 36) { const k = 1 - d / 36; c.setRGB(c.r * (1 - 0.5 * k) + 0.2 * k, c.g * (1 - 0.5 * k) + 0.15 * k, c.b * (1 - 0.5 * k) + 0.08 * k); }
      c.multiplyScalar(0.84 + 0.2 * (0.5 + 0.5 * Math.sin(x * 0.06 + 1.1) * Math.cos(z * 0.05)));
    },
    clear: (x, z) => Math.abs(x - FORT.x) < 34 && z > -70 && z < 170,
    trees: 90,
    tufts: 2400,
    treeDensity: (x, z) => (Math.abs(x) > 90 || z < -90 ? 0.8 : 0.2),
    fleeOut: (x, z, team) => (team === 1 ? z < -150 || x > 100 : z > 190),
  },

  setup(rt) {
    const F = rt.flags, W = rt.world;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false;
    if (rt.player.canRide && rt.player.mounted) rt.player.toggleMount();
    const faceN = Math.PI;

    // ---- 砦：柵の囲み・大手の門・櫓・篝火 ----
    const fort0 = rt.scene.children.length;
    wallLine(rt, [[-WALL_X, GATE.z], [-3.4, GATE.z]], { team: 1, hp: 1e9, name: '砦の柵', segLen: 6 });
    wallLine(rt, [[3.4, GATE.z], [WALL_X, GATE.z]], { team: 1, hp: 1e9, name: '砦の柵', segLen: 6 });
    wallLine(rt, [[-WALL_X, GATE.z], [-WALL_X, WALL_N]], { team: 1, hp: 1e9, name: '砦の柵', segLen: 6 });
    wallLine(rt, [[WALL_X, GATE.z], [WALL_X, WALL_N]], { team: 1, hp: 1e9, name: '砦の柵', segLen: 6 });
    wallLine(rt, [[-WALL_X, WALL_N], [WALL_X, WALL_N]], { team: 1, hp: 1e9, name: '砦の柵', segLen: 6 });
    rt.scene.add(kabukimon(W, GATE.x, GATE.z + 1.5, 7, 0));
    F.gate = rt.army.addStruct({ seg: [-3.4, GATE.z, 3.4, GATE.z], nx: 0, nz: 1, hp: 240, maxHp: 240, team: 1, name: '砦の大手門' });
    F.gateMesh = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.6, 0.35), new THREE.MeshLambertMaterial({ color: 0x4a3626 }));
    F.gateMesh.position.set(GATE.x, W.heightAt(GATE.x, GATE.z) + 1.8, GATE.z + 0.2);
    F.gateMesh.castShadow = true; rt.scene.add(F.gateMesh);
    F.gate.mesh = F.gateMesh;
    for (const [x, z] of [[-18, GATE.z - 3], [18, GATE.z - 3], [-18, WALL_N + 4], [18, WALL_N + 4]]) rt.scene.add(yagura(W, x, z, { mon: 'toyotomi', team: 1 }));
    for (const [x, z] of [[-9, GATE.z + 4], [9, GATE.z + 4], [-14, -30], [14, -30], [0, -46]]) { try { rt.scene.add(kagaribi(W, x, z)); } catch (e) { console.warn(e); } }
    for (const [x, z] of [[-12, -16], [12, -16], [-14, -48], [14, -48]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 7));
    KIT.honjin(rt, FORT.x, FORT.z - 12, { mon: 'toyotomi', people: false, fire: false, yoroi: false });
    // 木津川の岸に寄せた舟（蜂須賀の手が川から寄せた舟と、砦の舟入りの舟。同じ形を使い回す）
    // 入り江を渡る道の両脇にも舟を寄せる（持ち場から歩き出してすぐ、舟と水が目に入る）
    for (const [x, z, rot] of [[-30, 53, 1.5], [-64, 55, 1.62], [58, 74, 0.12], [60, 2, 0.1], [62, -46, -0.04], [-13, 51, 1.56], [12, 49, 1.6]]) {
      try { rt.scene.add(kobune(x, W.heightAt(x, z) + W.waterDepthAt(x, z) + 0.05, z, rot, 7)); } catch (e) { console.warn(e); }
    }
    // 砦と舟は平野の霧に沈めない（堤の上から砦の柵・櫓・門が見える）
    farSight(rt.scene.children.slice(fort0), { W, ground: { x: FORT.x, z: FORT.z, r: 48 } });

    // ---- 徳川方の陣：南に家康・秀忠の本陣の旗、遠くに大軍 ----
    for (const [x, z] of [[-14, SPAWN.z + 12], [0, SPAWN.z + 14], [14, SPAWN.z + 12]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 7));
    KIT.honjin(rt, 0, SPAWN.z + 24, { mon: 'tokugawa', people: false, fire: false, yoroi: false });
    F.hostS = farHost(rt, -20, 215, 90, 22, 380, faceN, TOKUGAWA, 1614);
    F.hostW = farHost(rt, -110, 80, 40, 40, 220, faceN, TOKUGAWA, 1615);
    // 東の川向こう：大坂へ続く豊臣の大軍と、はるか大坂城の方角
    F.hostE = farHost(rt, 130, -80, 60, 28, 300, Math.PI / 2, TOYOTOMI, 1616);
    F.hostN = farHost(rt, 90, -190, 70, 24, 360, Math.PI, TOYOTOMI, 1617);
    F.hostC = farHost(rt, OSAKA.x - 90, OSAKA.z + 60, 80, 30, 420, Math.PI, TOYOTOMI, 1618);
    // 大坂城の遠い大構え：長い塀の列と櫓（天守の前の戦にはしない）
    try {
      rt.scene.add(palisade(W, [OSAKA.x - 150, OSAKA.z + 4, OSAKA.x + 150, OSAKA.z + 4], { h: 5 }));
      for (const dx of [-140, -70, 0, 70, 140]) rt.scene.add(yagura(W, OSAKA.x + dx, OSAKA.z - 2, { mon: 'toyotomi', team: 1 }));
    } catch (e) { console.warn(e); }

    // ---- 味方：蜂須賀勢（主人公の付く手）と浅野勢 ----
    F.hachi = allyGroup(rt, { name: '蜂須賀至鎮の隊', anchor: { x: SPAWN.x - 8, z: SPAWN.z - 36 }, facing: faceN, width: 8, aggro: 12, morale: 95, noRout: true, fullStrength: true },
      [{ type: 'busho', n: 1, o: dressOf(TOKUGAWA, '蜂須賀至鎮', { invuln: true, horse: false }) }, { type: 'samurai', n: 3, o: { flag: TOKUGAWA.flag } },
        { type: 'ashigaru', n: 14, o: { flag: TOKUGAWA.flag } }, { type: 'gun', n: 4, o: { flag: TOKUGAWA.flag } }]);
    F.asano = allyGroup(rt, { name: '浅野長晟の隊', anchor: { x: SPAWN.x + 16, z: SPAWN.z - 32 }, facing: faceN, width: 8, aggro: 12, morale: 95, noRout: true, fullStrength: true },
      [{ type: 'busho', n: 1, o: dressOf(TOKUGAWA, '浅野長晟', { invuln: true, horse: false }) }, { type: 'samurai', n: 3, o: { flag: TOKUGAWA.flag } },
        { type: 'ashigaru', n: 14, o: { flag: TOKUGAWA.flag } }, { type: 'bow', n: 3, o: { flag: TOKUGAWA.flag } }]);
    F.allies = [F.hachi, F.asano];
    // 入り江を左右で渡って砦へ寄せる蜂須賀・浅野の後の手（軽い作り。本人と並んで歩く）
    F.wade = [farHost(rt, -40, 84, 30, 10, 150, faceN, TOKUGAWA, 1619), farHost(rt, 20, 84, 18, 10, 110, faceN, TOKUGAWA, 1620)];
    for (const h of F.wade) if (h && h.advance) h.advance(56, 44);
    F.base = allyGroup(rt, { name: '徳川の本陣', anchor: { x: 0, z: SPAWN.z + 20 }, facing: faceN, width: 6, aggro: 0, fixed: true, noAI: true, noRout: true, order: 'hold' },
      [{ type: 'busho', n: 1, o: dressOf(TOKUGAWA, '徳川家康', { invuln: true, horse: false }) }, { type: 'busho', n: 1, o: dressOf(TOKUGAWA, '藤堂高虎', { invuln: true, horse: false }) },
        { type: 'samurai', n: 4, o: { flag: TOKUGAWA.flag } }]);
    F.base.noFrontline = true;
    const sq = Math.min(12, RANKS[rt.G.rank || 0]?.squad || 0);
    if (sq) rt.makeSquad({ x: SPAWN.x - 2, z: SPAWN.z - 3 }, faceN, [{ kind: 'spear', n: sq }]);
    // 蜂須賀・浅野の手は始めから堤を詰める（本人一人が先に野原へ出ない）
    for (const g of F.allies) hold(g, APPROACH.x + (g === F.asano ? 14 : -10), APPROACH.z + 12);

    // ---- 豊臣方：砦の守り（出る前から柵の内に居る）と、遠くから見ている信繁 ----
    const foe = (name, at, list, o = {}) => enemyGroup(rt, { fixed: true, name, faction: 'oda', flag: TOYOTOMI.flag, armor: TOYOTOMI.armor, anchor: at, facing: Math.PI / 1, order: 'hold', aggro: 10, width: 6, ...o }, list);
    F.front = foe('砦の前の鉄砲組', { x: -6, z: GATE.z + 18 }, [{ type: 'gun', n: 4, o: { flag: TOYOTOMI.flag, armor: TOYOTOMI.armor } }, gn(TOYOTOMI, 5)], { aggro: 14 });
    F.wallG = foe('柵の守り', { x: 8, z: GATE.z - 6 }, [{ type: 'bow', n: 4, o: { flag: TOYOTOMI.flag, armor: TOYOTOMI.armor } }, { type: 'gun', n: 3, o: { flag: TOYOTOMI.flag, armor: TOYOTOMI.armor } }, gn(TOYOTOMI, 4)], { aggro: 12 });
    F.garrison = foe('砦の守兵', { x: 0, z: -32 }, [{ type: 'busho', n: 1, o: dressOf(TOYOTOMI, '砦の守将', { horse: false }) }, { type: 'samurai', n: 3, o: { flag: TOYOTOMI.flag, armor: TOYOTOMI.armor } },
      gn(TOYOTOMI, 11), { type: 'gun', n: 3, o: { flag: TOYOTOMI.flag, armor: TOYOTOMI.armor } }], { aggro: 9 });
    for (const g of [F.wallG, F.garrison]) g.noFrontline = true;
    F.foes = [F.front, F.wallG, F.garrison];
    for (const g of F.foes) g.dmgMult = 0.5;
    for (const g of F.allies) g.defMult = 1.2;
    // はるか東の堤の上から見る真田信繁（動かない。名だけ頭上に出る）
    F.yuki = foe('真田信繁の物見', { x: 120, z: -150 }, [{ type: 'busho', n: 1, o: dressOf(TOYOTOMI, '真田信繁', { invuln: true, horse: false }) }, gn(TOYOTOMI, 2)], { aggro: 0, noAI: true, noRout: true });
    F.yuki.noFrontline = true;

    // 戦の前の会話（家康の本陣と、大坂城の中）
    rt.setPhase('brief');
    rt.after(0.5, () => rt.say('徳川家康', '大坂は広い。城だけを見るな、外の砦から一つずつ縮めよ', 4.5));
    rt.after(5.2, () => rt.say('藤堂高虎', '西の木津川口に砦がある。ここを取れば、海からの道も絶てる', 4));
    rt.after(9.4, () => rt.say('蜂須賀至鎮', '夜のうちに襲う。浅野殿と並んで堤を詰める。続け', 3.8));
    rt.after(13.4, () => rt.say(nm(rt), '承知。先に立ちます', 2.8));
    rt.after(15.2, () => rt.say('大野治長', '木津川口が危うい。援兵を出せ。城から目を離すな', 3.8));
    rt.after(19.2, () => rt.say('真田信繁', '外の砦は捨て石になろう。城の南でこそ、徳川を迎え撃つ', 4));
    rt.after(19.6, () => this.stage1(rt));
  },

  // ① 夜の堤を砦の前へ
  stage1(rt) {
    const F = rt.flags;
    F.step = 1; F.t0 = rt.t;
    rt.setPhase('assault');
    rt.obj('main', '夜の堤を砦の前へ進め', 'main');
    rt.marker('k08', APPROACH, '砦の前', { h: 3 });
    for (const g of F.allies) hold(g, APPROACH.x + (g === F.asano ? 14 : -10), APPROACH.z + 6);
  },
  // ② 前の鉄砲組を払い、砦の門を破る
  stage2(rt) {
    const F = rt.flags;
    F.step = 2;
    rt.award((t) => t.side.push('夜の堤を砦の前へ詰めた'), '夜の堤を砦の前へ詰めた');
    rt.unmark('k08');
    rt.obj('main', '砦の前の鉄砲組を払い、大手の門を破れ', 'main');
    rt.marker('k08', { x: GATE.x, z: GATE.z + 4 }, '砦の大手門', { h: 3, red: true });
    for (const g of F.allies) { hold(g, GATE.x + (g === F.asano ? 8 : -8), GATE.z + 12); g.aggro = 22; }
    F.front.order = 'attack'; F.front.aggro = 18;
    rt.say('浅野長晟', '前の鉄砲組を払え。門に取り付くぞ', 3.5);
    rt.after(4, () => { if (F.step === 2) rt.say('砦の守将', '夜襲じゃ！　柵の内へ引け、撃て撃て', 3); });
  },
  // ③ 砦の内へ入り守将を討つ
  stage3(rt) {
    const F = rt.flags;
    F.step = 3;
    rt.award((t) => t.side.push('砦の大手門を破った'), '砦の大手門を破った');
    rt.unmark('k08');
    rt.obj('main', '砦の内へ。守将を討て', 'main');
    // 門の脇の柵も押し倒して、味方が詰まらず流れ込む
    for (const s of rt.army.structs || []) {
      if (s.team === 1 && s.seg && s.seg[1] === GATE.z && s.seg[3] === GATE.z && Math.hypot((s.seg[0] + s.seg[2]) / 2, 0) < 12) { s.hp = 0; s.alive = false; if (s.mesh) s.mesh.visible = false; }
    }
    for (const g of F.allies) { hold(g, INSIDE.x + (g === F.asano ? 8 : -8), INSIDE.z); g.aggro = 22; }
    F.garrison.order = 'attack'; F.garrison.aggro = 16; F.wallG.order = 'attack';
    F.gN = F.garrison.count;
    rt.marker('k08', () => (F.garrison.leader?.alive ? F.garrison.leader.pos : INSIDE), '砦の守将', { red: true, group: F.garrison });
    rt.say('蜂須賀至鎮', '門が開いた！　一気に内へ。守将を討て', 3.5);
  },
  // ④ 大坂方の援兵を退けて砦を守り抜く
  stage4(rt) {
    const F = rt.flags;
    F.step = 4; F.t4 = rt.t;
    rt.award((t) => t.side.push('木津川口の砦に入り、守将を討った'), '砦の守将を討った');
    rt.unmark('k08');
    rt.obj('main', '大坂方の援兵を退け、砦を守り抜け', 'main');
    rt.banner('木津川口の砦、落ちる', '大坂方の援兵が川を渡って来る');
    for (const g of F.foes) if (alive(g) && g !== F.yuki) { g.routed = true; g.order = 'flee'; }
    F.clashH = null;
    // 毛利勝永が率いる援兵が北東から押し寄せる
    F.relief = [
      enemyGroup(rt, { name: '毛利勝永の援兵', faction: 'oda', flag: TOYOTOMI.flag, armor: TOYOTOMI.armor, anchor: { x: 40, z: -90 }, facing: 0, order: 'attack', aggro: 40, seekRange: 90, width: 10, morale: 85 },
        [{ type: 'busho', n: 1, o: dressOf(TOYOTOMI, '毛利勝永', { horse: false }) }, { type: 'samurai', n: 3, o: { flag: TOYOTOMI.flag, armor: TOYOTOMI.armor } },
          { type: 'gun', n: 6, o: { flag: TOYOTOMI.flag, armor: TOYOTOMI.armor } }, gn(TOYOTOMI, 12)]),
      enemyGroup(rt, { name: '大坂方の槍組', faction: 'oda', flag: TOYOTOMI.flag, armor: TOYOTOMI.armor, anchor: { x: -20, z: -100 }, facing: 0, order: 'attack', aggro: 40, seekRange: 90, width: 10 },
        [{ type: 'samurai', n: 2, o: { flag: TOYOTOMI.flag, armor: TOYOTOMI.armor } }, gn(TOYOTOMI, 14)]),
    ];
    F.rN = F.relief.reduce((s, g) => s + g.count, 0);
    for (const g of F.relief) { g.order = 'move'; g.dest = { x: FORT.x, z: FORT.z - 14 }; g.onArrive = (q) => { q.order = 'attack'; q.aggro = 40; }; }
    for (const g of F.allies) { hold(g, INSIDE.x + (g === F.asano ? 10 : -10), INSIDE.z - 12); g.aggro = 22; }
    rt.marker('k08', () => centerOf(F.relief.find(alive))?.() || null, '大坂方の援兵', { red: true, group: F.relief[0] });
    rt.say('毛利勝永', '木津川口を取り返せ！　砦に入られては城の西が裸になる', 3.5);
    rt.after(4, () => rt.say('蜂須賀至鎮', '柵を背に迎えよ。援兵さえ退ければ、この砦は我らのもの', 3.5));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objDone('main'); rt.unmark('k08');
    rt.award((t) => { t.main = true; t.special = { label: '木津川口の砦を奪い、外郭を縮めた', pts: 20 }; }, '木津川口の砦を守り抜いた');
    rt.banner('木津川口の戦い　勝ち', '豊臣の前線が縮み、包囲が整った');
    rt.player.u.invuln = true;
    for (const g of F.relief || []) if (alive(g)) { g.routed = true; g.order = 'flee'; }
    rt.say('徳川家康', '砦は一つ縮んだ。大坂はまだ堅い。急ぐな', 3.5);
    rt.after(4, () => rt.say('藤堂高虎', '西の海からの道は絶えました。城はほぼ囲まれましたぞ', 3.5));
    rt.after(8, () => rt.say('真田信繁', '外の砦は捨てた。これでよい。次は城の南で待つ', 3.5));
    rt.finish({ scriptedEnd: true }, 13);
  },
  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.objFail('main'); rt.tracker.main = false; rt.unmark('k08');
    rt.player.u.invuln = true;
    rt.finish({ scriptedEnd: true, failureReason: why }, 7);
  },

  onStructDestroyed(rt, s) {
    if (s === rt.flags.gate) { sfx('wood', 0.8); rt.bark('大手門が破れた'); }
  },
  onKill(rt, v) { const F = rt.flags; if (v.team === 1) F.ek++; else F.ak++; },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending || !F.step) return;
    const P = rt.player.u.pos;
    // 後から出る豊臣方の組（援兵・前備えの後詰め）も、砦の守りと同じ軽い傷にそろえる（夜襲の一人が数突きで倒れない）
    if (!(F.lightT > rt.t)) { F.lightT = rt.t + 1; for (const g of rt.army.groups) if (g.team === 1 && !(g.dmgMult <= 0.5)) g.dmgMult = 0.5; }
    if (rt.t - F.t0 > TIME_LIMIT) { this.lose(rt, '夜が明け、砦を落とせなかった'); return; }
    if (broken(F.hachi) && broken(F.asano)) { this.lose(rt, '蜂須賀勢と浅野勢がともに崩れた'); return; }
    if (F.step === 1) {
      if (near(P, APPROACH, 16)) this.stage2(rt);
    } else if (F.step === 2) {
      const st = F.gate;
      if (!st || !st.alive || st.hp <= 0) { this.stage3(rt); return; }
      // 寄せた味方が門を打つ（門の前に味方が多いほど早い）
      let n = 0;
      for (const g of F.allies) for (const u of g.units) if (u.alive && Math.hypot(u.pos.x - GATE.x, u.pos.z - GATE.z) < 30) n++;
      if (alive(F.front) && F.front.count > 3) n = Math.floor(n / 2);
      if (n) { st.hp -= dt * 1.5 * Math.min(n, 12); if (st.hp <= 0) { st.hp = 0; st.alive = false; if (st.mesh) st.mesh.visible = false; this.onStructDestroyed(rt, st); } }
    } else if (F.step === 3) {
      const n = alive(F.garrison) ? F.garrison.count : 0;
      rt.objProgress('main', `${Math.max(0, n - Math.round(F.gN * 0.25))}`);
      if (n <= F.gN * 0.25 || !F.garrison.leader?.alive) this.stage4(rt);
    } else if (F.step === 4) {
      const n = F.relief.reduce((s, g) => s + (alive(g) ? g.count : 0), 0);
      rt.objProgress('main', `${Math.max(0, n - Math.round(F.rN * 0.3))}`);
      if (n <= F.rN * 0.3 || rt.t - F.t4 > 150) this.win(rt);
    }
  },
};

// bot の頭：近い敵を突き、段の行き先へ。門の段は門を打つ
k08_osaka_kizu.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  const F = b.flags, p = b.player, u = p.u;
  if (!u.alive || F.ending) return;
  inp.leftPressed = false;
  inp.k.delete('KeyW');
  const gc = F.hachi.center();
  if (u.hp < u.maxHp * 0.35 && Math.hypot(u.pos.x - gc.x, u.pos.z - gc.z) > 4) { goTo(p, inp, gc.x, gc.z, 3); return; }
  const e = b.army.nearestEnemy(u, 9, (o) => !o.noTarget && !o.isStruct && !o.fleeing && o.type !== 'dummy' && !b.army.wallBetween(u.pos, -1, o.pos));
  if (e && F.step >= 2) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.4) inp.k.add('KeyW');
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    return;
  }
  const at = (q, r = 3) => goTo(p, inp, q.x, q.z, r);
  if (F.step <= 1) { at(APPROACH, 4); return; }
  if (F.step === 2) {
    if (Math.hypot(u.pos.x - GATE.x, u.pos.z - (GATE.z + 3)) > 3) { at({ x: GATE.x, z: GATE.z + 3 }, 2); return; }
    p.yaw = Math.atan2(GATE.x - u.pos.x, GATE.z - u.pos.z);
    inp.leftPressed = Math.random() < 0.6;
    return;
  }
  if (F.step === 3) { at(INSIDE, 3); return; }
  at({ x: FORT.x, z: FORT.z - 6 }, 4);
};

// 戦の進行の札（段）：F.step の 1〜4
setStages('k08_osaka_kizu', [['夜の堤を砦の前へ進む'], ['鉄砲組を払い、大手の門を破る', 2], ['砦の内へ。守将を討つ', 3], ['援兵を退け、砦を守り抜く', 4]]);

export { k08_osaka_kizu };
export default k08_osaka_kizu;
