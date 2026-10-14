# Changelog

## 2026-10-14

### Fixed

- `T-0153`: 戦国立身LPにWeb版と同じMeta Pixelを追加し、Webゲーム・App StoreへのCTAクリックを計測できるようにしました。
- `T-0153`: 戦国立身LPのApp Storeリンクが戦国大名を向いていたため、戦国立身（`id6816750198`）へ修正しました。

## 2026-09-20

### Added

- Meta Pixel ID `1134385575587937` の `PageView` 計測を、`pixel.html` と公開ウェブ版の `index.html` に追加しました。
- ウェブ版の広告計測についてプライバシーポリシーを更新しました。

### Scope and follow-up

- iPhoneアプリ内、localhost、その他のホストではPixelを送信しません。
- 公開後は実際のウェブページで `PageView` の受信を確認します。広告キャンペーンの公開はこのリポジトリの変更には含みません。
