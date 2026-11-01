// 戦が終わった時だけ作る札。外の画像・保存データは使わない。
import { SCENARIOS, RANKS } from './state.js';
import { metric } from './metrics.js';

const WIN_HISTORY = new Set(['inou', 'okehazama', 'moribe', 'inabayama', 'mitsukuri', 'anegawa', 'hieizan', 'shiga', 'tonezaka', 'odani', 'nagashima', 'shitaragahara', 'echizen', 'iwamura', 'tennoji', 'shigisan', 'kizugawa', 'miki', 'arioka', 'iga', 'tottori', 'takato', 'tano', 'nagashinojo', 'sune', 'tobinosu', 'suwahara', 'sekigahara']);
const RETREAT_HISTORY = new Set(['kanegasaki', 'mikatagahara', 'nodafukushima']);

export function sharedBattle(search, readyIds) {
  const id = new URLSearchParams(search).get('sen');
  if (!id || !readyIds.includes(id)) return null;
  for (const [scenario, s] of Object.entries(SCENARIOS)) {
    if (s.battles.some((b) => b.id === id && b.ready !== false)) return { scenario, id };
  }
  return null;
}

function historyLabel(id, won, lord) {
  if (lord && ['takato', 'echizen_ikko'].includes(id)) return '史実を変えた設定：信長自ら出陣';
  if (id === 'sunomata') return '伝えとの比較：史実の結末は確かではない';
  if (id === 'tedorigawa' || id === 'echizen_ikko') return '史実との比較：経過には説の違いがある';
  if (RETREAT_HISTORY.has(id)) return won ? '史実どおりの退き口（任務を達成）' : '史実と違う退き口（遊びの結末）';
  if (WIN_HISTORY.has(id)) return won ? '史実どおりの勝敗（遊びの結末）' : '史実を変えた勝敗（遊びの結末）';
  if (id === 'sanadamaru') return won ? '史実を変えた勝敗（遊びの結末）' : '史実どおりの勝敗（遊びの結末）';
  // 個人の生還や局地の任務だけでは、戦全体の史実を変えたと断定しない。
  return '史実との比較：個人の働きは遊びの創作';
}

export function makeSharecard(battle, G, row, battlefield) {
  const dead = battle.result?.dead === true;
  const won = battle.tracker.main === true && !dead && !battle.result?.down;
  if (!won && !dead) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const c = canvas.getContext('2d');
  // 個人の討死だけで、史実の戦の勝敗が変わったとはしない。
  const history = dead ? 'この最期は遊びの中の出来事です' : historyLabel(row.id, won, G.lord);
  const result = dead ? '討ち死に' : '勝ち（任務を達成）';
  const line = dead ? 'この名を、共に戦った者へ。' : '今日の働きを、一枚に残す。';
  const kills = Math.max(0, Math.floor(battle.stats.kills || 0));
  const link = `https://kaitoseto1129.github.io/sengoku-daimyo-play/risshin/?sen=${encodeURIComponent(row.id)}`;
  c.fillStyle = '#14120f'; c.fillRect(0, 0, 1200, 630);
  if (battlefield?.width && battlefield?.height) {
    const scale = Math.max(1200 / battlefield.width, 630 / battlefield.height);
    const w = battlefield.width * scale, h = battlefield.height * scale;
    c.drawImage(battlefield, (1200 - w) / 2, (630 - h) / 2, w, h);
  }
  c.fillStyle = 'rgba(20,18,15,.9)'; c.fillRect(24, 24, 860, 582);
  c.fillRect(24, 516, 1152, 90);
  c.strokeStyle = '#c2a25a'; c.lineWidth = 3; c.strokeRect(36, 36, 1128, 558);
  const text = (value, y, size, color = '#ece4d2') => {
    c.font = `bold ${size}px "Yu Mincho", "Hiragino Mincho ProN", serif`;
    c.fillStyle = color; c.fillText(value, 72, y, y >= 548 ? 1056 : 780);
  };
  text('戦国立身', 105, 44, '#c2a25a');
  text('戦果の札', 148, 24);
  text(row.name, 225, 56);
  text(row.year || battle.def.when || '年の記録なし', 273, 28);
  text(result, 342, 40);
  text(history, 394, 30, '#c2a25a');
  text(`自ら討ち取った数　${kills}人`, 451, 34);
  // 名乗りも札の画面では日本語の字だけ。入力の英字を画像に出さない。
  const name = String(G.name || '').replace(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヶ　 ]/gu, '').trim() || '名無し';
  const rank = G.lord ? String(G.lordTitle || '大名').replace(/[A-Za-z]/g, '') : (RANKS[G.rank] || RANKS[0]).name;
  text(`${name}　身分：${rank}`, 500, 32);
  text(line, 553, 30, '#c2a25a');
  text('名乗りと討ち取りの数は、遊びの記録です。', 586, 23);
  // 押す前に画像を用意し、共有時の端末の操作許可を保つ。
  const blob = new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { blob, canvas, link, id: row.id, result: dead ? 'dead' : 'win',
    description: `${row.name}、${result}。${name}、${rank}。自ら討ち取った数、${kills}人。${line}`,
    text: `戦国立身　${row.name}　${row.year || battle.def.when || '年の記録なし'}　${result}\n${name}　${rank}\n自ら討ち取った数 ${kills}人\n${line}\n${history}\n同じ戦を遊ぶ：${link}` };
}

export function mountSharecard(card, host) {
  if (!host || card.mounted) return;
  card.mounted = true;
  // 絵は巻物の中へ。携帯の下の操作帯を大きくしない。
  host = host.closest('.ev2')?.querySelector('.ev-body') || host;
  const box = document.createElement('details');
  box.className = 'ek-more';
  const summary = document.createElement('summary');
  summary.textContent = '戦果の札を残す・送る';
  box.appendChild(summary);
  card.canvas.style.cssText = 'display:block;width:100%;height:auto';
  card.canvas.setAttribute('role', 'img');
  card.canvas.setAttribute('aria-label', card.description);
  // 評定の Enter で次へ進む処理に、リンクと共有の操作を渡さない。
  box.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') ev.stopPropagation(); };
  box.onclick = (ev) => ev.stopPropagation();
  const button = document.createElement('button');
  button.className = 'btn small'; button.style.minHeight = '44px';
  button.textContent = 'この絵を残す／送る'; button.disabled = true;
  button.onkeydown = (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') ev.stopPropagation();
  };
  const status = document.createElement('span');
  status.setAttribute('role', 'status'); status.style.fontSize = '15px';
  status.textContent = '札を用意しています';
  box.append(card.canvas, button, status);
  const other = host.querySelector('#ev-other-actions');
  if (other) host.insertBefore(box, other); else host.appendChild(box);
  let file = null;
  card.blob.then((blob) => {
    if (!blob) { status.textContent = '札を作れませんでした。この戦をやり直してお試しください。'; return; }
    file = new File([blob], '戦国立身・戦果の札.png', { type: 'image/png' });
    button.disabled = false; status.textContent = '';
  }).catch(() => { status.textContent = '札を作れませんでした。この戦をやり直してお試しください。'; });
  const download = () => {
    const url = URL.createObjectURL(file), a = document.createElement('a');
    a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    status.textContent = '絵の保存を始めました';
    metric('share', { method: 'save', content_type: 'battle_result', item_id: card.id, result: card.result });
  };
  button.onclick = async (ev) => {
    ev.stopPropagation(); button.disabled = true;
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '戦国立身の戦果', text: card.text });
        status.textContent = '絵を送りました';
        metric('share', { method: 'web_share', content_type: 'battle_result', item_id: card.id, result: card.result });
      } else download();
    } catch (e) {
      if (e.name === 'AbortError') status.textContent = '共有をやめました';
      else {
        try { download(); } catch (_) { status.textContent = '保存できませんでした。もう一度押してください。'; }
      }
    } finally { button.disabled = false; }
  };
}
