// ======================================================================
// 天王寺・岡山の戦い　始まりの段「茶臼山の布陣」（戦の前の話〜最初の任務の前）
// 茶臼山を正面に見る物見の場から、両軍の布陣を見せる：
//   豊臣方：茶臼山の真田の赤備え（後ろに控えの赤備え）・四天王寺の東の毛利勝永の本隊・北の城寄りに大野治長の備え
//   徳川方：茶臼山の南の越前勢の後ろ備え・天王寺口の本多の後ろ・大御所の旗本・東の岡山口（将軍秀忠・前田・井伊・藤堂）の大軍
// 大軍は軽い作り（addDistantArmy）。遊ぶ道（ROADS）と本物の兵の持ち場から離して置く（後の段の邪魔をしない）。
// 主人公の手柄：物見の場（▼）へ上がって敵の陣立てを見届け、本多忠朝へ知らせる（戦功）。行かなくても時が来れば戦は進む（二5）。
// 字は出さない（五1）。行き先は▼一つ（DEST[0.5]）。
// ======================================================================
import { flagTexture } from '../textures.js';
import { isTouch } from '../touch.js';
import { sfx } from '../audio.js';
import { revealName } from '../battle_intel.js';

const MI = { x: -51, z: 47 };      // 物見の場（天王寺口の先手の手前、西へ寄った高み。茶臼山と四天王寺が両方見える）
const WAIT = 30;                   // 物見に行かない時も、この秒で最初の任務へ進む
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;

// 遠くの大軍（軽い作り）。team を付けて敵味方の扱いを分ける。後詰めは付けない（本物の兵へ替えない）
function armies(rt) {
  const W = rt.world;
  if (!W?.addDistantArmy) return;
  const S = Math.PI;
  // 携帯：11/9 実機で天王寺岡山が落ちた（signal 9）。遠くの大軍を五つに絞り、人数を三分の一ほどに（docs/crash_1108.md）
  const A = (x, z, w, d, count, facing, armor, flag, seed, team, kind) => {
    if (isTouch) { if (seed === 15073 || seed === 15076 || seed === 15078) return; count = Math.round(count * 0.35); }
    try { W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), mon: flag, seed, team, kind, host: false }); } catch (e) { console.warn('k15 chausuyama army', e); }
  };
  // ---- 豊臣方 ----
  A(-130, -8, 22, 10, 220, 0.5, 0x8e1f16, 'sanada', 15071, 1);        // 茶臼山の後ろの真田の控え（赤備え）
  A(6, -40, 24, 10, 260, 0.1, 0x221f1c, 'toyotomi', 15072, 1);        // 四天王寺の東の毛利勝永の本隊
  A(-62, -96, 30, 12, 320, 0, 0x221f1c, 'toyotomi', 15073, 1);         // 大野治長の備え（城寄り）
  // ---- 徳川方 ----
  A(-134, 82, 32, 12, 360, S, 0x1f1e1c, 'tokugawa', 15074, 0);         // 越前勢の後ろ備え
  A(-8, 74, 24, 10, 240, S, 0x1c1a18, 'honda', 15075, 0);              // 天王寺口の後ろ（本多・浅野）
  A(-80, 150, 30, 12, 360, S, 0x1f1e1c, 'tokugawa', 15076, 0);         // 大御所の旗本の後ろ
  A(34, 58, 40, 14, 460, S, 0x1f1e1c, 'tokugawa', 15077, 0);           // 岡山口（将軍秀忠・前田）
  A(80, 18, 34, 12, 400, S - 0.3, 0x1f1e1c, 'tokugawa', 15078, 0);    // 岡山口の先（井伊・藤堂）
}

// 物見の場の行き先。install の中で矢の関数を作ると、戦の定義（DEST）が閉包ごと戦をつかみ、戦を出ても残った（11/8 docs/crash_1108.md）
const scoutDest = () => ({ x: MI.x, z: MI.z, label: '物見の場' });
// rt：戦の実行、ctx：{ DEST, next }。next は最初の任務（stage1）を始める関数
export function install(rt, ctx) {
  const F = rt.flags;
  armies(rt);
  ctx.DEST[0.5] = scoutDest;
  let done = false;
  const go = () => { if (done) return; done = true; rt.unmark('k15'); ctx.next(); };
  const report = () => {
    if (F.scoutDone) return;
    F.scoutDone = true;
    rt.objDone('main');
    for (const n of ['真田信繁', '毛利勝永', '大野治長']) { try { revealName(rt, n); } catch (e) { /* 名の無い将は飛ばす */ } }
    // 着いたら敵の陣が見える：毛利の先手に赤い頭上の印、毛利が動き出して次の任務（食い止め）へ
    const M = F.mori;
    if (M) {
      rt.marker('moriMark', () => { if (!M.units.some((q) => q.alive)) return null; const c = M.center(); return { x: c.x, z: c.z }; }, '毛利の先手', { red: true, h: 3 });
      M.stay = false; M.order = 'attack'; M.anchor = { x: -46, z: 22 };
    }
    try { sfx?.('taiko', 0.6); } catch (e) { /* 音が無くても進む */ }
    rt.award((t) => { t.side.push('茶臼山の敵の陣立てを物見して知らせた'); t.special = { label: '物見で敵の陣立てを知らせた', pts: 12 }; }, '敵の陣立てを知らせた', MI);
    rt.say('本多忠朝', 'よう見た。茶臼山に真田の赤備え、四天王寺の前に毛利、奥に大野か', 3.4);
    rt.after(3.6, () => rt.say('小笠原秀政', '真田は動かぬ。先に出るのは毛利じゃ。迎え撃て！', 2.6));
    // 到着したその場で物見の印を畳み、動き出した毛利を迎え撃つ任務へ渡す。
    go();
  };
  // 戦の前の話（十秒）の後、物見の場へ。着けば手柄、着かなくても時が来れば進む
  // 11/13 kaito：物見の段は無し。話（十秒）の後は、すぐ最初の任務（毛利を食い止める）へ
  rt.after(10, () => {
    if (F.step || F.ending) return;
    F.step = 0.5; F.tScout = rt.t;
    go();
  });
}
