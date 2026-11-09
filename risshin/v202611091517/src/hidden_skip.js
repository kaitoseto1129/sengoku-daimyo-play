// 見えない物の行列を毎コマ計算しない（端末の重さの対策。three の標準は visible=false の下も全部たどる）。
// 隠れた子は「次に見えた時に必ず計算し直す」印だけ立てて飛ばす。見えた次のコマの描く前に、正しい場所へ直る。
import * as THREE from 'three';

const P = THREE.Object3D.prototype;
if (!P.__hiddenSkip) {
  P.__hiddenSkip = true;
  P.updateMatrixWorld = function (force) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    // 舞台（Scene）は毎コマ updateMatrix で「変わった」印が立ち、下の全部へ force が降りる（three の作り）。
    //   舞台が本当に動かなかったコマは、凍らせた塊（static_freeze の _sf）と matrixWorldAutoUpdate=false の物へは force を降ろさない
    //   （行列は凍らせた時に求め済み。変われば見張りが4コマ以内に解く）。ほかの子は今まで通り force で求め直す
    let still = false;
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.parent === null) {
        if (this.isScene && !force) { const a = this.matrixWorld.elements, b = this.matrix.elements; still = true; for (let k = 0; k < 16; k++) if (a[k] !== b[k]) { still = false; break; } }
        this.matrixWorld.copy(this.matrix);
      } else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      this.matrixWorldNeedsUpdate = false;
      force = true;
    }
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      const child = children[i];
      if (still && (child._sf === true || child.matrixWorldAutoUpdate === false)) continue;
      // 骨（指など、下に描く物の無い骨は visible=false にして描く側の走査から外す。humans.js）は見えなくても行列を直す（皮が使う）
      if (child.visible === false && !child.isLight && !child.isCamera && !child.isBone) { child.matrixWorldNeedsUpdate = true; continue; }
      if (child.matrixWorldAutoUpdate === true || force === true) child.updateMatrixWorld(force);
    }
  };
}
