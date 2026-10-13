# 英文スピーチ添削（Lesson 4）

ワークシート「Lesson 4：My Capsule Toy Idea」に沿って書いた英語のスピーチ原稿を、AI（OpenAI）が添削するウェブアプリです。

- **添削**：良いところ → 構成チェック → 直すところ の順に表示。直すところは **まずヒントだけ** 表示し、「答えを見る」で正解と説明が出る
- **なんでも質問**：「〇〇は英語で何て書けばいいの？」などに、日本語の説明と英語の例（日本語訳つき）で答える。原稿の代筆はしない
- 書き直して再チェックすると「前回 ◯個 → 今回 ◯個」と進歩を表示
- Chromebook・タブレット・スマホ対応。書きかけの原稿はブラウザに自動保存

## しくみと費用

```
生徒のブラウザ ──> GitHub Pages（画面）
       │
       └──> Cloudflare Workers（APIキーを隠す中継役）──> OpenAI API
```

- GitHub Pages は無料。Cloudflare Workers も無料プラン（1日10万回まで）で足りるので、**かかるのは OpenAI の API 料金だけ** です
- GitHub Pages だけでは OpenAI の APIキーを隠せません（ページに書くと誰でも盗めて、料金を使われてしまう）。そのため、キーは Cloudflare Workers 側に置きます

## 公開の手順

### 1. OpenAI の APIキーを用意する
1. https://platform.openai.com でプロジェクトを作り、APIキーを発行します
2. 使いすぎを防ぐため、プロジェクトに **月の上限額（Budget）** を設定しておくのがおすすめです

### 2. 中継役（Cloudflare Workers）を公開する
Cloudflare の無料アカウントを作ってから、ターミナルで次を実行します。

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler deploy
```

`secret put` で APIキーを貼り付けます。`deploy` が終わると `https://eisaku-tensaku.<あなたの名前>.workers.dev` のようなURLが表示されます。

### 3. 画面（GitHub Pages）を公開する
1. [docs/config.js](docs/config.js) の `API_URL` に、手順2のURLを書きます
2. このフォルダを GitHub のリポジトリにして push します
3. GitHub のリポジトリで **Settings → Pages** を開き、Branch を `main`、フォルダを `/docs` にして保存します
4. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で開けるようになります

### 4. 中継役に画面のURLを登録する
[worker/wrangler.toml](worker/wrangler.toml) の `ALLOWED_ORIGIN` に `https://<ユーザー名>.github.io` を書いて、もう一度 `npx wrangler deploy` します。これで、ほかのサイトからは中継役を使えなくなります。

クラスコードを使う場合は、同じファイルの `ACCESS_CODE` に設定します。

## 設定（worker/wrangler.toml）

| 変数 | 初期値 | 説明 |
|---|---|---|
| `OPENAI_API_KEY` | なし | `npx wrangler secret put` で登録（ファイルには書かない） |
| `ALLOWED_ORIGIN` | なし | 画面のURL（カンマ区切りで複数可） |
| `ACCESS_CODE` | なし | クラスコード（空なら不要） |
| `OPENAI_MODEL` | `gpt-6.1-sol` | 安くしたいときは `gpt-6-luna` |
| `OPENAI_EFFORT` | `low` | 考える深さ。`medium` にすると丁寧になるが、遅く・高くなる |
| `RATE_LIMIT_PER_MIN` | `300` | 同じIPアドレスからの1分あたりの回数の目安。学校の回線は全員が同じIPになりやすい |

## ローカルで画面を確認する

```bash
python3 -m http.server 3000 --directory docs
```

http://localhost:3000 を開きます。`docs/config.js` の `API_URL` が空のときは **サンプルモード**（AIを使わない、画面確認用の疑似結果）で動きます。

## ファイル構成

- [docs/](docs/) — 画面（GitHub Pages で公開する部分）
  - [docs/lessons/lesson4.js](docs/lessons/lesson4.js) — レッスンの設定（構成・例文・質問の例・AIへの添削方針）。画面と中継役の両方が読み込む
  - [docs/config.js](docs/config.js) — 中継役のURL
  - [docs/mock.js](docs/mock.js) — サンプルモード用
- [worker/src/index.js](worker/src/index.js) — 中継役。AIへの指示（添削・質問の答え方）もここ
