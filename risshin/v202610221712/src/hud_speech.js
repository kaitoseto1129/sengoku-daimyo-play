import { S } from "./settings.js";
import { fieldLabel, $, esc } from "./hud_common.js";
import { goalText } from "./mission_guide.js";
import { battleSpeaker, battleSpeechAllowed } from "./speech_clean.js";
import { simpleControls } from "./simple_controls.js";



// 読み上げの下ごしらえ（呼ぶたびに作り直さない）
let jaVoice = null;

const VOICE_MAJOR = /信長|源八|大沢|藤吉郎|義元|日比野|稲田|師範|可成|光秀|利家|秀吉|磯野|豪盛|勝家|長可|信忠|長秀|一益|秀政|嘉隆|元正|信盛|秀隆|弥七/;

const VOICE_V = [[/藤吉郎|秀吉/, 1.25, 1.12], [/信長/, 0.9, 1.05], [/源八|大沢|師範|可成/, 0.8, 0.92], [/光秀/, 0.95, 0.95], [/利家/, 1.05, 1.05], [/弥七|与兵衛|足軽/, 1.1, 1.05], [/義元|豪盛|磯野/, 0.85, 0.95],
        [/勝家/, 0.78, 0.9], [/長可/, 0.82, 1.08], [/信忠/, 1.0, 1.0], [/長秀/, 0.9, 0.98], [/一益/, 0.88, 0.96], [/秀政|元正|信盛|秀隆/, 0.95, 1.0], [/嘉隆/, 0.85, 0.95]];

export class HudSpeech {


  // 台詞の読み上げ（ブラウザの音声合成。日本語の声があるときだけ）
  canSpeak(speaker) {
    if (!speaker || S.voice === 'off' || S.volume <= 0 || S.volVoice <= 0 || S.voice === 'major' && !VOICE_MAJOR.test(speaker) || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
    try { if (!jaVoice) jaVoice = speechSynthesis.getVoices().find((v) => /^ja(?:[-_]|$)/i.test(v.lang || '')) || null; return !!jaVoice; } catch (e) { return false; }
  }

  speak(speaker, text) {
    if (!this._voiceHook && window.speechSynthesis) { this._voiceHook = true; try { speechSynthesis.addEventListener('voiceschanged', () => { jaVoice = null; }); } catch (e) { /* 声の入れ替えを聞けない環境 */ } }
    if (!window.speechSynthesis) { if (S.voice !== 'off' && !this.voiceUnavailable) { this.voiceUnavailable = true; this.notices.push('この端末では声が使えません。台詞は字幕で読めます', 60, 4, 'info'); } return; }
    // 字幕が切り替わったら、前の声を待たせず片付ける。
    try { speechSynthesis.cancel(); } catch (e) { /* 声を止められなくても字幕を続ける */ }
    if (S.voice === 'off' || S.volume <= 0 || S.volVoice <= 0) return;
    const major = VOICE_MAJOR.test(speaker || '');
    if (S.voice === 'major' && !major) return;
    if (!speaker) return;
    try {
      if (!jaVoice) jaVoice = speechSynthesis.getVoices().find((x) => /^ja(?:[-_]|$)/i.test(x.lang || '')) || null;
      if (!jaVoice) { if (!this.voiceUnavailable) { this.voiceUnavailable = true; this.notices.push('日本語の声が使えません。台詞は字幕で読めます', 60, 4, 'info'); } return; }
      const u = new SpeechSynthesisUtterance(text.replace(/[「」（）]/g, ''));
      u.lang = 'ja-JP'; u.rate = S.voiceRate; u.volume = S.volume * S.volVoice;
      u.voice = jaVoice;
      // 人ごとの声の高さと速さ（源八は低くゆっくり、藤吉郎は高く速く、若い者は少し高く。織田家編の城下で出る上役もここで聞き分ける）

      const v2 = VOICE_V.find(([re]) => re.test(speaker));
      u.pitch = v2 ? v2[1] : 1;
      u.rate = S.voiceRate * (v2 ? v2[2] : 1);
      speechSynthesis.speak(u);
    } catch (e) { /* 読み上げできない環境 */ }
  }


  taskRepeats(speaker, text) {
    if (!this.rt) return false;
    const plain = (v) => String(v).replace(/[\s。、！？]/g, '');
    const key = plain(text);
    const same = (o) => {
      if (!o || o.state) return false;
      const task = plain(fieldLabel(goalText(this.rt, o.text)));
      // 行き先を添えた下知も、任務の全文を繰り返すなら札は一枚にする。
      if (!task) return false;
      if (key === task) return true;
      const guide = this.rt.missionGuide;
      const place = plain(fieldLabel(guide?.label || ''));
      return !!place && (key === task + place + 'の印を見よ' ||
        key === place + 'の印へ進め' + task ||
        key === place + 'は' + plain(guide?.floorHint || '') + task);
    };
    return this.rt.objectives.some(same) || same(this.rt.missionGuide?.objective);
  }


  // 組頭の道案内は、同じ行き先にいる間は言い直さない。
  instructionPlace(speaker, text, detail = null) {
    if (!detail?.task && !/組頭|近習/.test(speaker || text)) return null;
    const guide = this.rt?.missionGuide;
    const place = /(?:^|[「。！？])([^「」。！？]+?)の印(?:へ|を)/.exec(text);
    if (place) return this.notices.key(place[1]) + '|' + (guide?.floorHint || '');
    if (detail?.task) return this.notices.key(guide?.label || 'その場') + '|' + (guide?.floorHint || '');
    return null;
  }


  say(speaker, text, dur = 4, urgent = false, detail = null) {
    // 遊び手への括弧の説明は省かない。内部注は呼び出す側のデータで外す。
    text = String(text);
    const speakerUnit = battleSpeaker(this.rt, speaker, text);
    if (!battleSpeechAllowed(this.rt, speaker, text, speakerUnit)) return false;
    if (detail?.internalNotes) for (const note of detail.internalNotes) text = text.replace(`（${note}）`, '');
    // 長い台詞ほど長く出す。読み上げる時は、声が言い終わるまで出しておく（1 秒に 7 字ほど）
    dur = Math.max(dur, 1.2 + text.length * 0.11);
    if (this.canSpeak(speaker)) dur = Math.max(dur, 0.8 + text.length / (7 * (S.voiceRate || 1)));
    if (this.taskRepeats(speaker, text)) return false;
    const key = this.notices.key(text);
    if (!this.notices.repeatOk(text) || this.subQ.some((q) => q.key === key)) return false;
    const place = this.instructionPlace(speaker, text, detail);
    if (place !== null && place === this.commandPlace) return false;
    if (place !== null) this.commandPlace = place;
    const important = detail?.task || urgent || VOICE_MAJOR.test(speaker || '') || /伝令|使番|上官|下知/.test(speaker || '') || /任務|命令|下知|合図|守れ|守る|待て|退け|向かえ|進め|攻めよ|討て|救え|構え/.test(text);
    const line = { speaker, text, key, dur, important, goalKey: detail?.goalKey || null, queued: this.subSeq = (this.subSeq || 0) + 1, t: Math.floor(this.rt?.t || 0) };
    Object.defineProperty(line, 'speakerUnit', { value: speakerUnit });
    // 伝令の声は、待っている兵の声より先に読む。
    if (urgent || (speaker && /伝令|使番/.test(speaker))) this.subQ.unshift(line);
    else this.subQ.push(line);
    if (urgent) this.nextSub();
    this.log.push(line);
    if (this.log.length > 40) this.log.shift();
    if (important) { this.orderLog.push(line); this.updateLogEntry(); }
    // 読む速さは保つ。雑談から記録へ回し、下知と伝令は待ち列に残す。
    while (this.subQ.length > 7) {
      let i = this.subQ.findIndex((q) => !q.important);
      if (i < 0) { i = 0; for (let k = 1; k < this.subQ.length; k++) if (this.subQ[k].queued < this.subQ[i].queued) i = k; }
      this.subQ.splice(i, 1); this.subDrop = true;
    }
    if (!$('sublog').hidden) this.renderLog();
    return true;
  }


  // いまの台詞を読み終えたことにして、次の台詞へ
  nextSub() { window.speechSynthesis?.cancel(); if (this.shownLine) this.shownLine.remaining = ''; if (this.subT > 0.15) this.subT = 0.15; }


  updateLogEntry() {
    let unread = 0;
    // 一分より古い未読は数えない（数が増え続けて画面を塞がない）。記録には残る
    const nowT = Math.floor(this.rt?.t || 0);
    for (const line of this.orderLog) if (!line.read && nowT - line.t < 60) unread++;
    this.logEntry.hidden = unread === 0 || (!this.rt?.def.town && !this.rt?.def.dojo);
    this.logEntry.textContent = '報せを読む';
    this.logEntry.setAttribute('aria-label', `未読の下知・報せ${unread}件を読む`);
    // 釦の出入りや折り返しが変わったら、印が避ける範囲も測り直す。
    this.rectsT = 0;
  }


  renderLog() {
    const focused = document.activeElement?.id === 'log-close';
    for (const line of this.orderLog) line.read = true;
    this.updateLogEntry();
    const rows = [...new Set([...this.orderLog, ...this.log])].sort((a, b) => a.t - b.t);
    $('sublog').innerHTML = `<h5>会話の記録</h5><button type="button" class="btn" id="log-close" style="min-height:44px;margin-bottom:8px">記録を閉じる</button><p style="font-size:max(15px, calc(15px * var(--text-scale, 1)));line-height:1.6">読んでいる間も戦は進みます。安全な所へ退くか、一時停止して読んでください。通常の会話は直近40件まで。下知と伝令は戦の終わりまで残ります。上下に送って読めます。</p>${this.allyReport ? `<p>${esc(this.allyReport)}</p>` : ''}` + rows.map((l) => `<div><small>${Math.floor(l.t / 60)}分${l.t % 60}秒　${l.important ? '下知・報せ　' : ''}${!l.shown ? '字幕で未表示　' : ''}</small>${l.speaker ? `<span class="sp">${esc(l.speaker)}</span>` : ''}${esc(l.text)}</div>`).join('');
    $('log-close').onclick = (e) => { e.stopPropagation(); this.toggleLog(false); };
    if (focused) $('log-close').focus({ preventScroll:true });
  }


  toggleLog(on) {
    if (simpleControls(this.rt)) return;
    const el = $('sublog');
    el.hidden = typeof on === 'boolean' ? !on : !el.hidden;
    if (!el.hidden) { this.logOpener = document.activeElement; this.renderLog(); $('log-close').focus({ preventScroll:true }); }
    else { if (this.logOpener?.isConnected && !this.logOpener.hidden) this.logOpener.focus?.({ preventScroll:true }); else $('objectives').focus({ preventScroll:true }); this.allyReport = ''; }
  }
}
