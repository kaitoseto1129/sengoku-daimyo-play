// K516 英語版：城下町（武具屋・問屋の札＝hub.js baseScreen の shop・toiya）の取り残し。英語の時だけ i18n.js が読む（日本語の時は読まない・重さ0）。クラウド 山崎の持ち主 11/21
export default [
  [/^印まで[\u200b]?歩け$/, () => 'Walk to the marker'],
  ['知行', 'Fief'], ['長屋', 'Row house'], ['短槍', 'Short spear'], ['桶側胴', 'Okegawa-do cuirass'],
  [/^まだ選んでいない：内政・家臣$/, () => 'Not chosen yet: domain and retainers'],
  ['柄を詰めた手槍。突きの戻りが速く、乱戦で扱いやすい（突きの間 15%短い・威力 −5%）', 'A hand spear with a shortened shaft. Quick to recover after a thrust and easy to handle in a melee (thrust interval 15% shorter, power −5%).'],
  ['頭形兜に金の前立。遠くからでも組の者が主を見つけられる（守り 12%）', 'A zunari helmet with a gilt crest. Your squad can spot their lord from afar (guard 12%).'],
  ['鉄板を桶のように綴じた朱威の胴。鉄砲玉も止めるが重く、走ると息が上がる（守り 25%・気力の減り +3割）', 'A red-laced cuirass of iron plates bound like a barrel. It stops bullets but is heavy and tires you when you run (guard 25%, stamina drain +30%).'],
  ['具足の上に羽織る陣羽織。組の者が主の姿を見て奮い立つ（組の士気 +5）', 'A surcoat worn over your armor. Your squad is roused by the sight of their lord (squad morale +5).'],
  ['信頼が上がる', 'Trust rises'], ['好感が上がる', 'Goodwill rises'], ['馬の手入れ', 'Horse care'], ['手入れする', 'Groom'],
  [/^馬の体力と息 \+(\d+)%$/, (m) => `Horse stamina and wind +${m[1]}%`],
  ['弥七の話を聞く', 'Listen to Yashichi'], ['召し抱える', 'Take into service'], ['今できる事は無い', 'Nothing to do right now'], ['振る舞い', 'Hospitality'],
  [/^次の戦：(.+)$/, (m, tr) => {
    let s = m[1];
    s = s.replace(/預かる組 (\d+)人/, 'Squad in your charge: $1').replace('手勢はまだいない。兵を集めると、次の戦で後ろに付く', 'no troops of your own yet; gather men and they will follow in the next battle')
      .replace(/村の兵(\d+)人/, '$1 village troops').replace(/米(\d+)石（米で体力＋十％）/, '$1 koku of rice (+10% stamina from rice)')
      .replace(/城の備えで体力＋(\d+)％/, 'castle defenses +$1% stamina').replace(/村の兵の突き＋(\d+)％/, 'village troops’ thrust +$1%')
      .replace(/。/g, '. ').replace(/・/g, ' · ');
    return 'Next battle: ' + s.trim();
  }],
  [/^戦の道のり。済：(.+)。次：(.+)。本拠：(.+)$/, (m, tr) => `Path of battles. Done: ${m[1] === 'まだない' ? 'none yet' : (() => { const w = tr(m[1]); return /[぀-鿿]/.test(w) ? (() => { const a = m[1].split('・'), o = []; for (let i = 0; i < a.length; i++) { const two = i + 1 < a.length ? tr(a[i] + '・' + a[i + 1]) : ''; if (two && !/[぀-鿿]/.test(two) && /[぀-鿿]/.test(tr(a[i]))) { o.push(two); i++; } else o.push(tr(a[i])); } return o.join(', '); })() : w; })()}. Next: ${tr(m[2])}. Base: ${tr(m[3])}`],
  ['右下の持ち替えの丸で持ち替え。速い斬撃、構えて突きの丸で突き。受け流しやすい', 'Switch with the swap button at lower right. Fast slashes; ready it and thrust with the thrust button. Easy to parry with.'],
  ['右下の持ち替えの丸で持ち替え。攻撃の釦を押し続けて狙い、離して撃つ。撃った後は自動で弾を込める。雨では火縄が湿る', 'Switch with the swap button at lower right. Hold the attack button to aim, release to fire. It reloads by itself. The match gets damp in rain.'],
  ['右下の持ち替えの丸で持ち替え。突きの丸を押して引き絞り、離して射る。遠くへは山なりに飛ぶ', 'Switch with the swap button at lower right. Hold the thrust button to draw, release to shoot. Arrows arc to reach far.'],
];
