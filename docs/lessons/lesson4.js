// Lesson 4「沖水にあったら嬉しいガチャガチャ」の設定。
// 画面（docs/app.js）と中継サーバー（worker/src/index.js）の両方から読み込む。
// 他のレッスンを追加するときは、このファイルをコピーして中身を書き換える。

export const lesson4 = {
  id: "lesson4",
  title: "Lesson 4：My Capsule Toy Idea",
  subtitle: "沖水にあったら嬉しいガチャガチャについてスピーチ原稿を書こう",

  // 原稿の構成（ワークシート左側の見出しと同じ順番）
  sections: [
    { id: "greeting", label: "あいさつ" },
    { id: "toy", label: "どんなガチャガチャ？" },
    { id: "look", label: "説明①（どんな見た目？）" },
    { id: "use", label: "説明②（それで何ができる？）" },
    { id: "closing", label: "締めのあいさつ" },
  ],

  example: [
    { section: "greeting", text: "Hello.\nToday, I’m going to talk about my capsule toy idea." },
    { section: "toy", text: "I want to get a capsule toy with unique erasers inside." },
    { section: "look", text: "They look like sea animals, but you can use them to erase letters. They are small and cute." },
    { section: "use", text: "You can use them to study. You can also enjoy looking at them and feel relaxed." },
    { section: "closing", text: "Thank you very much for listening." },
  ],

  // 「なんでも質問」の入力例（タップすると入力欄に入る）
  questionExamples: [
    "「癒される」は英語で何て言う？",
    "「〜の形をしている」はどう書く？",
    "slipper と slippers はどっちを使う？",
  ],

  // AIに渡す、このレッスン特有の添削方針
  teacherNotes: `
- 生徒は日本の高校生（英語は初級〜中級）。沖縄の水産高校（沖水）の授業。
- 課題：「沖水にあったら嬉しいガチャガチャ（カプセルトイ）」について30秒程度のスピーチ原稿を書く。
- 例文の型（I want to get a capsule toy with ~ inside. / They look like ~. / You can use them to ~. / You can also enjoy ~ and feel ~.）を使えていれば十分。型どおりであることを減点しない。
- 中身が複数あるもの（erasers, slippers など）は複数形にし、代名詞は they / them で受けるのが自然。単数で通している場合は誤りとしない。
- 「feel ~」の後は形容詞（relaxed, happy など）。
- 例文と同じ内容（海の生き物の消しゴム）をそのまま使っていても、指摘はせず、good_points で触れなくてよい。
`.trim(),
};
