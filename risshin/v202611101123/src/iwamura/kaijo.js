// ======================================================================
// 岩村城・水晶山　後半（9〜15分）「降伏の使者・開城・戦後」（docs/oda15_plan_1108.md 20）
//   ① 麓の登り口を固めた夜、城の太鼓が止み、逃げ出した者が下りて来て降る（城方の気の落ち）。続いて白旗の使者が下りて来る。本人は使者を柵の内の信忠の本陣まで送る（移動を出来事に）。
//   ② 本体の勝ち（水晶山の囲みを守った）の後、「十一日の後」。昼の麓へ場面替え：開かれた城から武田の城兵が列で下り、
//      先頭に秋山虎繁とおつやの方。織田の兵が道の両側で見送る。最後に信長公記の結末（長良川）と余韻。
// 兵は逃げ出した者四人・使者二人と、開城の列十人（どれも狙わせない）。字は台詞と任務の一行・時の見出しだけ。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export const GOAL = '白旗の使者を、柵の内の信忠様の本陣へ送り届けよ';
export const LEN = 46;
const HONJIN = { x: 0, z: 34 };

export function active(rt) { const K = rt.flags.iwKaijo; return !!K && !K.ok; }
export function pin(rt) { const K = rt.flags.iwKaijo; return K && !K.ok && K.g ? K.g.center() : null; }
export function envoy(rt) { const K = rt.flags.iwKaijo; return K?.g?.units.find((u) => u.alive) || null; }

function quiet(g) {
  g.aggro = 0; g.seekRange = 0; g.noAI = true; g.noHunt = true; g.peaceful = true;
  // 戦わない者も、実際に歩いて持ち場へ着いたかを数える。
  g.arriveNoncombat = true;
  for (const u of g.units) { u.noTarget = true; u.target = null; u.atk = null; u.swing = null; u.bind = null; u.invuln = true; }
}

// 本体の win の頭で呼ぶ。true の間は勝ちにしない
export function hold(rt) {
  const F = rt.flags;
  if (F.iwKaijo?.ok) return false;
  if (!F.iwYoru) yoru(rt);
  return true;
}

// 麓の登り口を固めた夜：城の太鼓が止み、城から逃げ出した者が下りて来て降る（城方の気の落ち）。その後で白旗の使者
function yoru(rt) {
  const F = rt.flags;
  F.iwYoru = { at: rt.t };
  for (const g of rt.army.groups) if (g.team === 1 && !g.routed) { quiet(g); g.order = 'hold'; }
  rt.say('河尻秀隆', '登り口は固めた。……城の太鼓が止んだな', 3.2);
  rt.after(6, () => { if (!rt.over) rt.say('足軽', '城の中から、泣く声が聞こえる……', 3); });
  rt.after(12, () => {
    if (rt.over || F.ending) return;
    const g = enemyGroup(rt, { faction: 'takeda', flag: null, name: '城から逃げ出した者', fixed: true, noGuard: true, anchor: { x: -6, z: -118 }, facing: 0, width: 3, formation: 'loose', morale: 100, noRout: true, speed: 1.8 },
      [{ type: 'ashigaru', n: 4, o: { flag: null } }]);
    quiet(g);
    // 主人公が山道へ戻っていても切岸を直進せず、搦手から麓へ下りる。
    g.roadColumn = true; g.followColumnRoad = true; g.colW = 1;
    g.formation = 'column'; g.order = 'path'; g.pathIdx = 0; g.dest = null;
    g.path = [[0, -118], [0, -96], F.restPath[0]];
    g.onArrive = (q) => { q.order = 'hold'; };
    F.iwYoru.g = g;
    rt.say('物見', '城の搦手から、誰か下りて来ます！　……刀を捨てておる', 3.4);
  });
  rt.after(30, () => { if (!rt.over && !F.ending) rt.say('城から逃げ出した者', '城には、もう食う物がない。馬も食うた……どうか命ばかりは', 4); });
  rt.after(36, () => { if (!rt.over && !F.ending) rt.say('河尻秀隆', '縄をかけて後ろへ送れ。城の気は落ちた。じきに使者が来よう', 3.6); });
  rt.after(44, () => { if (!rt.over && !F.ending && !F.iwKaijo) start(rt); });
}

function start(rt) {
  const F = rt.flags;
  const K = F.iwKaijo = { at: rt.t, s: 0 };
  // 夜討ちの直後に降伏したように見せず、使者が出る前に日付を区切る。
  rt.banner('十一日の後', '十一月二十一日、岩村城から白旗の使者');
  rt.world.setTime('day');
  // 城方の残る兵は打ちかからない（使者が下りる間）
  for (const g of rt.army.groups) if (g.team === 1 && !g.routed) { quiet(g); g.order = 'hold'; }
  try { sfx('kane', 0.5); } catch (e) { /* なし */ }
  rt.say('物見', '城の木戸が開きます……白い旗じゃ！　使者が下りて来ます', 3.6);
  K.g = enemyGroup(rt, { faction: 'takeda', flag: null, name: '城方の使者', fixed: true, noGuard: true, anchor: { x: 0, z: -120 }, facing: 0, width: 2, formation: 'column', morale: 100, noRout: true, speed: 2.2 },
    [{ type: 'samurai', n: 1, o: { name: '城方の使者', flag: null } }, { type: 'ashigaru', n: 1, o: { flag: null } }]);
  quiet(K.g);
  K.g.roadColumn = true; K.g.followColumnRoad = true; K.g.colW = 1; K.g.noRun = true;
  K.g.order = 'path'; K.g.pathIdx = 0; K.g.dest = null; K.g.formation = 'column';
  // 麓から本陣へは、追撃で下った九十九折りを戻る。切岸を直進しない。
  K.g.path = [[0, -120], [0, -96], ...(F.restPath || [[0, -90], [0, -6], [0, 10]]), [HONJIN.x, HONJIN.z - 4]];
  K.g.onArrive = (q) => { q.order = 'hold'; K.arrived = true; };
  rt.obj('main', GOAL, 'main', true);
  rt.after(5, () => rt.say('河尻秀隆', '槍を下げよ。使者は討つな。柵の内の本陣まで、おぬしが付いて送れ', 4));
}

export function tick(rt) {
  const F = rt.flags, K = F.iwKaijo;
  if (!K || K.ok || rt.over || F.ending || !rt.player.u.alive) return;
  const e = envoy(rt), p = rt.player.u.pos;
  if (!e) return;
  // 付き添いが離れたら道の途中で待つ。本人を置いて本陣へ着き、勝手に任務を済ませない。
  const beside = Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 14 && Math.abs(e.pos.y - p.y) < 4;
  if (!K.arrived) {
    // 待つ間も道に沿う列を保つ。構えへ替えると折れの後列が切岸へ出る。
    K.waiting = !beside;
    K.g.speed = beside ? 2.2 : 0;
  }
  rt.objProgress('main', K.arrived ? '使者と信忠様の本陣へ進め' : K.waiting ?
    '山道で待つ白旗の使者のそばへ戻れ' : '白旗の使者に付き添い、山道から柵の口を通れ');
  const T = rt.t - K.at;
  if (!K.l1 && T > 24) { K.l1 = true; rt.say('城方の使者', '城の者の命を助けてくださるなら、城を開くと秋山が申しております', 4); }
  if (!K.l2 && T > 40) { K.l2 = true; rt.say('足軽', '……城の兵は痩せこけておる。兵糧が尽きたのは本当じゃ', 3.4); }
  // 時間切れを達成扱いにせず、本陣に使者と本人がそろった事を確かめる。
  if (!K.arrived || !beside || Math.hypot(e.pos.x - HONJIN.x, e.pos.z - HONJIN.z) >= 8 ||
      Math.hypot(p.x - HONJIN.x, p.z - HONJIN.z) >= 10) return;
  K.ok = true;
  rt.objDone('main');
  rt.say('織田信忠', 'よかろう。城の者の命は助けると伝えよ', 3.6);
  rt.award((t) => { t.side.push('白旗の使者を信忠の本陣へ送り届けた'); }, '降伏の使者を送り届けた', HONJIN);
  rt.after(4, () => { if (!rt.over && !F.ending) { F.joinHold = Math.max(F.joinHold || 0, 3); rt.def.win(rt); } });
}

// 本体の勝ちの後の場面：使者を送った同じ日、昼の麓で開城の列を見送る
export function epilogue(rt) {
  const F = rt.flags;
  rt.after(3.5, () => {
    if (rt.over) return;
    rt.banner('開城', '十一月二十一日、兵糧の尽きた岩村城は開かれた');
    rt.world.setTime('day');
    const P = rt.player.u, W = rt.world;
    const put = (u, x, z) => { u.pos.x = x; u.pos.z = z; u.pos.y = W.heightAt(x, z); };
    // 九十九折りの途中の道脇へ置くと、組の兵が切岸に貼り付く。
    // 追撃で確保した麓の平場から、道を空けて開城の列を見送る。
    const foot = F.restPath[0];
    put(P, foot[0] + 7, foot[1]);
    for (const q of rt.squadGroups || []) {
      // 兵だけ移しても、本陣への古い下知と隊の要が残ると切岸へ戻ってしまう。
      quiet(q);
      q.anchor.x = foot[0] + 10; q.anchor.z = foot[1] + 1;
      q.order = 'hold'; q.path = null; q.dest = null; q.onArrive = null; q.pending = null;
      q.formation = 'line'; q.width = 3; q.spacing = 1; q.facing = -Math.PI / 2;
      for (const u of q.units) if (u.alive) put(u, foot[0] + 9 + Math.random() * 3, foot[1] + 4 - Math.random() * 6);
    }
    for (const g of rt.army.groups) if (g.team === 1 && g !== F.keep?.lord?.group) for (const u of g.units) if (u.alive) { u.noTarget = true; if (u.mesh) u.mesh.visible = false; }
    const col = enemyGroup(rt, { faction: 'takeda', flag: 'takeda', name: '城を出る武田の城兵', fixed: true, noGuard: true, anchor: { x: 0, z: -118 }, facing: 0, width: 2, formation: 'column', morale: 100, noRout: true, speed: 1.6 },
      [{ type: 'samurai', n: 3, o: { flag: null } }, { type: 'ashigaru', n: 7, o: { flag: null } }]);
    quiet(col);
    // 開城の列も使者と同じ九十九折りを通す。切岸へ真っすぐ登らせない。
    const path = [[0, -96], ...F.restPath];
    col.roadColumn = true; col.followColumnRoad = true; col.colW = 1;
    col.order = 'path'; col.pathIdx = 0; col.dest = null; col.path = path;
    col.onArrive = (q) => { q.order = 'hold'; };
    const L = F.keep?.lord;
    if (L?.alive) {
      put(L, 0, -108); L.noTarget = true;
      if (L.group) {
        const g = L.group;
        // おつやの方も同じ隊。城内に置き去りにすると新しい隊の要へ切岸を直進する。
        let row = 0;
        for (const u of g.units) if (u.alive) {
          put(u, 0, -108 - row * 1.4); u.slot = row++;
        }
        quiet(g); g.anchor.x = L.pos.x; g.anchor.z = L.pos.z;
        g.formation = 'column'; g.roadColumn = true; g.followColumnRoad = true; g.colW = 1;
        g.order = 'path'; g.pathIdx = 0; g.dest = null; g.path = path; g.speed = 1.4;
        g.onArrive = (q) => { q.order = 'hold'; };
      }
    }
    rt.say('語り', '使者が戻ると、兵糧の尽きた岩村城は、城の者の命と引き替えに開かれた', 4.4);
  });
  rt.after(9, () => { if (!rt.over) rt.say('河尻秀隆', '先頭が秋山虎繁。後ろの輿が、おつやの方じゃ', 3.6); });
  rt.after(14, () => { if (!rt.over) rt.say('足軽', '……武田の兵も、こうして見ると、ただの痩せた男たちじゃな', 3.6); });
  rt.after(19, () => { if (!rt.over) rt.say('語り', '約束は守られなかった。礼に出た秋山・大島・座光寺の三将は、岐阜の長良川で磔にされた', 5); });
  rt.after(35, () => { if (!rt.over) rt.banner('岩村城、開城', '東美濃は織田の手に戻った'); });
  rt.after(39, () => { if (!rt.over) rt.say('組頭', '帰るぞ。長い囲みじゃった', 3); });
  rt.after(42, () => { if (!rt.over) try { sfx('farHorn', 0.5); } catch (e) { /* なし */ } });
}

// 使者を送る間の bot：道の上の使者に付く（固定の横ずれで切岸へ出ない）
export function bot(b, inp, { goTo }) {
  const e = envoy(b), p = b.player;
  if (!e) return;
  if (p.lock) inp.e.add('KeyQ');
  inp.runHeld = Math.hypot(e.pos.x - p.u.pos.x, e.pos.z - p.u.pos.z) > 10;
  goTo(p, inp, e.pos.x, e.pos.z, 2);
}
