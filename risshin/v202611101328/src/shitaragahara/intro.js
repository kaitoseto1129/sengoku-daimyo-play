// ======================================================================
// 設楽原の決戦　導入の段（0〜3分）「柵の見回りと、物見の誘い出し」（docs/oda15_plan_1108.md 17）
//   ① 柵の内を歩いて鉄砲組の持ち場へ。着くと前田利家が玉込めを見せ、川向こうの武田の備の名が明かされる。
//   ② 一の柵の虎口を出て、連吾川の手前で武田の物見と槍を合わせる（信長公記：足軽が柵の外へ出て誘った）。
//   ③ 「退け」で柵の内へ駆け戻る。追って来た物見を、柵の鉄砲が一斉に撃ち倒す（柵と鉄砲の守りを最初に見せる）。
//   その後で夜明けの知らせ（鳶ヶ巣山）と真田の寄せ（本体の nfTick の step 0）へ渡す。
// 物見の兵は十人だけ（本物の兵の上限を守る）。字は台詞と任務の一行だけ。行き先は金の▼一つ。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';
import { revealName } from '../battle_intel.js';

const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;

// ctx：{ SB, MOUTHS, nfGuns, black, ready }（本体の定数と道具）
export function start(rt, ctx) {
  const F = rt.flags, gz = ctx.SB.gates[0] + 4.5;
  const I = F.shIntro = {
    s: 0, at: rt.t, ctx,
    POST: { x: ctx.SB.x0 - 2 * ctx.SB.gap - 8, z: gz + 10 },     // 鉄砲組の後ろ（柵の内の道）
    OUT: { x: ctx.SB.x0 + 16, z: gz },                           // 一の柵の外、連吾川の手前
    BACK: { x: ctx.SB.x0 - ctx.SB.gap - 3, z: gz },              // 柵の内の持ち場
  };
  // 鉄砲組と槍組のすぐ後ろから始める。遠い空き地へ本人だけを離さない。
  const P = rt.player.u;
  P.pos.x = I.POST.x - 8; P.pos.z = I.POST.z + 4;
  P.pos.y = rt.world.heightAt(P.pos.x, P.pos.z);
  for (const q of rt.squadGroups || []) {
    for (const u of q.units) { u.pos.x = P.pos.x - 3 + Math.random() * 2; u.pos.z = P.pos.z + 3 + Math.random() * 4; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); }
    q.order = 'follow';
  }
  rt.after(1.5, () => { if (!F.ending && !rt.over && I.s === 0) rt.say('侍大将', '夜明けまで間がある。鉄砲組の持ち場を見て回れ', 3.4); });
  return I;
}

export function active(rt) { const I = rt.flags.shIntro; return !!I && I.s < 9; }

export function pin(rt) {
  const I = rt.flags.shIntro;
  if (!I || I.s >= 9) return null;
  if (I.s === 0) return I.POST;
  if (I.s === 1) return I.OUT;
  if (I.s === 2) return null;            // 物見と槍を合わせる間は、頭上の赤い▼だけ
  if (I.s === 3) return I.BACK;
  return null;
}

// true の間は本体の step 0 を止める
export function tick(rt, dt) {
  const F = rt.flags, I = F.shIntro;
  if (!I || I.s >= 9) return false;
  const P = rt.player.u, p = P.pos, T = rt.t - I.at, c = I.ctx;
  // ① 鉄砲組の持ち場へ
  if (I.s === 0) {
    if (near(p, I.POST, 7)) {
      I.s = 1; I.at = rt.t;
      rt.say('前田利家', '玉は込めてある。柵の内から、引き付けて放つ', 3.4);
      try { sfx('taiko', 0.5); } catch (e) { /* 音が無くても進む */ }
      for (const n of ['真田信綱', '真田昌輝', '内藤昌豊', '土屋昌次', '原昌胤', '山県昌景', '馬場信春', '武田勝頼']) { try { revealName(rt, n); } catch (e) { /* 名の無い将は飛ばす */ } }
      rt.after(3.6, () => { if (!F.ending && !rt.over && I.s === 1) rt.say('前田利家', '川向こうに武田の物見が出た。柵の外へ出て誘い出せ。深追いはするな', 4); });
    }
    return true;
  }
  // ② 柵の外、連吾川の手前へ。着くと武田の物見が段丘から下りて来る
  if (I.s === 1) {
    if (T < 7) return true;
    if (near(p, I.OUT, 9)) {
      I.s = 2; I.at = rt.t;
      I.g = c.black(() => enemyGroup(rt, { faction: 'takeda', name: '武田の物見', fixed: true, noGuard: true, anchor: { x: I.OUT.x + 40, z: I.OUT.z - 6 }, facing: -Math.PI / 2, fleeDir: { x: 1, z: 0 }, aggro: 22, width: 8, morale: 90, speed: 3.4 },
        [{ type: 'samurai', n: 1, o: { flag: 'takeda' } }, { type: 'ashigaru', n: 9, o: { flag: 'takeda' } }]));
      I.g.order = 'attack'; I.g.seekRange = 50; I.g.aggro = 30; I.g.focus = P;
      I.n0 = c.ready(I.g);
      try { sfx('toki', 0.6); } catch (e) { /* なし */ }
      rt.say('組頭', '来たぞ、武田の物見じゃ！　一当てして退くぞ', 3.2);
    }
    return true;
  }
  // 物見と槍を合わせる。遠くで待っただけの三十五秒を交戦に数えない。
  if (I.s === 2) {
    const down = I.n0 - c.ready(I.g);
    for (const u of I.g.units) {
      const target = u.atk?.target || u.swing?.target || u.target;
      if (u.alive && !u.fleeing && !u.gone && !u.woundOut && !u.rearWound && !u.noTarget &&
          target?.alive && target.team !== u.team && !target.gone && !target.fleeing &&
          !target.woundOut && !target.rearWound && !target.noTarget && target.pos &&
          near(u.pos, target.pos, 8) && !rt.army.wallBetween(u.pos, -1, target.pos)) {
        I.fight = (I.fight || 0) + dt;
        break;
      }
    }
    if (down >= 4 || I.fight > 35) {
      I.s = 3; I.at = rt.t;
      try { sfx('sig_nobiki', 1); } catch (e) { /* なし */ }
      rt.say('組頭', '退け！　柵の内へ駆け戻れ！', 2.8);
      I.g.seekRange = 70; I.g.aggro = 40; I.g.order = 'attack';
    }
    return true;
  }
  // ③ 柵の内へ駆け戻る。追って来た物見を柵の鉄砲が撃つ
  if (I.s === 3) {
    if (near(p, I.BACK, 9) && p.x < c.SB.x0 - 2) {
      I.s = 4; I.at = rt.t;
      c.nfGuns(rt, c.MOUTHS[0].z);
      try { sfx('volley', 1); } catch (e) { /* なし */ }
      rt.say('野々村正成', '放てっ！', 1.8);
      // 柵の前まで追った物見は鉄砲に倒れる（撃ち手の当たりに任せず、一斉射の結果として半分を倒す）
      let k = 0;
      for (const u of I.g.units) if (u.alive && u.pos.x < c.SB.x0 + 30 && (k++ % 2 === 0)) rt.army.kill(u, null);
    }
    return true;
  }
  // 残った物見は逃げ帰る。柵と鉄砲の守りを見届け、夜明けへ
  if (I.s === 4) {
    if (T > 2.5 && !I.fled) {
      I.fled = true;
      const q = I.g; q.noRout = false; q.morale = 0; q.routed = true; q.order = 'retreat'; q.dest = { x: 400, z: q.center().z }; q.fleeDir = { x: 1, z: 0 };
      for (const u of q.units) if (u.alive) u.fleeing = true;
      rt.say('前田利家', '見たか。柵から出ねば、鉄砲が守ってくれる', 3.4);
      rt.award((t) => { t.side.push('武田の物見を柵の前へ誘い出した'); }, '物見を誘い出した', I.BACK);
    }
    if (T > 8) {
      I.s = 9;
      for (const q of c.guns()) { q.fire = false; q.holdFire = true; }
      return false;
    }
    return true;
  }
  return false;
}
