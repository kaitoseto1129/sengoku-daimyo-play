// 名のある武将の具足を戦の年で替える（出所は docs/bushou_look_1102.md）。
// 伝来品が作られた年より前の戦では、その品の立物・胴を着せない。形は今ある立物と胴の作りを使い回す（新しい形・材質は作らない）。
import { KACCHU } from './kacchu_data.js';

// [名, この年より前なら, 重ねる値]
const ERA = [
  // 歯朶具足（久能山東照宮）は関ヶ原（1600）以後。前の水牛脇立・朱の面頬は徳川美術館の熊毛植黒糸威具足を手本とする復元案。
  // docs/generals_look_1108/徳川家康.md。若い頃へ歯朶具足の素懸威・三段錣を持ち込まない。
  ['徳川家康', 1600, { crest: 'bull', plateDo: null, doStyle: 'hotoke', menpo: 0x9c2e21, sodeStyle: undefined, shikoroStyle: undefined, shikoroRows: undefined }],
];
const cache = new Map();
export function eraKacchu(name, year) {
  if (!name || !year) return null;
  // 真田宝物館の伝昌幸所用・昇梯子具足による復元。織田編の表へは戻さない。
  // 江戸期の修理色と当初の推定を区別する。出所：docs/generals_look_1108/真田昌幸.md。
  if (name === '真田昌幸' && year >= 1590 && KACCHU[name]) {
    const key = name + '|昇梯子';
    if (!cache.has(key)) cache.set(key, { ...KACCHU[name],
      bowl: 'toppai', crest: 'masayuki_tensho', hat: 'kabuto', hatFix: 1,
      armor: 0x1c1a1a, helm: 0x1c1a1a, lac: 'kuro', fuki: 'kuro',
      lace: 0x8a6a3a, odo: 0x8a6a3a, preserveLace: true,
      doStyle: 'hotoke', plateDo: 'hotoke', doOpening: 'nimai', ladderMon: true,
      shikoroStyle: 'kebiki', shikoroRows: 5, sodeStyle: 'kebiki',
      kusazuriCount: 7, kusazuriLaceRows: 4,
      menpo: 0x9c2e21, menpoStyle: 'hanbo', menpoScan: null,
      haori: 0, horo: 0, fur: 0, mon: 'sanada', flag: 'sanada', uma: null, ref: '',
    });
    return cache.get(key);
  }
  // 所用具足は未確認。関ヶ原だけ敦賀市立博物館蔵の容斎屏風に寄せる（後世の描写）。
  // 忍城・小田原へ頭巾姿を持ち込まない。出所：docs/generals_look_1108/大谷吉継.md。
  if (name === '大谷吉継' && year >= 1582 && KACCHU[name]) {
    const late = year >= 1600, key = name + (late ? '|浅葱頭巾' : '|当世具足');
    if (!cache.has(key)) cache.set(key, { ...KACCHU[name],
      bowl: 'zunari', crest: 'none', hat: late ? 'kato' : 'kabuto', hatFix: 1,
      armor: 0x1c1a1a, helm: 0x1c1a1a, lac: 'kuro', fuki: 'kuro',
      lace: 0x1c1a1a, odo: 0x1c1a1a, preserveLace: true,
      doStyle: 'okegawa', plateDo: null, haori: 0, horo: 0,
      menpo: late ? 0x9c2e21 : 0, menpoStyle: 'hanbo', menpoScan: null,
      mon: 'none', flag: 'otani', ref: '',
      // 小袖と裹頭の既存部品を共用。袈裟・剃髪・兜・胴鎧は付けない。
      ...(late ? { sohei: 1, soheiV: 9, kosode: 1, monk: 0, tier: 0,
        cloth: 0xe6e0d0, kosodeCol: 0xe6e0d0, kato: 0x78aeb8,
        kesa: 0, kote: 0, sode: false, haramaki: false, tenugui: false, trim: 0, left: null } : {}),
    });
    return cache.get(key);
  }
  // 秀吉だけ、織田編の後から分ける。出所と復元の範囲は docs/generals_look_1108/羽柴秀吉.md。
  // 銀伊予札の具足は天正十八年の政宗拝領品。以前の戦での着用は断定しない。
  if ((name === '羽柴秀吉' || name === '豊臣秀吉') && year >= 1582 && KACCHU[name]) {
    const late = year >= 1590, key = name + (late ? '|銀伊予札' : '|羽柴期');
    if (!cache.has(key)) cache.set(key, { ...KACCHU[name],
      bowl: late ? 'zunari' : 'suji', crest: 'none', hat: 'kabuto', hatFix: 1,
      armor: late ? 0xb8b7ae : 0x22201c, helm: 0x16120f,
      lace: 0xe4dfcc, odo: 0xe4dfcc, preserveLace: true, doStyle: late ? 'kebiki' : 'sugake',
      plateDo: null, doOpening: late ? 'right' : '',
      fur: late ? 0x171512 : 0, kumage: late, shinodare: false,
      haori: 0, horo: 0, menpo: late ? 0xa62b1d : 0, menpoStyle: 'hanbo',
      cloth: late ? 0x8e2b24 : 0x2b2622, haidateGold: false,
      mon: late ? 'toyotomi' : 'none', ref: '',
    });
    return cache.get(key);
  }
  // 小牧・長久手と関ヶ原の忠勝。現存所用具足による復元（当日の着用は未確認）。
  // docs/generals_look_1108/本多忠勝.md。織田編の共通表は変えない。
  if (name === '本多忠勝' && year >= 1582 && KACCHU[name]) {
    const key = name + '|所用具足';
    if (!cache.has(key)) cache.set(key, { ...KACCHU[name],
      bowl: 'suji', sujiPlates: 12, shinodare: false, fukigaeshiBadge: false,
      crest: 'honda_shikami', hat: 'kabuto', hatFix: 1,
      doStyle: 'sugake', doOpening: 'nimai', plateDo: null,
      lace: 0x1c1a1a, odo: 0x1c1a1a, preserveLace: true,
      sodeStyle: 'sugake', shikoroStyle: 'sugake', shikoroRows: 4,
      shikoroLace: 0x1c1a1a, menpo: 0x45372d, menpoStyle: 'hanbo',
      haori: 0, juzu: true, juzuGold: true,
    });
    return cache.get(key);
  }
  for (const [n, y, v] of ERA) {
    if (n !== name || year >= y || !KACCHU[n]) continue;
    const key = n + '|' + y;
    if (!cache.has(key)) cache.set(key, { ...KACCHU[n], ...v });
    return cache.get(key);
  }
  return null;
}
