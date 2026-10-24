import { S } from "./settings.js";
import { sfx } from "./audio.js";
import { taskDetail, $, BARK_FAMILY, fieldLabel, tensionCss } from "./hud_common.js";
import { isTouch } from "./touch.js";
import { VIEW } from "./viewport.js";
import { sightUnit, sightScreenUnit } from "./battle_sight.js";
import { taskText } from "./mission_guide.js";
import { battleDialogueMuted } from './speech_clean.js';

// 戦の画面では、知らせ・見出し・連撃の字を出さない（kaito 10/23「無駄なものが多すぎる」）。
const fieldScreen = (rt) => !!rt?.def && !rt.def.town && !rt.def.dojo;

export class HudFeedback {


  // 戦功の通知（同じ項目が続いたらまとめる）
  toast(pts, label) {
    // 「大事なものだけ」なら小さな戦功は出さない
    if (S.toastLevel === 'important' && pts !== 0 && Math.abs(pts) < 5) return;
    const big = pts >= 25;
    if (big) sfx('taiko', 0.55);
    this.notices.push(pts === 0 ? label : label, big || pts === 0 ? 75 : 40, 2.7);
  }


  // 見出しも共通の三枠で出す。古い待ち見出しは短い報せへ回す。
  banner(text, sub = '') {
    if (fieldScreen(this.rt)) return;
    sub = taskDetail(text, sub);
    // 決着の知らせは、すでに終わった寄せや下知の見出しを待たせない。
    // 決着後の重傷などは残すため、古い列を片付けるのは一戦に一度だけ。
    const rt = this.rt;
    if (rt && (rt.over || rt.flags.ending || !rt.player.u.alive) && this.bannerEndingRt !== rt) {
      this.bannerEndingRt = rt; this.bannerEndReason = text;
      this.root.classList.add('ending');
      for (const el of this.markerEls.values()) el.hidden = true;
      this.bannerQ.length = 0; this.bannerT = 0;
      $('banner').classList.remove('show');
    }
    if (rt) {
      for (let i = this.bannerQ.length - 1; i >= 0; i--) if (this.bannerQ[i].phase !== rt.phase || /救援|囲み/.test(text) && /救援|囲み/.test(this.bannerQ[i].text)) this.bannerQ.splice(i, 1);
    }
    if (rt && this.bannerEndingRt === rt) {
      if (text === '重傷' || text === '討死') {
        const previous = this.bannerQ[this.bannerQ.length - 1]?.text || this.bannerEndReason;
        if (previous && previous !== text && previous !== '重傷' && previous !== '討死') sub = sub ? `${sub}。${previous}` : previous;
        this.bannerEndReason = text;
        this.bannerQ.length = 0; this.bannerT = 0; $('banner').classList.remove('show');
      } else if (this.bannerEndReason === '重傷' || this.bannerEndReason === '討死') return;
    }
    const key = this.notices.key(sub ? text + '\n' + sub : text);
    if (this.bannerQ.some((q) => q.key === key)) return;
    if (!this.notices.repeatOk(sub ? text + '\n' + sub : text)) return;
    if (rt?.def?.latestPhaseBanner) {
      this.bannerQ.length = 0;
      if (this.bannerPhase !== rt.phase) { this.bannerT = 0; $('banner').classList.remove('show'); }
    }
    this.bannerQ.push({ text, sub, key, phase: rt?.phase, at: this.notices.clock });
    // 表示中の一つに加えて待ちは二つまで。古い出来事を捨てず、
    // 新しい下知を何枚もの大見出しの後ろで待たせない。
    if (this.bannerQ.length > 2) {
      const old = this.bannerQ.shift();
      this.notices.push(old.sub ? old.text + '\n' + old.sub : old.text, 75, 2.6);
    }
  }


  flash(text, tone = 'gold') {
    if (fieldScreen(this.rt)) return;
    // 戦の中の小さな助言（dim）は字を出さない（字は使わない。kaito 10/23 稲生 35）。
    if (tone === 'dim' && this.rt && !this.rt.def.town && !this.rt.def.dojo) return;
    text = this.terse(text);
    if (/^外れた/.test(text)) { const ch = $('crosshair'); if (ch) { ch.classList.remove('gmiss'); void ch.offsetWidth; ch.classList.add('gmiss'); } }
    this.notices.push(text, tone === 'dim' ? 30 : 85, 1.8, tone === 'dim' ? '' : 'warn');
  }


  // 部下などの短い声
  // 同じ文の二分制限とは別に、似た知らせ（騎馬が止まった・敵が崩れた…）をまとめて間引く。
  // 立て続けの知らせは、警告でないものから間引く（docs/ui-guidelines.md）
  // 出してよい知らせか（出すかどうかだけを見る。記録はしない）。呼ぶ側が先に見て、出さない物は呼ばないようにも使える
  barkOk(text, warn = false) {
    if (battleDialogueMuted(this.rt)) return false;
    // 間は戦の中の時で数える（機械が重くて戦がゆっくり進む時も、戦の20秒に同じ知らせを何度も出さない）
    const now = this.notices.clock * 1000;
    if (!this.barkSeen || this.barkRt !== this.rt) { this.barkSeen = new Map(); this.barkCounts = new Map(); this.barkTimes = []; this.barkRt = this.rt; }
    const fam = BARK_FAMILY.find(([re]) => re.test(text));
    if (!this.notices.repeatOk(this.terse(text))) return false;
    const key = fam ? fam[1] : 'text:' + this.terse(text);
    if (fam?.[3] && (this.barkCounts.get(key) || 0) >= fam[3]) return false;
    const gap = fam ? (fam[2] ? fam[2] * 1000 : (warn ? 12000 : 30000)) : 8000;
    if (now - (this.barkSeen.get(key) ?? -1e9) < gap) return false;
    if (this.barkSeen.size > 80) for (const [k, time] of this.barkSeen) if (k.startsWith('text:') && now - time >= 30000) this.barkSeen.delete(k);
    let barkCount = 0;
    for (const t of this.barkTimes) if (now - t < 4000) this.barkTimes[barkCount++] = t;
    this.barkTimes.length = barkCount;
    if (!warn && this.barkTimes.length >= 2) return false;
    return { now, key, limited: !!fam?.[3] };
  }

  // 戦の中の字を短く：指の端末では、キーやマウスの言い添え（「右で構えて〜」「Z で〜」）を落とす。
  // 小さな画面（iPhone 横）では、括弧の中の言い添えも落とす（中身は印と音で伝わる）
  terse(text) {
    let t = String(text);
    if (isTouch) t = t.replace(/　[^　]*(右で|左で|クリック|キー|[A-Z] で|Tab|Shift|Space)[^　]*$/, '').replace(/（[^）]*(クリック|キー|[A-Z] で|Tab|Shift)[^）]*）/g, '');
    if (isTouch && VIEW.h < 500) t = t.replace(/（[^）]{6,}）/g, '');
    return t.trim() || String(text);
  }

  warningValid(text, rt) {
    if (!rt || rt.over || !rt.player.u.alive) return false;
    const p = rt.player, u = p.u;
    if (/味方の列へ下がれ/.test(text)) return u.mobbed || u.hp < u.maxHp * 0.55;
    if (/一太刀|お命|倒れる/.test(text)) return u.hp / u.maxHp < 0.3;
    if (/囲まれるぞ/.test(text)) return rt.army.playerMobSoon >= rt.army.time - 4 || !!u.mobbed;
    if (/囲ま|囲み/.test(text)) return u.mobbed || (rt.encircle?.lv || 0) > 0;
    if (/動揺|怯えて|怯えておる|心が乱れて/.test(text)) return rt.squadGroups.some((g) => g.count > 0 && g.morale < 45);
    if (/組と離れ/.test(text)) { const g = rt.squadGroups.find((g) => g.count > 0); return !!g && Math.hypot(g.center().x - u.pos.x, g.center().z - u.pos.z) > 38; }
    if (/矢玉|鉄砲|射手|後ろだ|構えて下がれ/.test(text)) return p.inCombatT > 0 || (rt.aimedT || 0) > 0 || (rt.army.threats || []).length > 0;
    // 一度起きた出来事の報せは待ち列の三秒の期限だけで扱う。
    return true;
  }


  bark(text, warn = false) {
    const ok = this.barkOk(text, warn);
    if (!ok) return;
    const place = this.instructionPlace('', text);
    if (place !== null && place === this.commandPlace) return;
    if (place !== null) this.commandPlace = place;
    const { now, key, limited } = ok;
    if (key !== null) this.barkSeen.set(key, now);
    if (limited) this.barkCounts.set(key, (this.barkCounts.get(key) || 0) + 1);
    this.barkTimes.push(now);
    const fatal = warn && /一太刀|お命|倒れる|深手|囲まれた|矢玉|鉄砲|筒先|火縄|後ろだ|構えて下がれ|味方の列へ下がれ/.test(text);
    const rt = this.rt;
    let advice = text;
    if (warn && rt && rt.def.key !== 'tennoji' && /囲まれた|四方から敵|後ろにも敵|取り籠め/.test(text)) {
      let together = false;
      for (const u of rt.army.units) {
        if (u !== rt.player.u && u.team === rt.player.u.team && u.alive && !u.gone && !u.fleeing && !u.woundOut &&
            !u.noTarget && !u.civ && !u.isStruct && Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < 4 && sightUnit(rt, u)) {
          together = true; break;
        }
      }
      advice = together ? this.defendEnemy && sightScreenUnit(rt, this.defendEnemy) ? rt.player.weapon === 'spear' ? '敵にやりを向けよう' : '敵へ向こう' : '味方のそばで かまえる' : '味方とならぼう';
    }
    this.notices.push(this.terse(advice), fatal ? 110 : warn ? 85 : 20, 2.2, warn ? 'warn' : '', warn ? () => this.rt === rt && this.warningValid(text, rt) : null);
    rt?.warSpeech?.bark(text);
  }


  // ヒント：手ほどきと同じ札に出す（札は一度に一つ。ヒントの間は手ほどきを少し休む）
  hint(text, keys, ms) {
    if (fieldScreen(this.rt)) return;   // 戦の画面では操作の手ほどきの札を出さない（kaito 10/23）。
    // 開戦の題字（#intro）が出ている間は待たせる（携帯で題字の上に札が重なっていた。見回り 10/2）
    clearTimeout(this.hintDefer);
    // 待ち直すだけの呼び出しを、新しいヒントとして記録しない。
    const ready = () => {
      const io = $('intro'), bn1 = $('banner');
      if ((io && !io.hidden) || (bn1 && bn1.classList.contains('show') && this.bannerT > 0)) { this.hintDefer = setTimeout(ready, 800); return false; }
      return this.showHint(text, keys, ms);
    };
    return ready();
  }

  showHint(text, keys, ms) {
    if (this.notices.clock < (this.nextHintAt ?? -99) || !this.notices.repeatOk(text, true)) return false;
    this.nextHintAt = this.notices.clock + 8;
    this.hintCur = { text, keys };
    clearTimeout(this.hintTimer);
    // 低い画面（スマホ横）では上の真ん中に短く出して、5 秒で消す（技の札のように長い物は ms で長く）
    this.hintTimer = setTimeout(() => { this.hintCur = null; this.drawCard(); }, ms || (VIEW.h < 500 ? 5000 : 6500));
    this.drawCard();
    return true;
  }

  hintBusy() { return !!this.hintCur; }


  goalChanged(rt, guide) {
    const key = guide.key;
    const text = fieldLabel(taskText(rt, guide.objective.text));
    // 古い案内は待ち列から外し、史実の会話は会話の記録に残す。
    for (let i = this.subQ.length - 1; i >= 0; i--) if (this.subQ[i].goalKey) this.subQ.splice(i, 1);
    if (this.shownGoalKey && this.shownGoalKey !== key) { this.subT = 0; this.shownGoalKey = null; window.speechSynthesis?.cancel(); }
    // 行き先や文が続けて変わっても、点灯と音は十秒以上あける。
    if (rt.t - (this.goalSignalAt ?? -99) >= 10) {
      this.goalSignalAt = rt.t; this.goalFlashUntil = rt.t + 1.6;
      // 目的が変わる合図は陣太鼓の一打ち（電子音・法螺貝は緊張を削ぐ。テストプレイの声 10/24）。
      sfx('taiko', 0.5);
    }
    const line = rt.def.taskText ? text : guide.floorHint ? `${guide.label}は${guide.floorHint}。${text}` :
      guide.marker ? `${text}。${guide.label}の印を見よ。` : text;
    this.say(rt.G.lord ? '近習' : '組頭', line, 4, true, { task: true, goalKey: key });
  }


  // 連撃の数
  combo(n) {
    if (fieldScreen(this.rt)) return;
    const el = $('combo');
    el.hidden = false;
    el.textContent = `${n} 連撃`;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(this.comboTm);
    this.comboTm = setTimeout(() => { el.hidden = true; }, 1600);
  }


  // 討ち取った印
  killMark() {
    if (!this.rt?.def.dojo) return;
    if (!this.killHelp) { this.killHelp = true; this.notices.push('稽古相手を倒した', 30, 4); }
    const el = $('killmark');
    el.hidden = false;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(this.killTm);
    this.killTm = setTimeout(() => { el.hidden = true; }, 700);
  }


  // 討った場所に小さく戦功を浮かべる
  floatText(pos, text, neg) {
    if (this.rt && !this.rt.def.town && !this.rt.def.dojo) return;
    if (!S.floatMerit || !pos) return;
    this.floats = this.floats || [];
    const el = document.createElement('div');
    el.className = 'floatm' + (neg ? ' neg' : '');
    el.textContent = /^[＋+−-]?\d+$/.test(String(text)) ? `戦功 ${text}点` : text;
    $('floats').appendChild(el);
    this.floats.push({ el, pos: { x: pos.x, y: pos.y, z: pos.z }, t: 0 });
  }


  hitMarker(blocked = false) {
    // 桶狭間の命中は当たった本人の赤い▼で返す。字と中央の印を増やさない。
    if (this.rt?.def.key === 'inou' || this.rt?.def.key === 'okehazama' || this.rt?.def.key === 'moribe') return;
    const c = $('crosshair');
    c.classList.toggle('blocked-hit', blocked);
    c.setAttribute('aria-label', blocked ? '防がれた一撃' : '当たった一撃');
    c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit');
  }


  damageNotice(angle, src, kind) {
    const word = kind === 'gun' ? '鉄砲' : kind === 'arrow' ? '矢' : (src?.wpnKind || src?.lookWeapon || src?.weapon) === 'spear' ? '槍' : '';
    const visible = src && !src.isStruct && this.rt && sightUnit(this.rt, src);
    // 実際に命が減った時だけ残す。防御成功や予告を被弾の形で知らせない。
    if (src?.pos && !src.isStruct) {
      this.damageDirectionYaw = angle + this.rt.player.yaw;
      this.damageDirectionUntil = this.rt.t + 1.8;
    }
    const direction = Math.cos(angle) > 0.5 ? '前' : Math.cos(angle) < -0.5 ? '後ろ' : Math.sin(angle) > 0 ? '左' : '右';
    // 傷を受けた後の札。姿が見えなくても受けた一撃と退く動きを伝える。
    if (!src?.pos && !word) return;
    const hit = word === '槍' ? '槍で突かれた' : word === '鉄砲' ? '鉄砲で撃たれた' : word === '矢' ? '矢を受けた' : '一撃を受けた';
    const retreat = this.rt?.def.damageRetreatNeeded?.(this.rt) ?? true;
    if (this.rt && retreat) this.rt.retreatUntil = Math.max(this.rt.retreatUntil || 0, this.rt.t + 3);
    const action = retreat ? this.rt?.def.damageRetreatText || '味方の後ろへ下がれ' : word === '矢' || word === '鉄砲' ? '物陰で矢玉を避けよ' : '敵へ向いて構えよ';
    this.notices.push((visible ? direction + 'から' : '') + hit + '。' + action, 85, 3);
  }


  damageFrom(angle, amount = 8) {
    // 斬られた側の画面の縁を赤く
    const vg = $('vignette');
    vg.style.setProperty('--hx', `${50 - Math.sin(angle) * 45}%`);
    vg.style.setProperty('--hy', `${50 - Math.cos(angle) * 45}%`);
    vg.classList.remove('side'); void vg.offsetWidth; vg.classList.add('side');
    // 実際の被弾の山形は命が減った後の damageNotice で残す。
  }


  hurt(v) { this.hurtT = Math.max(this.hurtT, v); }


  // 倒れる寸前の一撃：一瞬白く飛び、闇が画面を覆って引いていく（battle.js の brink から）
  brink() {
    tensionCss();
    let el = $('brinkfx');
    if (!el) { el = document.createElement('div'); el.id = 'brinkfx'; $('vignette').after(el); }
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
}
