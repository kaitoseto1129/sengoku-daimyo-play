// 史実に合わせた天気と、戦の途中の移ろい（kaito 11/1「天気と時刻」）。
// 雨・霧・夕暮れの見え方と遊びへの効き（鉄砲の湿り・ぬかるみの足・見通し）は既存の作り
// （world_update・weather_gameplay・terrain_tags）がそのまま受ける。ここは「いつ・どれだけ」だけを決める。
// 天気の筋書きを自前で持つ戦（桶狭間の豪雨・森部・木目峠・大河内・手取川・刀根坂）はここに書かない。
//   mist：朝霧・川霧（一分ほどで晴れていく）
//   wet：前夜の雨で湿った土（0〜1。足が重く、土煙が立たない）
//   rain：[[秒, 雨の強さ 0〜1], …] 戦の途中で雨を強める・弱める（強い雨は火縄を湿らせる）
//   dusk：その秒で日が傾き、六十秒かけて夕暮れへ
const PLAN = {
  // 関ヶ原：前夜からの雨で野は泥、朝は濃い霧で敵味方が見えなかった。
  sekigahara: { mist: true, wet: 0.6 },
  // 設楽原：梅雨どきで前夜も雨。土は湿るが、当日の雨は無い（鉄砲は撃てる）。
  shitaragahara: { wet: 0.45 },
  // 姉川：夜明けの川霧の中で始まった。
  anegawa: { mist: true },
  // 小谷：嵐は八月十二日夜の大嶽の時（信長公記）。二十七日夜の晴雨は史料に無いので降らせない（雨で火縄が湿ると、
  //   登る間ずっと鉄砲が来る城攻めにならない。kaito BR）。月の半ばの嵐の後で土だけ湿る。
  odani: { wet: 0.3 },
  // 金ヶ崎は戦の定義の薄曇りを保つ。当日の時刻は未詳で、百五十秒で夕暮れへ飛ばさない。
  // 道明寺：朝の濃霧で後詰が遅れた。
  domyoji: { mist: true },
  //   overcast：曇りの日（一面の薄雲・柔らかい影・雲の影なし）。開戦の札の「曇」と空を合わせる（11/7 共通の係）
  // 稲生：前日の大雨の後の薄雲（札も「曇」）。田はぬかるむ。
  inou: { overcast: true, wet: 0.45 },
};

export function weatherPlanOf(id) { return PLAN[id] || null; }

// 世界を作る前に、戦の定義の写し（wdef）へ霧と湿りを入れる。定義の元は書き換えない。
export function weatherPlanWorld(id, wdef) {
  const p = PLAN[id];
  if (!p) return wdef;
  if (p.mist && wdef.mist == null) wdef.mist = true;
  if (p.wet && wdef.wetStart == null) wdef.wetStart = p.wet;
  if (p.overcast && wdef.overcast == null) wdef.overcast = true;
  return wdef;
}

// 毎コマ呼ぶ。決着後や筋書きが天気を握る戦では何もしない。
export function weatherPlanTick(rt, id) {
  const p = PLAN[id];
  if (!p || rt.over || !rt.world) return;
  const W = rt.world, st = rt._wplan || (rt._wplan = { i: 0, dusk: false, said: false });
  if (p.rain) {
    while (st.i < p.rain.length && rt.t >= p.rain[st.i][0]) {
      const want = p.rain[st.i][1];
      W.setRainTarget(want);
      // 雨が強まった時に一度だけ、近くの味方が火縄を気にする（台詞は一度きり）。
      if (want >= 0.5 && !st.said && rt.t > 5) { st.said = true; rt.after(4, () => { if (!rt.over) rt.bark('雨が強い。火縄を濡らすな'); }); }
      st.i++;
    }
  }
  if (p.dusk && !st.dusk && rt.t >= p.dusk && W.timeKey === 'day') { st.dusk = true; W.setTime('dusk'); }
}
