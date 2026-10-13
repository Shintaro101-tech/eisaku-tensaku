// 中継サーバー未設定（config.js の API_URL が空）のときに使う、画面確認用のサンプル。
// 本物の添削・回答ではなく、簡単なルールでそれらしい結果を作るだけ。

const KEYWORDS = [
  ["closing", /thank/i],
  ["greeting", /^(hello|hi|good morning)|talk about/i],
  ["look", /look|color|colour|shape|small|big|cute/i],
  ["use", /use|can |enjoy|feel/i],
  ["toy", /capsule toy|want/i],
];

function guessSection(text) {
  for (const [id, re] of KEYWORDS) if (re.test(text)) return id;
  return "other";
}

function findIssues(text) {
  const issues = [];
  const lowerI = text.match(/(^|\s)(i)(?=['’\s])/);
  if (lowerI) {
    issues.push({
      original: "i",
      suggestion: "I",
      kind: "error",
      hint: "「私は」を表す単語の書き方を確かめよう。",
      explanation: "「I（私）」は文のどこにあっても大文字で書きます。",
    });
  }
  const single = text.match(/with ((?:[a-z]+ )*?)([a-z]+[^s\s]) inside/i);
  if (single) {
    issues.push({
      original: single[2],
      suggestion: `${single[2]}s`,
      kind: "error",
      hint: "ガチャガチャの中身は1個だけ？",
      explanation: "中身がたくさんあるので複数形（-s）にします。あとで they で受けると自然です。",
    });
  }
  const jp = text.match(/[぀-ヿ一-鿿]+/);
  if (jp) {
    issues.push({
      original: jp[0],
      suggestion: "(英語で)",
      kind: "error",
      hint: "日本語のところを英語にしてみよう。",
      explanation: "サンプルモードでは英訳は出ません。本番ではAIが言い方を提案します。",
    });
  }
  if (!/[.!?]$/.test(text.trim())) {
    const last = text.trim().split(/\s+/).pop();
    issues.push({
      original: last,
      suggestion: `${last}.`,
      kind: "error",
      hint: "文の終わりに何か足りないかな？",
      explanation: "英語の文の最後にはピリオド（.）をつけます。",
    });
  }
  return issues;
}

export async function mockFeedback(lesson, { script, previousScript }) {
  await new Promise((r) => setTimeout(r, 1200));
  const parts = script.replace(/\s+/g, " ").match(/[^.!?]+[.!?]*/g) || [script];
  const sentences = parts
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => ({ text, section: guessSection(text), issues: findIssues(text) }));

  const present = new Set(sentences.map((s) => s.section));
  const structure = lesson.sections.map((s) => ({
    section: s.id,
    status: present.has(s.id) ? "ok" : "missing",
    comment: present.has(s.id) ? "書けています。" : "この部分がまだ見つかりません。ワークシートの例を参考に書いてみよう。",
  }));

  return {
    summary: "（サンプルモード）最後まで書けましたね！指摘をヒントに直してみよう。",
    good_points: ["構成どおりに書こうとしているところが良いです。"],
    structure,
    sentences,
    revision_comment: previousScript ? "（サンプルモード）前回より書き直せています！" : "",
  };
}

export async function mockAnswer(lesson, { question }) {
  await new Promise((r) => setTimeout(r, 800));
  return {
    answer: `（サンプルモード）「${question}」への本物の回答は、中継サーバーを設定すると表示されます。たとえばこんな形で答えます。`,
    phrases: [
      { en: "You can enjoy looking at them and feel relaxed.", ja: "それらを見て楽しみ、癒されることができます。" },
      { en: "They look like sea animals.", ja: "それらは海の生き物のような見た目です。" },
    ],
    tip: "feel のあとは relaxed や happy のような「気持ちを表す言葉」を続けよう。",
  };
}
