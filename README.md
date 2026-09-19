# 戦国大名（遊ぶ用）

ブラウザで遊べるリアルタイム戦国戦略ゲーム。桶狭間から天下統一へ。

- 遊ぶ: https://kaitoseto1129.github.io/sengoku-daimyo-play/
- 攻略サイト（長篠の戦い編）: https://kaitoseto1129.github.io/sengoku-daimyo-play/guide/
- iPhone の Safari でも遊べます（横向き推奨）。記録はその端末の中に残ります。

このリポジトリには完成品の一枚（index.html）だけを置いています。

## 広告の計測コード（Pixel）について
- Meta Pixel ID `1134385575587937` は `pixel.html` で管理し、現在の `index.html` の `<head>` にも同じコードを埋め込んでいます。
- ゲーム本体を組み直すときは、`pixel.html` の内容を `index.html` の `<!-- pixel: ... -->` と `<!-- /pixel -->` の間へ反映してください。このリポジトリに自動差し込み処理はありません。
- 公開ウェブ版でのみ `PageView` を送信します。iPhoneアプリ内・localhost・他のホストでは送信しません。
