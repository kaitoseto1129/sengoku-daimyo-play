// 見えない物の行列を毎コマ計算しない（端末の重さの対策。three の標準は visible=false の下も全部たどる）。
// 隠れた子は「次に見えた時に必ず計算し直す」印だけ立てて飛ばす。見えた次のコマの描く前に、正しい場所へ直る。
import * as THREE from 'three';

const P = THREE.Object3D.prototype;
if (!P.__hiddenSkip) {
  P.__hiddenSkip = true;
  P.updateMatrixWorld = function (force) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.parent === null) this.matrixWorld.copy(this.matrix);
      else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      this.matrixWorldNeedsUpdate = false;
      force = true;
    }
    const children = this.children;
    for (let i = 0, l = children.length; i < l; i++) {
      const child = children[i];
      // 骨（指など、下に描く物の無い骨は visible=false にして描く側の走査から外す。humans.js）は見えなくても行列を直す（皮が使う）
      if (child.visible === false && !child.isLight && !child.isCamera && !child.isBone) { child.matrixWorldNeedsUpdate = true; continue; }
      if (child.matrixWorldAutoUpdate === true || force === true) child.updateMatrixWorld(force);
    }
  };
}
