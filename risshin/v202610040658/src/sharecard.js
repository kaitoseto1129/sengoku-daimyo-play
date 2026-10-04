// 戦が終わった時だけ作る札。外の画像・保存データは使わない。
import { SCENARIOS } from './state.js';

const WIN_HISTORY = new Set(['okehazama', 'moribe', 'inabayama', 'mitsukuri', 'anegawa', 'hieizan', 'shiga', 'tonezaka', 'odani', 'nagashima', 'shitaragahara', 'echizen', 'iwamura', 'tennoji', 'shigisan', 'kizugawa', 'miki', 'arioka', 'iga', 'tottori', 'takato', 'tano', 'nagashinojo', 'sune', 'tobinosu', 'suwahara', 'sekigahara']);
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
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const c = canvas.getContext('2d');
  const won = battle.tracker.main === true && !battle.result?.dead && !battle.result?.down;
  const history = historyLabel(row.id, won, G.lord);
  const result = won ? '勝ち（任務を達成）' : '負け（任務を果たせず）';
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
  text(`名乗り　${name}`, 500, 32);
  text('勝ち負けは任務の成否。名乗りと討ち取りの数は遊びの記録です。', 548, 23);
  text('同じ戦の練習へ招く札', 581, 22);
  // 押す前に画像を用意し、共有時の端末の操作許可を保つ。
  const blob = new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { blob, link, text: `戦国立身　${row.name}　${result}\n${history}\n自ら討ち取った数 ${kills}人\n同じ戦を練習する：${link}` };
}

export function mountSharecard(card, host) {
  if (!host) return;
  const box = document.createElement('div');
  // 評価の下の帯でも別の行を取る。用語の釦と主の操作の横へ割り込まない。
  box.style.cssText = 'display:flex;flex:0 0 100%;box-sizing:border-box;max-width:100%;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px';
  const button = document.createElement('button');
  button.className = 'btn small'; button.style.minHeight = '44px';
  button.textContent = '戦果を保存・共有'; button.disabled = true;
  button.onkeydown = (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') ev.stopPropagation();
  };
  const status = document.createElement('span');
  status.setAttribute('role', 'status'); status.style.fontSize = '15px';
  status.textContent = '札を用意しています';
  box.append(button, status); host.appendChild(box);
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
    status.textContent = '戦果の札を保存しました';
  };
  button.onclick = async (ev) => {
    ev.stopPropagation(); button.disabled = true;
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: '戦国立身の戦果', text: card.text });
        status.textContent = '戦果の札を共有しました';
      } else download();
    } catch (e) {
      if (e.name === 'AbortError') status.textContent = '共有をやめました';
      else {
        try { download(); } catch (_) { status.textContent = '保存できませんでした。もう一度押してください。'; }
      }
    } finally { button.disabled = false; }
  };
}
