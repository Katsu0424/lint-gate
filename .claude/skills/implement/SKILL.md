---
name: implement
description: Ready / In Progress の Task を実装して PR まで運ぶ実装ステップ。/next-step のディスパッチ、または「issue #N を実装して」「着手して」で発動。
---

# /implement — Task: 実装 → PR

issue に書かれた受け入れ条件が唯一の完了定義。issue にないことはやらず、issue と食い違う実装をしない。

## Step 1: 前提確認

```bash
pnpm -s issue-keeper inspect <n>
```

- `要件` / `受け入れ条件` / `内容` / `原因調査` / `決定` を読み、何を作るかを把握する
- workUnit が **Task 以外**(Note / Container)なら実装対象ではない。`/next-step #<n>` に戻る
- Status が **Ready** なら `pnpm -s issue-keeper start <n>` を実行して In Progress にする
- Status が **Done** なら何もしない(追加作業は `/note` で新規起票)

## Step 2: 曖昧さの解消

受け入れ条件が曖昧、または実装中に矛盾・考慮漏れを見つけたら、勝手に解釈して進めず確認し、
確定した内容を `pnpm -s issue-keeper update <kind> <n> --...` で **issue に反映してから**続ける(issue が唯一の真実)。

## Step 3: ブランチ

```bash
git checkout main && git pull
git checkout -b feature/issue-<n>-<短い英語slug>
```

## Step 4: 実装

- 本パッケージは「利用側リポジトリに品質・行動の門番を配る」ツール。チェッカー本体(src/)は Node 組み込みのみ(外部依存ゼロ)を維持する
- 汎用/固有の線引き: 利用側リポジトリ固有の値をコードに直書きしない。上書きは `lint-gate.config.json` のセクションに逃がし、既定値は book-copilot 相当にする
- 受け入れ条件を 1 つずつ満たす。**テストファースト推奨**。コミットは Conventional Commits

## Step 5: テスト観点

テストファイル先頭に `test-perspectives` ブロック(自分自身の `lint-gate test-perspectives` が強制)。`test/domain/` は全 5 観点必須・他は正常系+異常系必須。入力だけ変わるテストは `it.each` を標準形とする。

## Step 6: 品質ゲート

```bash
pnpm lint && pnpm test
```

すべて通るまで PR を作らない。抑制コメントは自分自身の検出器に拒否される(例外は allowlist のみ)。

## Step 7: PR

```bash
git push -u origin HEAD
gh pr create --base main --fill
```

- PR 本文に **`Closes #<n>` を必ず書き**、受け入れ条件チェックリストに充足根拠を添える
- 利用側の導入手順が変わる変更は README の該当節を同じ PR で更新する

## Step 8: 報告

CI がグリーンになったことを確認してから、PR の URL と受け入れ条件ごとの充足状況を報告する。マージ判断は人に委ねる。
