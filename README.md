# Ledgerly

シンプルな収支管理アプリ。Express + PostgreSQL のバックエンドと、素の HTML/CSS/JavaScript で構成されたフロントエンドです。ログイン後に収支の CRUD、フィルタ、サマリー表示、詳細ページ遷移（クエリパラメータ使用）ができます。

## セットアップ

1. 依存関係を取得
   ```bash
   npm install
   ```
2. 環境変数を準備（必要に応じて値を変更）
   ```bash
   cp .env.example .env
   # DATABASE_URL の DB 部分の作成がまだなら:
   # createdb ledgerly
   ```
3. DB 初期化（テーブル作成とデモユーザー投入）
   ```bash
   npm run init-db
   # デモ: demo@ledgerly.test / password123
   ```
4. サーバー起動
   ```bash
   npm start
   # http://localhost:3000 でアクセス
   ```

## 機能
- 認証: メール + パスワードで登録/ログイン、セッション管理
- 収支一覧: ログインユーザーのデータのみ、日付の新しい順
- CRUD: 新規追加・編集・削除（金額と区分は必須）
- サマリー: 総収入 / 総支出 / 残高を常に表示
- フィルタ: 区分（収入/支出/すべて）＋期間（開始/終了日）で絞り込み、サマリーも再計算
- 詳細ページ: 一覧カードをクリックで `/detail.html?id=...` に遷移し詳細表示
- レスポンシブ: グリッド/フレックスでモバイル〜デスクトップに対応

## エンドポイント概要
- `POST /api/register` 新規登録
- `POST /api/login` ログイン
- `POST /api/logout` ログアウト
- `GET /api/me` セッション確認
- `GET /api/items` クエリ: `type`, `startDate`, `endDate`（一覧＋サマリー）
- `GET /api/items/:id` 詳細
- `POST /api/items` 追加
- `PUT /api/items/:id` 更新
- `DELETE /api/items/:id` 削除

## 備考
- セッションはメモリストア（開発向け）です。必要に応じて永続ストアへ差し替えてください。
- Chrome / Safari でレイアウトを確認してください。
