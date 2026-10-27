// compileAsync は外の待ち切りだけでは内部の確認時計が止まらず、材質と戦場を持ち続ける。
// 同じ組み立てを開始し、完了の確認だけをこちらで持って必ず片付ける。
export async function compileBattleSlice(renderer, group, camera, scene, current, ms = 1500) {
  if (!current()) return false;
  const end = performance.now() + ms, programs = new Set();
  let timer;
  try {
    const materials = renderer.compile(group, camera, scene);
    // 次の姿の支度で currentProgram が変わっても、この姿の完了を確かめる。
    for (const material of materials) {
      const program = renderer.properties.get(material).currentProgram;
      if (program) programs.add(program);
    }
    return await new Promise((resolve, reject) => {
      const poll = () => {
        try {
          if (!current() || renderer.getContext?.().isContextLost() || performance.now() >= end) { resolve(false); return; }
          for (const program of programs) if (program.isReady()) programs.delete(program);
          if (!programs.size) { resolve(true); return; }
          timer = setTimeout(poll, 16);
        } catch (error) { reject(error); }
      };
      poll();
    });
  } finally { clearTimeout(timer); programs.clear(); }
}

