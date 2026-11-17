// ======================================================================
// 陣中（遠征中の拠点）（K308 要件8〜11・95）
// 遠征の途中で次の戦へ続く時は、本拠地の城下へ戻さず、陣中に戻る。城下より小さく簡素：
//   本陣の幕（軍議）・武具の修理・組の者・馬・戦の様子・出陣の口だけ。字は出さず、言葉は台詞で。
// どの戦の前が陣中かは「次の戦の id」で引く（state.js の ODA_LINE。直前の戦と同じ遠征の続きだけ）。
// ======================================================================
import { jinmaku, kagaribi, hut, nobori, umatsunagi } from './props.js';
import { allyGroup } from './bhelp.js';
import { BATTLES, scenarioKey } from './state.js';
import { seasonOf } from './oda_town.js';
import { townTabOpen } from './town_unlock.js';

// 次の戦の id → 陣中。prev は直前の戦（この戦から続く時だけ陣中にする）
export const JINCHU = {
  shiga: { prev: 'nodafukushima', place: '摂津 天満の陣中', news: '浅井と朝倉が坂本へ出たそうな。宇佐山の森様が危ない。殿は近江へ引き返される' },
  odani: { prev: 'tonezaka', place: '近江 虎御前山の陣中', news: '朝倉は越前で滅んだ。次は小谷の浅井じゃ。この山から城がよう見える' },
  echizen_ikko: { prev: 'echizen', place: '越前 府中の陣中', news: '木ノ芽峠は抜けた。一揆の残りは山の寺へ逃げ込んだそうな' },
  tano: { prev: 'takato', place: '信濃 高遠の陣中', news: '高遠は落ちた。勝頼は新府の城を焼いて、東へ逃げたそうな' },
};

// 今の保存で、次に向かう戦の前が陣中ならその中身。そうでなければ null
export function jinchuOf(G) {
  if (!G || scenarioKey() !== 'oda') return null;
  const next = BATTLES[G.battle], prev = BATTLES[(G.battle || 0) - 1];
  const J = next && JINCHU[next.id];
  if (!J || !prev || prev.id !== J.prev) return null;
  return { ...J, id: next.id, when: next.year || '' };
}

const SPOT = {
  boss: { x: 0, z: 6, n: '軍議の幕' }, shop: { x: -17, z: -3, n: '武具の修理場' }, squad: { x: 17, z: -3, n: '組の陣小屋' },
  stable: { x: 19, z: 12, n: '馬つなぎ' }, gate: { x: 0, z: -27, n: '出陣の口' },
};

export function jinchuDef(game, J) {
  const season = seasonOf(J.when);
  const def = {
    town: true, jinchu: true, dojo: true, noAI: true, noWake: true, noReserve: true, noDespair: true, trackerIndex: 0,
    title: J.place, info: { place: J.place, when: J.when }, year: Number((J.when.match(/\d{4}/) || [])[0] || 0), faction: 'oda',
    place: J.place, when: J.when, season,
    spawn: { x: 0, z: -21, heading: 0 },
    world: {
      seed: 1570 + J.id.length, time: 'day', clearAir: true, mood: 'plain',
      height: (x, z) => 0.5 * Math.sin(x * 0.031) + 0.4 * Math.cos(z * 0.027) + Math.max(0, z - 30) * 0.12,
      clear: (x, z) => Math.abs(x) < 32 && z > -34 && z < 26,
      trees: 160, tufts: 1800, rocks: 40, paths: [[[0, -40], [0, 2]]],
      autumn: season === '秋', winter: season === '冬', young: season === '春' || season === '夏', muddy: 0.25,
      groves: [[-60, 30, 24], [60, 34, 26], [-55, -40, 20], [58, -36, 20]].map(([x, z, r]) => ({ x, z, r, n: 14 })),
    },
    setup(rt) { buildJinchu(rt, J); const dl = document.getElementById('dateline'); if (dl) dl.textContent = J.when; },
    update() {},
    guideTo(rt, tab) {
      const s = SPOT[tab === 'nagaya' ? 'squad' : tab] || SPOT.boss;
      rt.marker('mk-go', { x: s.x, z: s.z }, s.n);
      rt.bark(`${s.n}へ。小さな地図の印をたどる`);
    },
    onResume() {},
  };
  return def;
}

function buildJinchu(rt, J) {
  const W = rt.world, game = rt.game, G = rt.G;
  // 軍議の幕（本陣）：幕で囲い、南に口。中に上役。印の名に「本陣」を使うと画面で「守る場所」に読み替わるので「軍議の幕」
  rt.scene.add(jinmaku(W, 0, 10, 18, 12, 6, { mon: 'oda' }));
  for (const [x, z] of [[-11, 2], [11, 2], [-11, 18], [11, 18], [-6, -12], [6, -12]]) rt.scene.add(kagaribi(W, x, z));
  for (const x of [-16, -11, -6, 6, 11, 16]) rt.scene.add(nobori(W, x, -9, 'oda', 5));
  // 陣小屋（板屋根の仮小屋）：西＝武具の修理場、東＝組の者
  rt.scene.add(hut(W, -21, -3, 7, 4.5, Math.PI / 2, { ita: true }));
  rt.scene.add(hut(W, 21, -3, 7, 4.5, -Math.PI / 2, { ita: true }));
  rt.scene.add(umatsunagi(W, 21, 12, Math.PI / 2, 8));
  // 人：本陣の上役・修理の者・組の者・火の番
  const one = (name, x, z, facing, type = 'ashigaru', o = {}) => {
    const g = allyGroup(rt, { name, anchor: { x, z }, facing, order: 'hold', noRout: true, width: 1, aggro: 0, seekRange: 0, fixed: true },
      [{ type, n: 1, o: { name, flag: null, invuln: true, ...o } }]);
    return g.units[0];
  };
  const bossName = ((BATTLES[G.battle] || {}).boss || '').split(/\s/).pop() || '上役';
  one(bossName, 0, 12, Math.PI, 'ashigaru', { weapon: 'none' });
  one('具足師', -17, -1.5, -Math.PI / 2, 'porter', { weapon: 'none' });
  for (let i = 0; i < 3; i++) one('組の者', 15.5 + (i % 2) * 1.4, -5 + i * 1.6, Math.PI / 2 + (i - 1) * 0.4, 'ashigaru', { hat: i % 2 ? 'hachimaki' : 'none' });
  for (const [x, z, f] of [[-9.5, 1, 0.8], [-12.5, 3, -2.2], [9.6, 1.2, -0.8], [12.4, 3.1, 2.3], [-5, -13.5, 0.4], [7.5, -13.8, -0.6]]) one('足軽', x, z, f, 'ashigaru', { weapon: 'none' });
  // 用：軍議・修理・組・馬・戦の様子・出陣
  rt.addInteract('jin-boss', SPOT.boss, `軍議に出る　${SPOT.boss.n}`, () => game.townOpen('boss'), { r: 3 });
  rt.addInteract('jin-shop', SPOT.shop, `直す　武具（${SPOT.shop.n}）`, () => game.townOpen('shop'), { r: 3 });
  rt.addInteract('jin-squad', SPOT.squad, '会う　組の者', () => townTabOpen(G, 'squad') ? game.townOpen('squad') : rt.say('組の者', '飯を食うたら、すぐ次じゃ。槍の穂先を研いでおくわい', 4), { r: 3 });
  rt.addInteract('jin-stable', SPOT.stable, '見る　馬', () => townTabOpen(G, 'stable') ? game.townOpen('stable') : rt.say('馬方', '陣中の馬は御大将方のものじゃ。足軽は歩きよ', 4), { r: 3 });
  rt.addInteract('jin-news', { x: -6, z: -12 }, '聞く　戦の様子', () => rt.say('物見', J.news, 5), { r: 3 });
  rt.addInteract('jin-meal', { x: 6, z: -12 }, '聞く　火の番', () => rt.say('足軽', '城下には戻らん。ここで飯を食うて、このまま次の戦じゃ', 4), { r: 3 });
  rt.addInteract('door-gate', SPOT.gate, '任務を受けて出陣する', () => game.townSortie(), { r: 3.5 });
  rt.marker('mk-boss', SPOT.boss, SPOT.boss.n);
  rt.marker('mk-gate', SPOT.gate, SPOT.gate.n);
  rt.flags.doors = { boss: SPOT.boss, shop: SPOT.shop, squad: SPOT.squad, stable: SPOT.stable, gate: SPOT.gate };
  rt.after(1.5, () => rt.say('組頭', '城下には戻らぬ。ここが陣中じゃ。軍議の幕で次の下知を待て', 5));
}
