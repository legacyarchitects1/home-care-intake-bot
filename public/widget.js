(function () {
  "use strict";

  var scriptEl = document.currentScript;
  var agencyId = scriptEl.getAttribute("data-agency");
  if (!agencyId) {
    console.error("[intake-widget] Missing required data-agency attribute on the script tag.");
    return;
  }
  var apiBase = scriptEl.getAttribute("data-api") || new URL(scriptEl.src).origin;

  var QUESTIONS = [
    { key: "name", prompt: "First, what's your name?", type: "text", placeholder: "Your name" },
    {
      key: "contact",
      prompt: "Best phone number or email to reach you?",
      type: "text",
      placeholder: "Phone or email",
    },
    {
      key: "relationship",
      prompt: "Is this for you, or for someone you're helping?",
      type: "choice",
      options: [
        { value: "self", label: "For me" },
        { value: "family_member", label: "For a family member" },
        { value: "other", label: "For someone else" },
      ],
    },
    {
      key: "livingSituation",
      prompt: "What's the current living situation? (e.g. living alone, with family, in assisted living)",
      type: "text",
      placeholder: "Describe the living situation",
    },
    {
      key: "careNeeds",
      prompt:
        "In a few words, what kind of help or care is needed? (No need for medical details — just a general description.)",
      type: "text",
      placeholder: "e.g. help with meals, bathing, transportation...",
    },
    {
      key: "paymentType",
      prompt: "What type of payment or insurance would be used?",
      type: "choice",
      options: [
        { value: "medicaid", label: "Medicaid" },
        { value: "medicare", label: "Medicare" },
        { value: "private_pay", label: "Private pay" },
        { value: "not_sure", label: "Not sure yet" },
      ],
    },
    {
      key: "ageBand",
      prompt: "Approximate age range?",
      type: "choice",
      options: [
        { value: "under_18", label: "Under 18" },
        { value: "18_64", label: "18–64" },
        { value: "65_plus", label: "65+" },
      ],
    },
  ];

  var DISCLAIMER =
    "This is not a medical or insurance determination. A licensed intake coordinator will contact you.";

  var state = { step: 0, answers: {}, submitting: false, done: false };
  var branding = null;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "style") Object.assign(node.style, attrs[k]);
        else if (k === "text") node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(c);
    });
    return node;
  }

  function injectStyles(primaryColor, textColor) {
    var style = document.createElement("style");
    style.textContent =
      "#icb-bubble{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;" +
      "background:" +
      primaryColor +
      ";color:#fff;border:none;cursor:pointer;font-size:26px;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:999999;}" +
      "#icb-panel{position:fixed;bottom:92px;right:20px;width:340px;max-width:92vw;height:460px;max-height:76vh;" +
      "background:#fff;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.28);display:none;flex-direction:column;" +
      "overflow:hidden;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;}" +
      "#icb-panel.icb-open{display:flex;}" +
      "#icb-header{background:" +
      primaryColor +
      ";color:#fff;padding:14px 16px;flex:0 0 auto;}" +
      "#icb-header .icb-name{font-weight:700;font-size:15px;}" +
      "#icb-header .icb-tagline{font-size:12px;opacity:.85;margin-top:2px;}" +
      "#icb-messages{flex:1 1 auto;overflow-y:auto;padding:14px;background:#f4f6f7;}" +
      ".icb-msg{max-width:85%;padding:9px 12px;border-radius:12px;margin-bottom:10px;font-size:13.5px;line-height:1.4;}" +
      ".icb-msg-bot{background:#fff;color:" +
      textColor +
      ";border:1px solid #e3e7e9;border-bottom-left-radius:3px;}" +
      ".icb-msg-user{background:" +
      primaryColor +
      ";color:#fff;margin-left:auto;border-bottom-right-radius:3px;}" +
      ".icb-msg-disclaimer{background:transparent;color:#8a96a0;font-size:11px;border:none;max-width:100%;text-align:center;margin:2px auto 12px;}" +
      "#icb-input-area{flex:0 0 auto;border-top:1px solid #e3e7e9;padding:10px;background:#fff;}" +
      "#icb-text-row{display:flex;gap:8px;}" +
      "#icb-text-input{flex:1;padding:9px 10px;border:1px solid #d5dbe0;border-radius:8px;font-size:13.5px;}" +
      "#icb-send-btn{background:" +
      primaryColor +
      ";color:#fff;border:none;border-radius:8px;padding:0 14px;cursor:pointer;font-size:13px;font-weight:600;}" +
      "#icb-choice-row{display:flex;flex-wrap:wrap;gap:6px;}" +
      ".icb-choice-btn{background:#fff;border:1.5px solid " +
      primaryColor +
      ";color:" +
      primaryColor +
      ";border-radius:20px;padding:7px 12px;font-size:13px;cursor:pointer;}" +
      ".icb-choice-btn:hover{background:" +
      primaryColor +
      ";color:#fff;}" +
      "#icb-close{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;float:right;line-height:1;}";
    document.head.appendChild(style);
  }

  function scrollToBottom(container) {
    container.scrollTop = container.scrollHeight;
  }

  function addBotMessage(container, text) {
    container.appendChild(el("div", { class: "icb-msg icb-msg-bot", text: text }));
    scrollToBottom(container);
  }

  function addUserMessage(container, text) {
    container.appendChild(el("div", { class: "icb-msg icb-msg-user", text: text }));
    scrollToBottom(container);
  }

  function addDisclaimer(container) {
    container.appendChild(el("div", { class: "icb-msg icb-msg-disclaimer", text: DISCLAIMER }));
    scrollToBottom(container);
  }

  function renderInputArea(inputArea, messages) {
    inputArea.innerHTML = "";

    if (state.done) return;

    if (state.submitting) {
      inputArea.appendChild(el("div", { style: { fontSize: "12px", color: "#8a96a0" }, text: "Sending..." }));
      return;
    }

    var question = QUESTIONS[state.step];
    if (!question) return;

    if (question.type === "choice") {
      var row = el("div", { id: "icb-choice-row" });
      question.options.forEach(function (opt) {
        var btn = el("button", { class: "icb-choice-btn", text: opt.label, type: "button" });
        btn.addEventListener("click", function () {
          answerCurrentQuestion(opt.value, opt.label, messages, inputArea);
        });
        row.appendChild(btn);
      });
      inputArea.appendChild(row);
    } else {
      var textRow = el("div", { id: "icb-text-row" });
      var input = el("input", {
        id: "icb-text-input",
        type: "text",
        placeholder: question.placeholder || "",
      });
      var send = el("button", { id: "icb-send-btn", text: "Send", type: "button" });
      function submitText() {
        var value = input.value.trim();
        if (!value) return;
        answerCurrentQuestion(value, value, messages, inputArea);
      }
      send.addEventListener("click", submitText);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") submitText();
      });
      textRow.appendChild(input);
      textRow.appendChild(send);
      inputArea.appendChild(textRow);
      input.focus();
    }
  }

  function answerCurrentQuestion(value, displayLabel, messages, inputArea) {
    var question = QUESTIONS[state.step];
    state.answers[question.key] = value;
    addUserMessage(messages, displayLabel);
    state.step += 1;

    if (state.step < QUESTIONS.length) {
      addBotMessage(messages, QUESTIONS[state.step].prompt);
      renderInputArea(inputArea, messages);
    } else {
      submitIntake(messages, inputArea);
    }
  }

  function submitIntake(messages, inputArea) {
    state.submitting = true;
    renderInputArea(inputArea, messages);

    var payload = Object.assign({ agencyId: agencyId }, state.answers);

    fetch(apiBase + "/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Request failed.");
          return data;
        });
      })
      .then(function (data) {
        state.submitting = false;
        state.done = true;
        addBotMessage(messages, data.clientMessage);
        addDisclaimer(messages);
        renderInputArea(inputArea, messages);
      })
      .catch(function (err) {
        console.error("[intake-widget] Submission failed:", err);
        state.submitting = false;
        addBotMessage(
          messages,
          "Something went wrong sending that. Please try again in a moment, or contact us directly.",
        );
        renderInputArea(inputArea, messages);
      });
  }

  function buildPanel(branding) {
    var panel = el("div", { id: "icb-panel" });

    var header = el("div", { id: "icb-header" });
    var closeBtn = el("button", { id: "icb-close", text: "✕", type: "button" });
    closeBtn.addEventListener("click", function () {
      panel.classList.remove("icb-open");
    });
    header.appendChild(closeBtn);
    header.appendChild(el("div", { class: "icb-name", text: branding.agencyName }));
    if (branding.tagline) {
      header.appendChild(el("div", { class: "icb-tagline", text: branding.tagline }));
    }

    var messages = el("div", { id: "icb-messages" });
    var inputArea = el("div", { id: "icb-input-area" });

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(inputArea);

    addDisclaimer(messages);
    addBotMessage(
      messages,
      "Hi! I can help figure out next steps for home care. This takes about a minute — " + QUESTIONS[0].prompt,
    );
    renderInputArea(inputArea, messages);

    return panel;
  }

  function init() {
    fetch(apiBase + "/api/config/" + encodeURIComponent(agencyId))
      .then(function (res) {
        if (!res.ok) throw new Error("Could not load agency configuration.");
        return res.json();
      })
      .then(function (config) {
        branding = config;
        injectStyles(branding.primaryColor || "#2E7380", branding.textColor || "#0F2336");

        var panel = buildPanel(branding);
        var bubble = el("button", { id: "icb-bubble", text: "💬", type: "button" });
        bubble.addEventListener("click", function () {
          panel.classList.toggle("icb-open");
        });

        document.body.appendChild(bubble);
        document.body.appendChild(panel);
      })
      .catch(function (err) {
        console.error("[intake-widget] Failed to initialize:", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
