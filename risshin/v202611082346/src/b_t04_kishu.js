// 紀州征伐の前後。手本と推定の区別は docs/battle_refs/t04_kishu_additions.md。
// 根来寺の五目標を保ち、千石堀と太田を独立した戦として登録する。
import * as THREE from 'three';
import { allyGroup, enemyGroup } from './bhelp.js';
import { castleBoardFence, hut, kabukimon, jinmaku, shogi, nobori, solidSeg, solidRect, tawara } from './props.js';
import { STAGES } from './stages.js';
import { addSite } from './map_sites.js';
import { withGuard } from './toyo_bot.js';
import { rippleWater } from './world_water.js';
import { liteMat } from './world_vegetation_materials.js';
import { sfx } from './audio.js';
import { siegeStages } from './siege_stages.js';

const HASHIBA = { armor: 0x282420, flag: 'toyotomi' };
const NEGORO = { armor: 0x302a24, flag: 'maru' };
const SEN = [{ x: 0, z: -48 }, { x: 0, z: -18 }, { x: 47, z: 20 }, { x: 0, z: -18 }];
const OTA = [{ x: 0, z: -68 }, { x: -46, z: -46 }, { x: 62, z: -12 }, { x: 0, z: -68 }];
const SEN_GOALS = ['北の土橋で、打ち出す根来衆を防ぐ', '北の虎口を抜け、二の丸の守りを崩す', '東の搦手で、火矢の射手を守る', '二の丸へ戻り、炎上する本丸を見届ける'];
const OTA_GOALS = ['出水の堤で、築堤の人夫を守る', '出水の堰へ行き、水を入れる', '東の堤で、打ち出す雑賀衆を防ぐ', '北の土橋で、開城の使者を迎える'];
const clamp = (v) => Math.max(0, Math.min(1, v));
const near = (rt, p, r = 10) => Math.hypot(rt.player.u.pos.x - p.x, rt.player.u.pos.z - p.z) < r;
const living = (g) => g ? g.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing ? 1 : 0), 0) : 0;
const broken = (g) => !g || living(g) <= Math.floor(g.units.length / 4);
function move(g, p) {
  if (!g) return;
  g.stay = false; g.noAI = true; g.order = 'move'; g.dest = p; g.anchor = p;
}
function troops(rt, ally, name, p, n, guns = 0, leader = null) {
  const look = ally ? HASHIBA : NEGORO;
  const list = [{ type: 'ashigaru', n, o: look }];
  if (guns) list.push({ type: 'gun', n: guns, o: look });
  if (leader) list.push({ type: 'busho', n: 1, o: { ...look, name: leader, horse: ally && leader !== '羽柴秀吉' } });
  const g = (ally ? allyGroup : enemyGroup)(rt, {
    faction: ally ? 'oda' : 'saika', flag: look.flag, name, anchor: p,
    facing: ally ? 0 : Math.PI, width: 8, aggro: 10, seekRange: 15,
    noRout: true, fixed: true, fullStrength: true, dmgMult: ally ? 0.65 : 0.32,
  }, list);
  g.noAI = true;
  return g;
}
function fence(rt, seg, h = 2.4) {
  rt.scene.add(castleBoardFence(rt.world, seg, { h }));
  const s = solidSeg(...seg, 0.18);
  s.missileH = h; s.missileType = 'wood';
}
function boxCastle(rt, x0, z0, x1, z1, gateZ) {
  // 北の土橋は幅八歩。食い違いの短い塀の脇に通り道を残す。
  for (const seg of [[x0, z0, -4, z0], [4, z0, x1, z0], [x0, z0, x0, z1], [x1, z0, x1, z1], [x0, z1, x1, z1]]) fence(rt, seg);
  rt.scene.add(kabukimon(rt.world, 0, gateZ, 8));
}
function camp(rt, z) {
  const W = rt.world;
  rt.scene.add(jinmaku(W, -18, z, 16, 12, 6, { mon: 'toyotomi' }));
  rt.scene.add(shogi(W, -18, z + 1));
  const g = troops(rt, true, '秀吉の本陣', { x: -18, z: z + 1 }, 10, 0, '羽柴秀吉');
  g.stay = true; g.aggro = 0; g.seekRange = 0;
  for (const u of g.units) {
    if (u.name === '羽柴秀吉') {
      u.invuln = true; u.noTarget = true;
      u.jinchu = { standing: false, t: 0, soldiers: [] };
    }
  }
}
function sentries(rt, spots) {
  const g = enemyGroup(rt, { faction: 'saika', flag: 'maru', name: '塀内の鉄砲衆', anchor: spots[0],
    fixed: true, noRout: true, order: 'hold', aggro: 2, seekRange: 0, dmgMult: 0.12 },
  spots.map(() => ({ type: 'gun', n: 1, o: NEGORO })));
  g.stay = true; g.noAI = true; g.gunRanks = () => 1;
  g.units.forEach((u, i) => {
    const p = spots[i], y = rt.world.heightAt(p.x, p.z) + 1.15;
    u.pos.set(p.x, y, p.z); u.mesh.position.copy(u.pos);
    u.perch = { x: p.x, y, z: p.z }; u.gunAmmo = 80;
  });
  return g;
}
function senHeight(x, z) {
  // 北の土橋と東の搦手を残し、堀を実際に掘る。石垣の箱は置かない。
  let h = 0.6 + 3.4 * clamp((z + 70) / 30) * clamp((70 - z) / 30);
  const east = Math.min(Math.abs(x - 30), Math.abs(x - 39));
  const west = Math.abs(x + 30);
  if (z > -27 && z < 50) h -= 2.8 * clamp(1 - Math.min(east, west) / 3);
  if (Math.abs(x) > 4 && Math.abs(x) < 28) h -= 2.6 * clamp(1 - Math.abs(z + 32) / 4);
  // 本丸の手前には橋を外した堀。射手は東の道から射る。
  if (Math.abs(x) < 25) h -= 3 * clamp(1 - Math.abs(z - 2) / 4);
  return h;
}
function otaHeight(x, z) {
  const d = Math.hypot(x, z);
  let h = -0.8 + 1.6 * clamp((34 - d) / 10);
  h += 3.2 * clamp(1 - Math.abs(d - 65) / 8);
  // 北の土橋。城と堤をつなぎ、主人公と開城の使者が歩ける。
  if (Math.abs(x) < 4 && z < -22 && z > -70) h = Math.max(h, 1.2);
  return h;
}
// 同じ道筋を味方の隊と自動操作で使う。曲がり角の器は兵ごとに一度だけ作る。
function route(isOta, u, want) {
  const p = u.pos, q = u._kishuWay || (u._kishuWay = { x: 0, z: 0, botRadius: 2 });
  if (isOta) {
    if (Math.hypot(p.x, p.z) < 50 || Math.hypot(want.x, want.z) < 50) return want;
    const a = Math.atan2(p.z, p.x), end = Math.atan2(want.z, want.x);
    let d = end - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) <= 0.15) return want;
    const v = a + Math.sign(d) * Math.min(0.12, Math.abs(d));
    q.x = 65 * Math.cos(v); q.z = 65 * Math.sin(v); return q;
  }
  // 北の土橋を出てから、東の二重堀の北を回る。
  if (want.x > 40 && p.x < 42) { q.x = p.z > -39 ? 0 : 47; q.z = -42; return q; }
  if (want.x < 10 && p.x > 28) { q.x = p.z > -39 ? 47 : 0; q.z = -42; return q; }
  if (want.x < 10 && want.z > -32 && p.z < -32 && Math.abs(p.x) > 3) { q.x = 0; q.z = -42; return q; }
  return want;
}
function makeBattle(id, isOta) {
  const points = isOta ? OTA : SEN, goals = isOta ? OTA_GOALS : SEN_GOALS;
  STAGES[id] = goals.map((g, i) => i ? [g, (rt) => rt.flags.step >= i + 1] : [g]);
  const def = {
    spawn: isOta ? { x: 0, z: -78, heading: Math.PI } : { x: 0, z: -79, heading: 0 },
    minutes: 7, noWake: true, noTaishoRaid: true, noDespair: true, noFrontFill: true,
    keepMix: true, noCavalryMix: true, stageGoalsOnly: true, nearbyAllySignLimit: 0,
    meleeGrace: { rate: 1, burst: 1, interval: 3 }, flagEra: { toyotomi: 'kiri53' },
    meleeGuide: () => false, guardGuideAllowed: () => false,
    date: () => (isOta ? '天正十三年四月　春・晴' : '天正十三年三月二十一日　春・夕'),
    introPlace: isOta ? '紀伊国 太田城　三月末〜四月' : '和泉国 千石堀城　三月二十一日',
    introText: isOta ? '根来寺の後、雑賀衆は太田城へ籠もった。堤を守り、水で囲み、開城の使者を迎えよ。数週間の包囲を四つの段で辿る。'
      : '根来寺へ向かう二日前。根来衆の主力が千石堀城で待つ。北の土橋から二の丸へ寄せ、東の搦手で火矢の射手を守れ。',
    history: isOta ? '根来寺の後、羽柴勢は太田城を水で囲み、四月に開城した。堤は全長約五〜七キロメートルと復元される。築堤の迎撃と堰の操作は遊びの補完。'
      : '三月二十一日、根来寺に先立って千石堀城で激戦となった。羽柴秀次らの寄せ手も大きな損害を受け、火が煙硝蔵へ入って落城したと伝わる。射手を守る手順は遊びの補完。',
    sides: { a: { name: '羽柴勢', mon: 'toyotomi' }, b: { name: isOta ? '雑賀衆' : '根来衆', mon: 'maru' } },
    force: (rt) => {
      const a0 = isOta ? 100000 : 15000, b0 = isOta ? 5000 : 1500;
      return { a0, b0, a: Math.max(0, a0 - (rt.flags.ak || 0) * 30), b: Math.max(0, b0 - (rt.flags.ek || 0) * 25) };
    },
    world: {
      moveWay: (army, u, want) => route(isOta, u, want),
      seed: isOta ? 158504 : 15850321, time: isOta ? 'day' : 'dusk',
      height: isOta ? otaHeight : senHeight, softPathSoil: true, muddy: 0,
      trees: isOta ? 100 : 260, tufts: 900, fogFar: 330,
      clear: (x, z) => isOta ? Math.hypot(x, z) < 95 : Math.abs(x) < 58 && Math.abs(z) < 95,
      paths: isOta ? [[[0, -85], [0, -25]]] : [[[0, -85], [0, -18]], [[0, -18], [0, -42], [47, -42], [47, 20]]],
    },
    missionHeading(rt) { return goals[Math.max(0, Math.min(3, (rt.flags.step || 1) - 1))]; },
    goalTargetOverride(rt) {
      const F = rt.flags;
      if (!F.step || F.ending) return null;
      return F.target;
    },
    setup(rt) {
      const F = rt.flags, W = rt.world;
      F.step = 0; F.ending = false; F.ek = 0; F.ak = 0;
      // 総大将は最初から馬無しで床几に座る。
      camp(rt, isOta ? -104 : -110);
      F.friends = troops(rt, true, isOta ? '築堤の護衛' : '羽柴秀次の先手', isOta ? { x: 4, z: -72 } : { x: 4, z: -64 }, 22, 8, isOta ? '羽柴秀長' : '羽柴秀次');
      if (isOta) {
        boxCastle(rt, -23, -25, 23, 25, -25);
        rt.scene.add(hut(W, 0, 9, 12, 8));
        rt.scene.add(nobori(W, 10, 12, 'maru'));
        F.workers = allyGroup(rt, { faction: 'oda', name: '出水の人夫', anchor: { x: -8, z: -64 }, width: 6, fixed: true, fullStrength: true, aggro: 0 },
          [{ type: 'porter', n: 10, o: { armor: 0x4a4034, flag: null } }]);
        F.workers.noAI = true; F.workers.stay = true;
        for (const u of F.workers.units) u.noTarget = true;
        for (let x = -20; x <= -8; x += 3) rt.scene.add(tawara(W, x, -62));
        F.weir = new THREE.Mesh(new THREE.BoxGeometry(1, 2.3, 6), new THREE.MeshLambertMaterial({ color: 0x483727 }));
        F.weir.position.set(-46, W.heightAt(-46, -46) + 1, -46); rt.scene.add(F.weir);
        F.weirSolid = solidRect(-46, -46, 1, 6);
        const mat = rippleWater(liteMat({ color: 0x384b40, roughness: 0.2 }), 0.4, 0.8, 2, W.hemi?.color, false, null, null, false, true);
        F.water = new THREE.Mesh(new THREE.CircleGeometry(60, 64), mat);
        F.water.rotation.x = -Math.PI / 2; F.water.position.y = -1; rt.scene.add(F.water);
        F.enemies = [troops(rt, false, '北の土橋の雑賀衆', { x: 0, z: -42 }, 14, 2),
          troops(rt, false, '東の堤へ寄せる雑賀衆', { x: 61, z: 25 }, 16, 2)];
        F.posts = sentries(rt, [{ x: -13, z: -23 }, { x: -7, z: -23 }, { x: 7, z: -23 }, { x: 13, z: -23 }]);
        addSite(rt, 'castle', 0, 0, '太田城');
        addSite(rt, 'fort', 0, -68, '出水の堤');
        addSite(rt, 'fort', 62, -12, '東の堤');
        addSite(rt, 'fort', -46, -46, '出水の堰');
      } else {
        boxCastle(rt, -23, -32, 23, -4, -32);
        // 虎口の内側を食い違わせる。右側に六歩の通路を残す。
        fence(rt, [-7, -26, -1, -26]);
        boxCastle(rt, -23, 8, 23, 48, 8);
        fence(rt, [-4, 8, 4, 8]);  // 本丸は閉じ、火矢で崩す。
        F.store = hut(W, 9, 33, 8, 6); rt.scene.add(F.store);
        rt.scene.add(hut(W, -10, 30, 9, 6));
        F.archers = troops(rt, true, '中坊秀行の火矢の射手', { x: 47, z: 24 }, 0, 0);
        rt.army.spawn(F.archers, [{ type: 'bow', n: 6, o: HASHIBA }]);
        F.archers.stay = true;
        F.enemies = [troops(rt, false, '北の土橋へ打ち出す根来衆', { x: 0, z: -40 }, 16, 4),
          troops(rt, false, '二の丸の根来衆', { x: 0, z: -14 }, 16, 4),
          troops(rt, false, '東の搦手の根来衆', { x: 47, z: 8 }, 14, 2)];
        F.enemies[1].stay = true; F.enemies[2].stay = true;
        // 段の決まり（siege_stages.js・docs/siege_honjin_spec_1107.md 5・13章）：北の土橋 → 二の丸 → 東の搦手。今の段の守りだけが打って出る
        F.stages = siegeStages(rt, [
          { groups: [F.enemies[0]], at: SEN[1], done: () => F.step > 1, report: '北の土橋、まだ抜けませぬ！', reportAfter: 70 },
          { groups: [F.enemies[1]], at: SEN[2], done: () => F.step > 2, report: '二の丸の鉄砲、まだ止みませぬ！', reportAfter: 70 },
          { groups: [F.enemies[2]], done: () => F.step > 3 },
        ], { runner: '使番' });
        F.posts = sentries(rt, [{ x: -15, z: 10 }, { x: -8, z: 10 }, { x: 8, z: 10 }, { x: 15, z: 10 }]);
        const bow = new THREE.CylinderGeometry(0.025, 0.025, 1.8, 4);
        bow.rotateZ(Math.PI / 2);
        F.arrow = new THREE.Mesh(bow, new THREE.MeshBasicMaterial({ color: 0xff9b32 }));
        F.arrow.visible = false; rt.scene.add(F.arrow);
        addSite(rt, 'castle', 0, 30, '千石堀城本丸');
        addSite(rt, 'fort', 0, -18, '二の丸');
        addSite(rt, 'fort', 47, 20, '東の搦手');
        addSite(rt, 'fort', 0, -48, '北の土橋');
      }
      rt.setPhase('fight'); rt.obj('main', goals[0], 'main');
      this.advance(rt, 1);
      rt.say(isOta ? '羽柴秀長' : '羽柴秀次', isOta ? '出水の堤を固めよ。城へ斬り込むな、水で囲むのじゃ' : '北の土橋から寄せよ。根来の鉄砲に気を付けい', 4);
    },
    advance(rt, step) {
      const F = rt.flags, p = points[step - 1];
      F.step = step; F.stepT = rt.t;
      F.target = { x: p.x, z: p.z, label: isOta ? ['出水の堤', '出水の堰', '東の堤', '北の土橋'][step - 1]
        : ['北の土橋', '二の丸', '東の搦手', '二の丸'][step - 1], action: goals[step - 1] };
      move(F.friends, p);
      const g = F.enemies[isOta ? (step === 1 ? 0 : step === 3 ? 1 : -1) : step - 1];
      if (g) move(g, p);
    },
    onKill(rt, u) {
      if (u.team === 1) rt.flags.ek++;
      else rt.flags.ak++;
    },
    update(rt, dt) {
      const F = rt.flags;
      if (!F.step || F.ending || !rt.player.u.alive) return;
      const p = points[F.step - 1];
      if (isOta) {
        if (F.opened) {
          F.water.position.y = Math.min(0.45, F.water.position.y + dt * 0.055);
          F.weir.position.y = Math.min(F.weirTop, F.weir.position.y + dt * 0.8);
        }
        if (F.step === 1 && near(rt, p, 8) && broken(F.enemies[0]) && rt.t - F.stepT > 20) {
          rt.say('羽柴秀長', '北の寄せ手は退いた。出水の堰から水を入れよ', 3.5); this.advance(rt, 2);
        } else if (F.step === 2 && near(rt, p, 7)) {
          F.opened = true; F.weirTop = F.weir.position.y + 3;
          F.weirSolid.yBot = rt.world.heightAt(-46, -46) + 3;
          rt.say('人夫頭', '堰板を上げるぞ。城の周りへ水が回る', 3.5);
          this.advance(rt, 3);
        } else if (F.step === 3 && near(rt, p, 14) && broken(F.enemies[1]) && F.water.position.y >= 0.45) {
          F.envoy = troops(rt, false, '開城の使者', { x: 0, z: -28 }, 1);
          for (const u of F.envoy.units) { u.noTarget = true; u.invuln = true; }
          F.envoy.aggro = 0; F.envoy.seekRange = 0;
          move(F.envoy, { x: 0, z: -58 });
          F.posts.stay = true; F.posts.aggro = 0;
          for (const u of F.posts.units) { u.gunAmmo = 0; u.target = null; }
          rt.say('使番', '四月二十二日。太田城から開城を願う使者が出ました', 4); this.advance(rt, 4);
        } else if (F.step === 4 && near(rt, p) && F.envoy.units.some((u) => u.pos.z < -52)) this.win(rt);
      } else {
        if (F.step <= 2 && near(rt, p, 12) && broken(F.enemies[F.step - 1])) {
          if (F.step === 2) rt.say('中坊秀行', '本丸の橋が無い。東の搦手から火矢を射込む、射手を守れ', 4);
          this.advance(rt, F.step + 1);
        } else if (F.step === 3 && near(rt, p, 12) && broken(F.enemies[2]) && !F.shotAt) {
          F.shotAt = rt.t; F.arrow.visible = true; sfx('arrow', 0.7);
        }
        if (F.shotAt && !F.exploded) {
          const t = clamp((rt.t - F.shotAt) / 2);
          F.arrow.position.set(47 - 38 * t, rt.world.heightAt(47, 24) + 2 + 7 * Math.sin(Math.PI * t), 24 + 9 * t);
          if (t >= 1) {
            F.exploded = true; F.arrow.visible = false;
            WFire(rt, 9, 33); WFire(rt, -10, 30);
            sfx('gun', 1); rt.banner('煙硝蔵、炎上', '千石堀城の本丸が崩れる');
            for (const u of F.posts.units) { u.gunAmmo = 0; u.target = null; }
            this.advance(rt, 4);
          }
        }
        if (F.step === 4 && near(rt, p, 10) && rt.t - F.stepT > 8) this.win(rt);
      }
    },
    win(rt) {
      const F = rt.flags;
      if (F.ending) return;
      F.ending = true; rt.setPhase('end'); rt.objDone('main'); rt.player.u.invuln = true;
      for (const g of F.enemies) { g.noRout = false; g.morale = 0; }
      rt.award((t) => { t.main = true; }, isOta ? '太田城の開城を迎えた' : '千石堀城の搦手を押さえた');
      rt.say(isOta ? '開城の使者' : '羽柴秀次', isOta ? '太田城を明け渡します。城の者の命をお助けください' : '千石堀は落ちた。次は根来寺へ向かうぞ', 4);
      rt.after(4.5, () => rt.say('羽柴秀吉', isOta ? '城の者は助けよ。これで紀州の戦を収める' : '根来寺へ進む。大塔は焼かせるな', 4));
      rt.finish({ scriptedEnd: true }, 9);
    },
    botBrain(b, inp, { goTo, patientStrike }) {
      const F = b.flags;
      if (!F.step || F.ending) { inp.k.delete('KeyW'); return true; }
      const p = b.player.u.pos, target = points[F.step - 1];
      const way = route(isOta, b.player.u, target);
      if (way !== target) { goTo(b.player, inp, way.x, way.z, 2); return true; }
      const g = F.enemies[isOta ? (F.step === 1 ? 0 : F.step === 3 ? 1 : -1) : F.step - 1];
      let enemy = null, distance = 18;
      if (g && !broken(g)) for (const u of g.units) if (u.alive && !u.gone && !u.fleeing) {
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d < distance) { distance = d; enemy = u; }
      }
      if (enemy) { goTo(b.player, inp, enemy.pos.x, enemy.pos.z, 1.8); if (distance < 3) patientStrike(b.player, inp, enemy, distance, true); }
      else { const q = points[F.step - 1]; goTo(b.player, inp, q.x, q.z, 4); }
      return true;
    },
  };
  withGuard(def);
  return def;
}
function WFire(rt, x, z) { rt.world.addFire(x, z, { size: 3, h: 1.2, blackSmoke: true }); }
export const t04a_sengokubori = makeBattle('t04a_sengokubori', false);
export const t04b_ota = makeBattle('t04b_ota', true);
