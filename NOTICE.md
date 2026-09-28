# NOTICE — 第三者データの出典とライセンス

山ノートの「山名データ（山マスター）」は、以下の公開データを `scripts/master/build.ts` で加工して生成しています。
生成物は `public/master/`（`manifest.json`・都道府県別 JSON・`NOTICE.txt`）で、アプリ内の
**設定 → 山名データについて** からも出典・ライセンスを確認できます。

> 山名・位置・所在都道府県・標高は**参考情報**です。登山計画には必ず最新の公式地図（地理院地図など）や現地情報で再確認してください。

## 1. 山名・読み・位置 — 国土地理院ベクトルタイル（注記）

- 出典: 国土地理院ベクトルタイル提供実験（注記データ）を加工して作成
- 抽出データ: [anineco/GSI-VectorTile-MountainDB](https://github.com/anineco/GSI-VectorTile-MountainDB)
  の `gsi_summits.csv`（コミット `ec14a7641e19888fcc388ce1d418da530f3e68ee` に固定）
- ライセンス
  - 元データ: 国土地理院コンテンツ利用規約に従う（出典の明示により利用可、CC BY 4.0 互換）。
    利用条件の最新情報は [国土地理院](https://www.gsi.go.jp/) の案内を確認してください。
  - 抽出データ・スクリプト: MIT License, Copyright (c) 2025 Nyanta Anineco（全文は下記および `public/master/NOTICE.txt`）
- 使用項目: 山名（外字を置換した `name1`）・よみ・緯度・経度のみ
- 使用しなかったもの: 同リポジトリの `gsi_compare.csv` に含まれる標高（`alt`）は、作者の独自データベース由来で出典・精度を確認できないため使用していません。

## 2. 都道府県の判定 — 国土数値情報（行政区域データ）

- 出典: 「国土数値情報（行政区域データ）」（国土交通省）をスマートニュース メディア研究所が加工したデータ
  [smartnews-smri/japan-topography](https://github.com/smartnews-smri/japan-topography)
  （N03-21 令和3年、簡素化1%、コミット `b403e71eb97f1fdf32f63d16bd485129f703855e` に固定）を加工して作成
- ライセンス: 国土数値情報の利用規約に従う（出典の明記が必要）。加工者（スマートニュース）によると商用・非商用とも無償で利用可、加工者のクレジットは不要。
- 境界ポリゴン自体はリポジトリにもアプリにも含めていません（ビルド時にダウンロードして判定だけに使用。`data/raw/` はコミット対象外）。

## 3. 標高 — 国土地理院「日本の主な山岳標高」＋ 標高タイル（数値標高モデル）

`npm run master:elevation`（または GitHub Actions の「Update mountain elevations」）で取得し、
`scripts/master/elevations.json` に保存します。アプリのビルドや GitHub Pages のデプロイ時には国土地理院へ通信しません。

- 優先1: 国土地理院「日本の主な山岳標高」（公表されている山頂標高、出典キー `gsi-sangaku`）
  - 出典表記: 国土地理院「日本の主な山岳標高」を加工して作成
  - 山名位置から 150m 以内かつ山名・読みが一致したものだけ採用（名前だけでは突合しない）
- 優先2: 国土地理院 標高タイル（PNG、基盤地図情報 数値標高モデル）で山名位置の画素値を読む
  - 精度の高い順に DEM1A → DEM5A → DEM5B → DEM5C → DEM10B（出典キー `gsi-dem1a` … `gsi-dem10b`）
  - 出典表記: 国土地理院 標高タイル（基盤地図情報数値標高モデル）を加工して作成
  - DEM の値は「山名注記の位置の地形の標高」で、公表されている山頂標高と一致するとは限りません（アプリでは「DEM5A」などと表示して区別）
- 取得できない山は標高なし（`undefined`）。推測値は入れません。
- 国土地理院サーバーへの負荷を抑えるため、必要なタイルだけを座標から計算し、同じタイルは1回だけ取得してキャッシュ、
  リクエストは直列で最小間隔（既定 300ms）を空け、403 では即中断、エラーが続けば中断します。
- 現在コミットされているデータの標高件数は `public/master/manifest.json` の `withElevation` / `elevationBySource` を参照してください
  （このリポジトリを作成した環境からは国土地理院のサーバーに接続できなかったため、初期状態は 0 件です）。

## 測量法について

国土地理院の測量成果を加工したデータを地図等として刊行・公開する場合、利用形態によっては測量法に基づく手続きが必要になることがあります。
公開・再配布の際は国土地理院の案内を確認してください。

---

## anineco/GSI-VectorTile-MountainDB — MIT License

```
MIT License

Copyright (c) 2025 Nyanta Anineco

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
