// 城下の施設は章を追って開く（tarapon 5周目「合間にできる事が多すぎる」）。
// はじめは出陣と武具屋（装備）だけ。身分が届く前の物は出さない（「身分が足りない」を見せない）。
// G.battle は済ませた戦の数（織田家編：0 稲生の前・1 桶狭間の前・2 森部の前・3 墨俣の前）。
import { ladderStep } from './state.js';

export function townTabOpen(G, k) {
  if (!G) return true;
  // 試し・腕試し・大名で遊ぶ時は、これまでどおり全部
  if (G.practice || G.lord || G.trialStep != null) return true;
  const b = G.battle || 0, r = G.rank || 0;
  switch (k) {
    case 'boss': case 'shop': return true;
    case 'train': return b >= 2;
    case 'squad': case 'nagaya': return r >= 1;
    case 'toiya': return b >= 3;
    case 'people': case 'journal': return b >= 3;
    case 'realm': return r >= 2;
    case 'stable': return ladderStep(G) >= 2 || (G.horses || []).some((id) => id !== 'tsukikage');
    case 'inn': return false;   // 宿は無い。傷は戦の後に自動で癒える
    default: return true;
  }
}
