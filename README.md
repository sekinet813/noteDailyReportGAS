# note Daily Report GAS

note（ノート）記事のPV・スキ数を毎日自動集計し、前日との差分をメールでレポート配信するGoogle Apps Scriptプロジェクトです。  
必要に応じてOpenAI（ChatGPT）APIによる要約もメールに追加できます。

---

## 🏗️ 構成ファイル一覧

- `Config.gs`　　　　：スクリプトプロパティの一元管理
- `NoteStatsService.gs`：note APIからデータ取得＆スプレッドシート出力
- `ReportGenerator.gs` ：データの差分計算・本文生成
- `MailNotifier.gs`　　：メール送信処理
- `OpenAISummarizer.gs` ：（オプション）ChatGPT APIによる自動要約
- `main.gs`　　　　　：メイン関数と呼び出し例

---

## 🚀 セットアップ手順

1. **Google Apps Scriptプロジェクトを新規作成**  
2. 上記各ファイル（.gs）をスクリプトエディタで追加し、コードを貼り付ける
3. **スクリプトプロパティ**（[プロジェクトの設定]から）に以下を追加  
    | キー名                        | 用途/値                      |
    |-------------------------------|------------------------------|
    | `OPENAI_API_KEY`              | OpenAI APIキー（任意）       |
    | `NOTE_COOKIE`                 | `_note_session_v5=xxxxxx` などnoteログインCookie |
    | `NOTE_SPREADSHEET_FOLDER_ID`  | 集計ファイルの保存先フォルダID（省略可） |
    | `RECIPIENT`                   | レポートメールの送信先        |

4. **必要に応じてトリガー（例：毎日8:00）を設定**  
　→ `main.gs` の `sendNoteDailySummary()` を定期実行に指定

## 🔑 NOTE_COOKIE の設定方法

note APIから自分のPV/スキデータを取得するには、**自分のnoteアカウントの認証Cookie**が必要です。  
スクリプトプロパティの `NOTE_COOKIE` に、下記手順で取得した値を設定してください。

### 1. どのクッキー名を使う？

| クッキー名               | 用途・説明                | 設定すべきか            |
|-------------------------|--------------------------|-------------------------|
| `_note_session_v5`      | noteの認証セッションクッキー | **必須（これだけでOK）**|
| `note_gql_auth_token`   | noteのAPI認証用           | 取得できない場合は追加してもよい |
| `XSRF-TOKEN`            | POST時のCSRF用            | 通常は不要              |

### 2. 取得手順

1. **Chromeなどのブラウザでnoteにログインする**
2. F12（デベロッパーツール）を開き、「Application」タブ →「Cookies」→ `note.com` を選択
3. **`_note_session_v5`** というクッキーを探し、その「値」をコピー
4. スクリプトプロパティ `NOTE_COOKIE` に、  
```
_note_session_v5=xxxxxxxxxxxxxxxxxxxxxxxxxx
```
のように貼り付ける  
※`_note_session_v5=` から始める。空白や改行は除去

#### ▼ 設定例
```
_note_session_v5=abcd1234efgh5678ijkl91011mnop
```
> 必要に応じて `note_gql_auth_token=xxxxxxx` も「;」区切りで追加できます  
> ```
> _note_session_v5=xxxxxxx; note_gql_auth_token=yyyyyyy
> ```

### 3. 注意点

- セッションCookieは**定期的に失効**します（noteに再ログイン後、再取得が必要です）
- 別アカウントや未ログイン状態ではデータ取得できません
- コピー時は**余分なスペース・改行・ダブルクォート**が混入しないようご注意ください

### ▼ GASでの設定箇所

- **Google Apps Scriptエディタ**  
  左側「歯車アイコン」→「プロジェクトのプロパティ」→「スクリプトのプロパティ」タブ  
- キー名：`NOTE_COOKIE`　値：上記で取得したクッキー値


---

## 📩 機能

- note APIから**全記事のPV・スキ数を自動取得**
- 月別スプレッドシート/日付シートに自動記録
- 前日と本日データから**差分を算出**
- 主要な伸び記事を自動で抽出
- 指定メールアドレス宛にレポートを自動送信
- **（オプション）OpenAI（ChatGPT）APIで要約も添付可能**

---

## 🔧 ChatGPT要約の使い方

- `OpenAISummarizer.gs` を追加
- `main.gs` 内のコメント部分のように要約を取得し、メール本文へ追記  
  （API利用には**OpenAI APIキーと有料枠**が必要です）

```javascript
// main.gs内
// var summarizer = new OpenAISummarizer(config.openaiKey);
// var prompt = ... ;
// var summary = summarizer.summarize(prompt);
// body += "\n\n📝 ChatGPT要約：\n" + summary;
```

## ⚠️ 注意・制限
- note API利用には**自分のアカウントのCookie（_note_session_v5）**が必要です
- note側の仕様変更でJSONパース箇所等が変わる場合は都度修正が必要です
- OpenAI APIの無料枠・有料枠管理にご注意ください（APIキーが別途必要）

## 📝 拡張・カスタマイズ例
- SlackやLINE通知への拡張
- 週次/月次サマリーの自動生成
- note記事タイトルやタグでのフィルタリング
- 独自のグラフ・可視化スクリプト追加

