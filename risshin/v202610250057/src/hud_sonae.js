import { sonaeCardsRoot, SONAE_ALERT, $, sonaeCardRow, yasenHudRoot, YASEN_BANDS, esc } from "./hud_common.js";
import { viewLevel, playerSonae } from "./senkyo.js";
import { sightRef } from "./battle_sight.js";
import { VIEW } from "./viewport.js";

export class HudSonae {


  // ---- 束6（59 章）：備の札。足軽大将以上だけ、画面の隅に自分の備を一枚。隣・後詰・本陣は崩れ・危機の時だけ 6 秒 ----
  sonaeCards(rt) {
    const el = sonaeCardsRoot();
    if (rt.over || viewLevel(rt) < 2) { el.hidden = true; return; }
    const own = playerSonae(rt);
    if (!own || own.b.aliveNominal() <= 0) { el.hidden = true; return; }
    this._scAlert = this._scAlert || new Map();
    const now = rt.t || 0;
    const ALERT = SONAE_ALERT;
    const neigh = this._scNeighbors || (this._scNeighbors = []);
    neigh.length = 0;
    const left = own.left(), right = own.right(), behind = own.behind();
    if (left) neigh.push(left);
    if (right) neigh.push(right);
    if (behind) neigh.push(behind);
    for (const S of neigh) if (sightRef(rt, S, S.b.pos) && ALERT.has(S.state)) this._scAlert.set(S.id, now + 6);
    // 組の札がある間、平常の備は号令を開いた時だけ。危機の札は残す。
    const showOwn = $('h-squad').hidden || rt.player?.cmdOpen || ALERT.has(own.state);
    const rows = this._scRows || (this._scRows = []);
    rows.length = 0;
    if (showOwn) rows.push(sonaeCardRow(own, ALERT.has(own.state)));
    for (const S of neigh) {
      const limit = VIEW.h > 620 ? ($('subtitle').textContent ? 1 : $('h-squad').hidden ? 3 : 2) : 1;
      if (rows.length >= limit) break;
      if (!sightRef(rt, S, S.b.pos)) continue;
      const until = this._scAlert.get(S.id);
      if (until != null && now < until) rows.push(sonaeCardRow(S, true));
    }
    el.hidden = rows.length === 0;
    const key = rows.join('');
    if (this._scKey !== key) { this._scKey = key; el.innerHTML = key; }
  }


  // ---- 野戦陣地の HUD（長篠・設楽原 統合版 60〜62 章）：rt.flags.hudBands（鉄砲の一手を預かる者の班の READY%）・
  //   rt.flags.hudZone（侍大将の、自分のいる区画の柵の細いゲージ）がある時だけ出す。設楽原専用でなく、同じ形を渡せばどの野戦でも出る
  yasenHud(rt) {
    const F = rt.flags;
    const el = yasenHudRoot();
    if (!F.hudBands && !F.hudZone) { el.hidden = true; return; }
    el.hidden = false;
    const rows = this._yhRows || (this._yhRows = []);
    rows.length = 0;
    if (F.hudBands) for (const k of YASEN_BANDS) {
      const b = F.hudBands[k];
      if (b) rows.push(`<div class="yb"><b>${k === 'A' ? '一' : k === 'B' ? '二' : '三'}班</b><span>${b.state}</span><i>${b.pct}%</i></div>`);
    }
    if (F.hudZone) {
      const z = F.hudZone;
      rows.push(`<div class="yz${z.breach ? ' warn' : ''}"><b>${esc(z.name)}防御線</b><span>馬防柵 ${z.pct}%</span><div class="bal"><i style="width:${Math.max(0, Math.min(100, z.pct))}%"></i></div>${z.breach ? '<small>柵破られる</small>' : ''}</div>`);
    }
    const key = rows.join('');
    if (this._yhKey !== key) { this._yhKey = key; el.innerHTML = key; }
  }
}
