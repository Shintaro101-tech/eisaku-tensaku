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
    if (e.target.id === "show-better") els.feedback.classList.toggle("hide-better", !e.target.checked);
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
  try {
    const previousScript = previous && previous.script !== script ? previous.script : "";
    const { feedback } = MOCK
      ? { feedback: await mockFeedback(lesson, { script, previousScript }) }
      : await api("/check", { script, previousScript });

    const errorCount = countIssues(feedback, "error");
    render(feedback, previousScript ? previous.errorCount : null);
    previous = { script, errorCount };
    if (els.paneResult.hidden) els.resultBadge.hidden = false;
    if (isNarrow()) els.side.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  els.checkBtn.disabled = on;
  els.checkBtn.querySelector(".btn-label").textContent = on ? "チェック中…" : previous ? "もう一度チェックする" : "チェックする";
  els.loading.hidden = !on;
  els.empty.hidden = on || Boolean(previous);
  els.feedback.hidden = on || !previous;
}

const countIssues = (fb, kind) => fb.sentences.reduce((n, s) => n + s.issues.filter((i) => i.kind === kind).length, 0);

const STATUS_ICON = { ok: "✅", weak: "🔸", missing: "⚠️" };
const KIND_LABEL = { error: "直そう", better: "もっと良くする" };

function render(fb, prevErrorCount) {
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

  const good = fb.good_points.length
    ? `<div class="fb-block"><h3>⭐ 良いところ</h3><ul class="good-list">${fb.good_points
        .map((g) => `<li>${escapeHtml(g)}</li>`)
        .join("")}</ul></div>`
    : "";

  const structure = `<div class="fb-block"><h3>📋 構成チェック</h3><ul class="structure">${fb.structure
    .map(
      (s) => `<li class="${s.status}">
        <span aria-hidden="true">${STATUS_ICON[s.status]}</span>
        <span class="s-name">${escapeHtml(secLabel[s.section] || s.section)}</span>
        ${s.status === "ok" ? "" : `<span class="s-comment">${escapeHtml(s.comment)}</span>`}
      </li>`,
    )
    .join("")}</ul></div>`;

  let issueId = 0;
  const sentences = fb.sentences
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

  const betterToggle = betters
    ? `<label class="optional-toggle"><input type="checkbox" id="show-better"> 「もっと良くする」提案も表示する</label>`
    : "";

  const script = `<div class="fb-block"><h3>✏️ あなたの原稿</h3>
    ${counts}
    <p class="next">色のついたところをタップすると、ヒントが見られます。まずは自分で考えて、原稿を直してみよう。わからないときは「💬 なんでも質問」で聞いてもOK。</p>
    ${sentences}
    ${betterToggle}
    <button type="button" class="reveal back-to-edit" data-back>✏️ 原稿を直しにもどる</button>
  </div>`;

  els.feedback.innerHTML = summary + good + structure + script;
  els.feedback.classList.add("hide-better");
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
    <button type="button" class="reveal" data-reveal="${i.id}">答えを見る</button>
    <div class="answer" hidden>
      <p class="fix"><del>${escapeHtml(i.original)}</del> → <ins>${escapeHtml(i.suggestion)}</ins></p>
      <p class="why">${escapeHtml(i.explanation)}</p>
    </div>
  </div>`;
}

function onFeedbackClick(e) {
  const reveal = e.target.closest("[data-reveal]");
  if (reveal) {
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
