/* Daily Useful Tools — vanilla JS, no dependencies.
   All state is persisted in localStorage on this browser only. */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (_) {
        /* storage full or disabled — fail silently */
      }
    },
  };

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("コピーしました");
    } catch (_) {
      toast("コピーできませんでした");
    }
  }

  /* ---------- Tabs ---------- */
  function initTabs() {
    const last = store.get("activeTab", "todo");
    function activate(name) {
      $$(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
      $$(".panel").forEach((p) => p.classList.toggle("is-active", p.id === name));
      store.set("activeTab", name);
    }
    $$(".tab").forEach((t) => t.addEventListener("click", () => activate(t.dataset.tab)));
    if ($("#" + last)) activate(last);
  }

  /* ---------- Theme ---------- */
  function initTheme() {
    const btn = $("#theme-toggle");
    const apply = (theme) => {
      document.documentElement.setAttribute("data-theme", theme);
      btn.textContent = theme === "dark" ? "☀️" : "🌙";
      store.set("theme", theme);
    };
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    apply(store.get("theme", prefersDark ? "dark" : "light"));
    btn.addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(next);
    });
  }

  /* ---------- ToDo ---------- */
  function initTodo() {
    let todos = store.get("todos", []);
    let filter = "all";
    const list = $("#todo-list");
    const input = $("#todo-input");
    const empty = $("#todo-empty");
    const remaining = $("#todo-remaining");

    const save = () => store.set("todos", todos);

    function render() {
      const shown = todos.filter((t) =>
        filter === "all" ? true : filter === "active" ? !t.done : t.done
      );
      list.innerHTML = "";
      shown.forEach((t) => {
        const li = document.createElement("li");
        li.className = "todo-item" + (t.done ? " done" : "");

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = t.done;
        cb.addEventListener("change", () => {
          t.done = cb.checked;
          save();
          render();
        });

        const span = document.createElement("span");
        span.className = "todo-text";
        span.textContent = t.text;

        const prio = document.createElement("span");
        prio.className = "prio " + t.priority;
        prio.textContent = t.priority === "high" ? "重要" : t.priority === "low" ? "あとで" : "";

        const del = document.createElement("button");
        del.className = "todo-del";
        del.textContent = "×";
        del.title = "削除";
        del.addEventListener("click", () => {
          todos = todos.filter((x) => x.id !== t.id);
          save();
          render();
        });

        li.append(cb, span, prio, del);
        list.appendChild(li);
      });

      const left = todos.filter((t) => !t.done).length;
      remaining.textContent = left;
      empty.style.display = todos.length === 0 ? "block" : "none";
    }

    $("#todo-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      todos.unshift({
        id: Date.now() + "" + Math.random().toString(36).slice(2, 6),
        text,
        done: false,
        priority: $("#todo-priority").value,
      });
      input.value = "";
      save();
      render();
    });

    $$(".todo-filters .chip").forEach((c) =>
      c.addEventListener("click", () => {
        filter = c.dataset.filter;
        $$(".todo-filters .chip").forEach((x) => x.classList.toggle("is-active", x === c));
        render();
      })
    );

    $("#todo-clear").addEventListener("click", () => {
      todos = todos.filter((t) => !t.done);
      save();
      render();
    });

    render();
  }

  /* ---------- Pomodoro ---------- */
  function initPomodoro() {
    const display = $("#pomo-display");
    const modeEl = $("#pomo-mode");
    const countEl = $("#pomo-count");
    const workIn = $("#pomo-work");
    const breakIn = $("#pomo-break");

    let mode = "work"; // work | break
    let remaining = parseInt(workIn.value, 10) * 60;
    let ticking = null;

    // reset daily count if the date changed
    const today = new Date().toDateString();
    let stat = store.get("pomoStat", { date: today, count: 0 });
    if (stat.date !== today) stat = { date: today, count: 0 };
    countEl.textContent = stat.count;

    function fmt(s) {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
    }
    function paint() {
      display.textContent = fmt(remaining);
      modeEl.textContent = mode === "work" ? "作業" : "休憩";
      document.title = (ticking ? fmt(remaining) + " · " : "") + "Daily Useful Tools";
    }
    function durationFor(m) {
      return (m === "work" ? parseInt(workIn.value, 10) || 25 : parseInt(breakIn.value, 10) || 5) * 60;
    }
    function beep() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g);
        g.connect(ctx.destination);
        o.frequency.value = 880;
        o.start();
        g.gain.setValueAtTime(0.2, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
        o.stop(ctx.currentTime + 0.6);
      } catch (_) {}
    }
    function switchMode() {
      beep();
      if (mode === "work") {
        stat.count += 1;
        stat.date = new Date().toDateString();
        store.set("pomoStat", stat);
        countEl.textContent = stat.count;
        mode = "break";
        toast("作業終了！休憩しましょう ☕");
      } else {
        mode = "work";
        toast("休憩終了！作業を再開 💪");
      }
      remaining = durationFor(mode);
      paint();
    }
    function stop() {
      clearInterval(ticking);
      ticking = null;
    }
    function start() {
      if (ticking) return;
      ticking = setInterval(() => {
        remaining -= 1;
        if (remaining < 0) {
          switchMode();
        } else {
          paint();
        }
      }, 1000);
    }

    $("#pomo-start").addEventListener("click", start);
    $("#pomo-pause").addEventListener("click", () => {
      stop();
      paint();
    });
    $("#pomo-reset").addEventListener("click", () => {
      stop();
      mode = "work";
      remaining = durationFor("work");
      paint();
    });
    [workIn, breakIn].forEach((el) =>
      el.addEventListener("change", () => {
        if (!ticking) {
          remaining = durationFor(mode);
          paint();
        }
      })
    );

    paint();
  }

  /* ---------- Memo ---------- */
  function initMemo() {
    const area = $("#memo-area");
    const status = $("#memo-status");
    area.value = store.get("memo", "");
    let t;
    area.addEventListener("input", () => {
      status.textContent = "保存中…";
      clearTimeout(t);
      t = setTimeout(() => {
        store.set("memo", area.value);
        status.textContent = "保存済み";
      }, 400);
    });
    $("#memo-copy").addEventListener("click", () => copyText(area.value));
    $("#memo-clear").addEventListener("click", () => {
      if (area.value && !confirm("メモを消去しますか？")) return;
      area.value = "";
      store.set("memo", "");
      status.textContent = "保存済み";
    });
  }

  /* ---------- Text tools ---------- */
  function initText() {
    const area = $("#text-area");
    area.value = store.get("textTool", "");

    function stats() {
      const v = area.value;
      $("#t-chars").textContent = [...v].length;
      $("#t-chars-ns").textContent = [...v.replace(/\s/g, "")].length;
      $("#t-words").textContent = v.trim() ? v.trim().split(/\s+/).length : 0;
      $("#t-lines").textContent = v ? v.split("\n").length : 0;
    }
    area.addEventListener("input", () => {
      stats();
      store.set("textTool", area.value);
    });

    const ops = {
      upper: (s) => s.toUpperCase(),
      lower: (s) => s.toLowerCase(),
      capitalize: (s) => s.replace(/\b\w/g, (c) => c.toUpperCase()),
      trim: (s) => s.trim(),
      collapse: (s) => s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n"),
      dedup: (s) => [...new Set(s.split("\n"))].join("\n"),
      sort: (s) => s.split("\n").sort((a, b) => a.localeCompare(b, "ja")).join("\n"),
      reverse: (s) => s.split("\n").reverse().join("\n"),
    };

    $$("#text [data-text-op]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const op = btn.dataset.textOp;
        if (op === "copy") {
          copyText(area.value);
          return;
        }
        area.value = ops[op](area.value);
        stats();
        store.set("textTool", area.value);
      })
    );

    stats();
  }

  /* ---------- JSON ---------- */
  function initJson() {
    const area = $("#json-area");
    const msg = $("#json-msg");
    area.value = store.get("jsonTool", "");
    area.addEventListener("input", () => store.set("jsonTool", area.value));

    function show(ok, text) {
      msg.textContent = text;
      msg.className = "json-msg " + (ok ? "ok" : "err");
    }

    $$("#json [data-json-op]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const op = btn.dataset.jsonOp;
        if (op === "copy") {
          copyText(area.value);
          return;
        }
        try {
          const parsed = JSON.parse(area.value);
          area.value = JSON.stringify(parsed, null, op === "format" ? 2 : 0);
          store.set("jsonTool", area.value);
          show(true, op === "format" ? "整形しました ✓" : "圧縮しました ✓");
        } catch (e) {
          show(false, "JSONエラー: " + e.message);
        }
      })
    );
  }

  /* ---------- Boot ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initTabs();
    initTodo();
    initPomodoro();
    initMemo();
    initText();
    initJson();
  });
})();
