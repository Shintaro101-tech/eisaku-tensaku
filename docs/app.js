import { API_URL } from "./config.js";
import { lesson4 as lesson } from "./lessons/lesson4.js";
import { mockFeedback, mockAnswer } from "./mock.js";

const STORAGE_KEY = `tensaku:${lesson.id}:draft`;
const MOCK = !API_URL;
const MAX_HISTORY = 6;

const $ = (sel) => document.querySelector(sel);
const els = {
  title: $("#lesson-title"),
  subtitle: $("#lesson-subtitle"),
  banner: $("#mock-banner"),
  toggleExample: $("#toggle-example"),
  example: $("#example"),
  script: $("#script"),
  counter: $("#counter"),
  codeRow: $("#code-row"),
  code: $("#access-code"),
  checkBtn: $("#check-btn"),
  error: $("#error"),
  side: $("#side"),
  tabAsk: $("#tab-ask"),
  tabResult: $("#tab-result"),
  paneAsk: $("#pane-ask"),
  paneResult: $("#pane-result"),
  resultBadge: $("#result-badge"),
  empty: $("#empty"),
  loading: $("#loading"),
  feedback: $("#feedback"),
  chat: $("#chat"),
  suggestions: $("#suggestions"),
  askForm: $("#ask-form"),
  question: $("#question"),
  askBtn: $("#ask-btn"),
  withScript: $("#with-script"),
};

let config = { requiresCode: false, maxScriptChars: 1500 };
let previous = null; // { script, errorCount }
let lastFeedback = null; // 最後に表示し終えた添削結果
let revealed = new Set(); // 「答えを見る」を押した指摘のid
let showBetter = false; // 「もっと良くする」提案を表示するか
let history = []; // なんでも質問の会話 [{ role, content }]
let asking = false;

// ---------- utils ----------
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function storageGet() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function storageSet(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...storageGet(), ...data })); } catch { /* 保存できなくても動く */ }
}

function countText(text) {
  const words = (text.match(/[A-Za-z’']+/g) || []).length;
  const sentences = (text.match(/[^.!?]+[.!?]+/g) || []).length;
  return `${words} words · ${sentences} 文`;
}

const isNarrow = () => window.matchMedia("(max-width: 860px)").matches;

async function api(path, body) {
  const res = await fetch(`${API_URL.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonId: lesson.id, accessCode: els.code.value.trim(), ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "エラーが起きました。もう一度試してください。");
  return data;
}

// ---------- setup ----------
async function init() {
  if (!MOCK) {
    try {
      const res = await fetch(`${API_URL.replace(/\/$/, "")}/config`);
      config = { ...config, ...(await res.json()) };
    } catch {
      showError("サーバーにつながりませんでした。ページを再読み込みしてください。");
    }
  }

  els.title.textContent = lesson.title;
  els.subtitle.textContent = lesson.subtitle;
  document.title = `${lesson.title} 添削`;
  els.banner.hidden = !MOCK;
  els.codeRow.hidden = !config.requiresCode;
  els.script.maxLength = config.maxScriptChars;

  const secLabel = Object.fromEntries(lesson.sections.map((s) => [s.id, s.label]));
  els.example.innerHTML = `<dl>${lesson.example
    .map((e) => `<dt>${escapeHtml(secLabel[e.section])}</dt><dd>${escapeHtml(e.text)}</dd>`)
    .join("")}</dl>`;
  els.suggestions.innerHTML = lesson.questionExamples
    .map((q) => `<button type="button" class="suggestion" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`)
    .join("");

  const saved = storageGet();
  els.script.value = saved.script || "";
  els.code.value = saved.code || "";
  els.counter.textContent = countText(els.script.value);

  els.script.addEventListener("input", () => {
    els.counter.textContent = countText(els.script.value);
    storageSet({ script: els.script.value });
  });
  els.code.addEventListener("input", () => storageSet({ code: els.code.value }));
  els.toggleExample.addEventListener("click", () => {
    const show = els.example.hidden;
    els.example.hidden = !show;
    els.toggleExample.setAttribute("aria-expanded", String(show));
    els.toggleExample.textContent = show ? "例文をとじる" : "例文を見る";
  });
  els.checkBtn.addEventListener("click", check);
  els.feedback.addEventListener("click", onFeedbackClick);
  els.feedback.addEventListener("change", (e) => {
    if (e.target.id === "show-better") {
      showBetter = e.target.checked;
      els.feedback.classList.toggle("hide-better", !showBetter);
    }
  });

  els.tabAsk.addEventListener("click", () => selectTab("ask"));
  els.tabResult.addEventListener("click", () => selectTab("result"));
  els.side.querySelector("[role=tablist]").addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      selectTab(els.tabAsk.getAttribute("aria-selected") === "true" ? "result" : "ask");
      (els.tabAsk.getAttribute("aria-selected") === "true" ? els.tabAsk : els.tabResult).focus();
    }
  });

  els.suggestions.addEventListener("click", (e) => {
    const b = e.target.closest("[data-q]");
    if (!b) return;
    els.question.value = b.dataset.q;
    autoGrow();
    els.question.focus();
  });
  els.askForm.addEventListener("submit", (e) => {
    e.preventDefault();
    ask();
  });
  els.question.addEventListener("keydown", (e) => {
    // Enterで送信、Shift+Enterで改行（日本語変換中は送信しない）
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ask();
    }
  });
  els.question.addEventListener("input", autoGrow);
  els.chat.addEventListener("click", onChatClick);
}

function selectTab(name) {
  const ask = name === "ask";
  els.tabAsk.setAttribute("aria-selected", String(ask));
  els.tabResult.setAttribute("aria-selected", String(!ask));
  els.tabAsk.tabIndex = ask ? 0 : -1;
  els.tabResult.tabIndex = ask ? -1 : 0;
  els.paneAsk.hidden = !ask;
  els.paneResult.hidden = ask;
  if (!ask) els.resultBadge.hidden = true;
}

function showError(msg) {
  els.error.textContent = msg;
  els.error.hidden = !msg;
}

// ---------- 添削 ----------
async function check() {
  const script = els.script.value.trim();
  showError("");
  if (!script) return showError("原稿を入力してください。");
  if (config.requiresCode && !els.code.value.trim()) return showError("クラスコードを入力してください。");

  selectTab("result");
  setLoading(true);
  revealed = new Set();
  showBetter = false;
  const previousScript = previous && previous.script !== script ? previous.script : "";
  const prevErrorCount = previousScript ? previous.errorCount : null;
  if (isNarrow()) els.side.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const feedback = MOCK
      ? await mockFeedback(lesson, { script, previousScript })
      : await streamCheck({ script, previousScript }, (partial) => {
          // 書き出された部分から順に表示する
          if (!partial.summary) return;
          els.loading.hidden = true;
          els.feedback.hidden = false;
          render(partial, null, true);
        });

    render(feedback, prevErrorCount, false);
    lastFeedback = feedback;
    previous = { script, errorCount: countIssues(feedback, "error") };
    if (els.paneResult.hidden) els.resultBadge.hidden = false;
  } catch (err) {
    showError(err.message);
    // 途中まで表示した結果は消して、前回の結果に戻す
    if (lastFeedback) render(lastFeedback, null, false);
  } finally {
    setLoading(false);
  }
}

// 添削結果を少しずつ受け取る。onPartial には途中までの結果が渡される
async function streamCheck(body, onPartial) {
  const res = await fetch(`${API_URL.replace(/\/$/, "")}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonId: lesson.id, accessCode: els.code.value.trim(), ...body }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "エラーが起きました。もう一度試してください。");
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let text = "";
  let done = false;
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    const partial = parsePartialJson(text);
    if (partial) onPartial(partial);
  };

  while (!done) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buf += value;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      const ev = JSON.parse(line);
      if (ev.type === "delta") text += ev.text;
      else if (ev.type === "error") throw new Error(ev.error);
      else if (ev.type === "done") done = true;
    }
    if (!scheduled && !done) {
      scheduled = true;
      requestAnimationFrame(flush);
    }
  }
  if (!done) throw new Error("通信が途中で切れました。もう一度試してください。");
  return JSON.parse(text);
}

// 書きかけのJSONを、そこまでに完成している部分だけで読めるように閉じて解釈する。
// （このアプリの結果は文字列・配列・オブジェクトだけなので、数値などは扱わない）
function parsePartialJson(text) {
  const stack = [];
  let inString = false;
  let escaped = false;
  let isKey = false;
  let expectKey = false;
  let safe = -1;
  let safeStack = [];
  const mark = (i) => {
    safe = i + 1;
    safeStack = stack.slice();
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') {
        inString = false;
        if (!isKey) mark(i);
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      isKey = stack.at(-1) === "{" && expectKey;
      expectKey = false;
    } else if (c === "{") {
      stack.push("{");
      expectKey = true;
    } else if (c === "[") {
      stack.push("[");
      mark(i);
    } else if (c === "}" || c === "]") {
      stack.pop();
      mark(i);
    } else if (c === ",") {
      expectKey = stack.at(-1) === "{";
    }
  }
  if (safe < 0) return null;
  const closers = safeStack.reverse().map((b) => (b === "{" ? "}" : "]")).join("");
  try {
    return JSON.parse(text.slice(0, safe) + closers);
  } catch {
    return null;
  }
}

function setLoading(on) {
  els.checkBtn.disabled = on;
  els.checkBtn.querySelector(".btn-label").textContent = on ? "チェック中…" : previous ? "もう一度チェックする" : "チェックする";
  els.loading.hidden = !on;
  els.empty.hidden = on || Boolean(lastFeedback);
  els.feedback.hidden = on || !lastFeedback;
}

// 途中までの結果では、項目がまだそろっていないものを表示しない
const complete = (obj, keys) => obj && keys.every((k) => obj[k] !== undefined);
const sentencesOf = (fb) =>
  (fb.sentences || [])
    .filter((s) => complete(s, ["text", "section"]))
    .map((s) => ({ ...s, issues: (s.issues || []).filter((i) => complete(i, ["original", "suggestion", "kind", "hint", "explanation"])) }));

const countIssues = (fb, kind) => sentencesOf(fb).reduce((n, s) => n + s.issues.filter((i) => i.kind === kind).length, 0);

const STATUS_ICON = { ok: "✅", weak: "🔸", missing: "⚠️" };
const KIND_LABEL = { error: "直そう", better: "もっと良くする" };

function render(fb, prevErrorCount, streaming) {
  const secLabel = Object.fromEntries(lesson.sections.map((s) => [s.id, s.label]));
  secLabel.other = "その他";
  const errors = countIssues(fb, "error");
  const betters = countIssues(fb, "better");

  let progress = "";
  if (prevErrorCount != null) {
    const fixed = Math.max(prevErrorCount - errors, 0);
    progress = `<div class="progress">
      <span>直すところ：前回 ${prevErrorCount}個 → 今回 <strong>${errors}個</strong></span>
      ${fixed > 0 ? `<span>🎉 ${fixed}個 直せました！</span>` : ""}
    </div>`;
  }

  const summary = `<div class="fb-block">
    <p class="summary">${escapeHtml(fb.summary)}</p>
    ${fb.revision_comment ? `<p class="next">${escapeHtml(fb.revision_comment)}</p>` : ""}
    ${progress}
  </div>`;

  const goodPoints = fb.good_points || [];
  const good = goodPoints.length
    ? `<div class="fb-block"><h3>⭐ 良いところ</h3><ul class="good-list">${goodPoints
        .map((g) => `<li>${escapeHtml(g)}</li>`)
        .join("")}</ul></div>`
    : "";

  const structureItems = (fb.structure || []).filter((s) => complete(s, ["section", "status", "comment"]));
  const structure = structureItems.length
    ? `<div class="fb-block"><h3>📋 構成チェック</h3><ul class="structure">${structureItems
    .map(
      (s) => `<li class="${s.status}">
        <span aria-hidden="true">${STATUS_ICON[s.status]}</span>
        <span class="s-name">${escapeHtml(secLabel[s.section] || s.section)}</span>
        ${s.status === "ok" ? "" : `<span class="s-comment">${escapeHtml(s.comment)}</span>`}
      </li>`,
    )
    .join("")}</ul></div>`
    : "";

  let issueId = 0;
  const sentenceItems = sentencesOf(fb);
  const sentences = sentenceItems
    .map((s) => {
      const issues = s.issues.map((i) => ({ ...i, id: `issue-${issueId++}` }));
      return `<div class="sentence">
        <span class="sec-label">${escapeHtml(secLabel[s.section] || s.section)}</span>
        <p class="en">${highlight(s.text, issues)}</p>
        ${issues.map(issueCard).join("")}
      </div>`;
    })
    .join("");

  const counts = `<div class="counts">
    ${errors ? `<span class="chip error">直そう ${errors}</span>` : `<span class="chip ok">直すところなし！</span>`}
    ${betters ? `<span class="chip better">もっと良くする ${betters}</span>` : ""}
  </div>`;

  const betterToggle = betters && !streaming
    ? `<label class="optional-toggle"><input type="checkbox" id="show-better"${showBetter ? " checked" : ""}> 「もっと良くする」提案も表示する</label>`
    : "";

  const writing = streaming ? `<p class="writing"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span> 続きを書いています…</p>` : "";

  const script = sentenceItems.length
    ? `<div class="fb-block"><h3>✏️ あなたの原稿</h3>
    ${streaming ? "" : counts}
    <p class="next">色のついたところをタップすると、ヒントが見られます。まずは自分で考えて、原稿を直してみよう。わからないときは「💬 なんでも質問」で聞いてもOK。</p>
    ${sentences}
    ${betterToggle}
    ${streaming ? "" : `<button type="button" class="reveal back-to-edit" data-back>✏️ 原稿を直しにもどる</button>`}
  </div>`
    : "";

  els.feedback.innerHTML = summary + good + structure + script + writing;
  els.feedback.classList.toggle("hide-better", !showBetter);
}

function highlight(text, issues) {
  // 文中で original が出てくる位置を探し、重ならないように印をつける
  const ranges = [];
  for (const issue of issues) {
    if (!issue.original) continue;
    let from = 0;
    let idx;
    while ((idx = text.indexOf(issue.original, from)) !== -1) {
      const end = idx + issue.original.length;
      if (!ranges.some((r) => idx < r.end && end > r.start)) {
        ranges.push({ start: idx, end, issue });
        break;
      }
      from = idx + 1;
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  let html = "";
  let pos = 0;
  for (const r of ranges) {
    html += escapeHtml(text.slice(pos, r.start));
    html += `<mark class="${r.issue.kind}" data-target="${r.issue.id}" tabindex="0" role="button" aria-label="${KIND_LABEL[r.issue.kind]}：${escapeHtml(r.issue.original)}"><span>${escapeHtml(text.slice(r.start, r.end))}</span></mark>`;
    pos = r.end;
  }
  return html + escapeHtml(text.slice(pos));
}

function issueCard(i) {
  return `<div class="issue ${i.kind}" id="${i.id}">
    <div class="issue-head">
      <span class="issue-kind">${KIND_LABEL[i.kind]}</span>
      <span class="issue-target">“${escapeHtml(i.original)}”</span>
    </div>
    <p class="hint">${escapeHtml(i.hint)}</p>
    ${revealed.has(i.id) ? "" : `<button type="button" class="reveal" data-reveal="${i.id}">答えを見る</button>`}
    <div class="answer"${revealed.has(i.id) ? "" : " hidden"}>
      <p class="fix"><del>${escapeHtml(i.original)}</del> → <ins>${escapeHtml(i.suggestion)}</ins></p>
      <p class="why">${escapeHtml(i.explanation)}</p>
    </div>
  </div>`;
}

function onFeedbackClick(e) {
  const reveal = e.target.closest("[data-reveal]");
  if (reveal) {
    revealed.add(reveal.dataset.reveal);
    reveal.nextElementSibling.hidden = false;
    reveal.remove();
    return;
  }
  if (e.target.closest("[data-back]")) {
    els.script.scrollIntoView({ behavior: "smooth", block: "center" });
    els.script.focus({ preventScroll: true });
    return;
  }
  const mark = e.target.closest("mark[data-target]");
  if (mark) focusIssue(mark);
}

function focusIssue(mark) {
  const card = document.getElementById(mark.dataset.target);
  if (!card) return;
  if (mark.classList.contains("better")) {
    const toggle = document.getElementById("show-better");
    if (toggle && !toggle.checked) {
      toggle.checked = true;
      showBetter = true;
      els.feedback.classList.remove("hide-better");
    }
  }
  els.feedback.querySelectorAll("mark.active").forEach((m) => m.classList.remove("active"));
  mark.classList.add("active");
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  card.classList.remove("flash");
  void card.offsetWidth;
  card.classList.add("flash");
}

document.addEventListener("keydown", (e) => {
  const mark = e.target.closest?.("mark[data-target]");
  if (mark && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    focusIssue(mark);
  }
});

// ---------- なんでも質問 ----------
function autoGrow() {
  els.question.style.height = "auto";
  els.question.style.height = `${Math.min(els.question.scrollHeight, 140)}px`;
}

// ページ全体は動かさず、会話欄の中だけを一番下までスクロールする
const scrollChat = () => els.chat.scrollTo({ top: els.chat.scrollHeight, behavior: "smooth" });

function appendBubble(role, html) {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.innerHTML = html;
  els.chat.append(div);
  scrollChat();
  return div;
}

function answerHtml(a) {
  const phrases = a.phrases.length
    ? `<ul class="phrases">${a.phrases
        .map(
          (p) => `<li>
            <p class="phrase-en" lang="en">${escapeHtml(p.en)}</p>
            <p class="phrase-ja">${escapeHtml(p.ja)}</p>
            <button type="button" class="copy" data-copy="${escapeHtml(p.en)}">コピー</button>
          </li>`,
        )
        .join("")}</ul>`
    : "";
  const tip = a.tip ? `<p class="tip">💡 ${escapeHtml(a.tip)}</p>` : "";
  return `<p>${escapeHtml(a.answer)}</p>${phrases}${tip}`;
}

// 会話の履歴としてAIに渡すためのテキスト版
const answerText = (a) =>
  [a.answer, ...a.phrases.map((p) => `${p.en}（${p.ja}）`), a.tip].filter(Boolean).join("\n");

async function ask() {
  const question = els.question.value.trim();
  if (!question || asking) return;
  if (config.requiresCode && !els.code.value.trim()) {
    appendBubble("assistant error-bubble", "<p>左の欄にクラスコードを入力してから質問してね。</p>");
    return;
  }

  asking = true;
  els.askBtn.disabled = true;
  els.question.value = "";
  autoGrow();
  appendBubble("user", `<p>${escapeHtml(question)}</p>`);
  const pending = appendBubble("assistant pending", `<span class="dots" aria-label="考えています"><i></i><i></i><i></i></span>`);

  try {
    const script = els.withScript.checked ? els.script.value.trim() : "";
    const { answer } = MOCK
      ? { answer: await mockAnswer(lesson, { question }) }
      : await api("/ask", { question, script, history: history.slice(-MAX_HISTORY) });
    pending.classList.remove("pending");
    pending.innerHTML = answerHtml(answer);
    history.push({ role: "user", content: question }, { role: "assistant", content: answerText(answer) });
  } catch (err) {
    pending.classList.remove("pending");
    pending.classList.add("error-bubble");
    pending.innerHTML = `<p>${escapeHtml(err.message)}</p>`;
    els.question.value = question;
    autoGrow();
  } finally {
    asking = false;
    els.askBtn.disabled = false;
    scrollChat();
  }
}

async function onChatClick(e) {
  const btn = e.target.closest("[data-copy]");
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    btn.textContent = "コピーしました";
  } catch {
    btn.textContent = "コピーできませんでした";
  }
  setTimeout(() => (btn.textContent = "コピー"), 1500);
}

init().catch(() => showError("読み込みに失敗しました。ページを再読み込みしてください。"));
