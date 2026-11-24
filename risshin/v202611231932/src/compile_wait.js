// compileAsync は外の待ち切りだけでは内部の確認時計が止まらず、材質と戦場を持ち続ける。
// 同じ組み立てを開始し、完了の確認だけをこちらで持って必ず片付ける。
export async function compileBattleSlice(renderer, group, camera, scene, current, ms = 1500, cancellations = null) {
  if (!current()) return false;
  const end = performance.now() + ms, programs = new Set();
  let timer, cancel;
  try {
    const materials = renderer.compile(group, camera, scene);
    // 次の姿の支度で currentProgram が変わっても、この姿の完了を確かめる。
    for (const material of materials) {
      const program = renderer.properties.get(material).currentProgram;
      if (program) programs.add(program);
    }
    return await new Promise((resolve, reject) => {
      cancel = () => { clearTimeout(timer); programs.clear(); resolve(false); };
      cancellations?.add(cancel);
      const poll = () => {
        try {
          if (!current() || renderer.getContext?.().isContextLost() || performance.now() >= end) { resolve(false); return; }
          // 出来上がった描き方はここで繋いでおく（getUniforms）。繋ぎを最初に描くコマへ持ち越すと、並べて組めない端末ではそこで組み上がりを待って止まる（11/17 K365 本能寺：開戦0.1秒に目の描き方で 1.6 秒）
          for (const program of programs) if (program.isReady()) { program.getUniforms(); programs.delete(program); }
          if (!programs.size) { resolve(true); return; }
          timer = setTimeout(poll, 16);
        } catch (error) { reject(error); }
      };
      poll();
    });
  } finally { clearTimeout(timer); programs.clear(); cancellations?.delete(cancel); }
}

