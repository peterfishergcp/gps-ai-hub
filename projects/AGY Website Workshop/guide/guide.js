// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0
//
// Zero-innerHTML Interactive Workshop Guide Controller:
// - 2-state Light/Dark theme switcher with system fallback
// - ?review Facilitator Mode toggle
// - Core + Bonus step progress bar persisted in localStorage
// - 1-click clipboard copy buttons
// - ARIA keyboard-accessible Role Chooser tabs (ArrowLeft / ArrowRight)
// - Native <dialog> screenshot zoom lightbox using replaceChildren()

(function () {
  "use strict";

  var STORAGE_KEY = "agy-adk-workshop-v2";
  var SCHEME_KEY = "agy-workshop-color-scheme";
  var state = { done: {}, ready: {}, notes: true };

  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (parsed.done && typeof parsed.done === "object") state.done = parsed.done;
        if (parsed.ready && typeof parsed.ready === "object") state.ready = parsed.ready;
        if (typeof parsed.notes === "boolean") state.notes = parsed.notes;
      }
    }
  } catch (e) {}

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  // 1. Two-State Light/Dark Theme Switcher
  var themeBtn = document.getElementById("themeToggle");
  var schemeMeta = document.querySelector('meta[name="color-scheme"]');
  var systemDarkMql = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function getPinnedScheme() {
    try {
      var v = localStorage.getItem(SCHEME_KEY);
      return v === "light" || v === "dark" ? v : null;
    } catch (e) {
      return null;
    }
  }

  function getEffectiveScheme() {
    var pinned = getPinnedScheme();
    if (pinned) return pinned;
    return systemDarkMql && systemDarkMql.matches ? "dark" : "light";
  }

  function updateThemeButton() {
    if (!themeBtn) return;
    var effective = getEffectiveScheme();
    var nextLabel = effective === "dark" ? "Light theme" : "Dark theme";
    themeBtn.textContent = nextLabel;
    themeBtn.setAttribute("aria-label", "Switch to " + nextLabel.toLowerCase());
  }

  function applyScheme(pinned) {
    if (pinned === "light" || pinned === "dark") {
      if (schemeMeta) schemeMeta.setAttribute("content", pinned);
      document.documentElement.setAttribute("data-theme", pinned);
      try {
        localStorage.setItem(SCHEME_KEY, pinned);
      } catch (e) {}
    } else {
      if (schemeMeta) schemeMeta.setAttribute("content", "light dark");
      document.documentElement.removeAttribute("data-theme");
      try {
        localStorage.removeItem(SCHEME_KEY);
      } catch (e) {}
    }
    updateThemeButton();
  }

  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var currentEffective = getEffectiveScheme();
      var target = currentEffective === "dark" ? "light" : "dark";
      var sysScheme = systemDarkMql && systemDarkMql.matches ? "dark" : "light";
      if (getPinnedScheme() && target === sysScheme) {
        applyScheme(null);
      } else {
        applyScheme(target);
      }
    });
  }

  if (systemDarkMql && systemDarkMql.addEventListener) {
    systemDarkMql.addEventListener("change", updateThemeButton);
  }
  updateThemeButton();

  // 2. Facilitator ?review Notes Toggle
  var notesBtn = document.getElementById("notesToggle");
  var reviewMode = /[?&]review(=|&|$)/.test(window.location.search);

  function renderNotes() {
    var show = reviewMode && state.notes;
    document.body.classList.toggle("hide-notes", !show);
    if (notesBtn) {
      notesBtn.textContent = "Facilitator notes: " + (show ? "on" : "off");
      notesBtn.setAttribute("aria-pressed", String(show));
    }
  }

  if (reviewMode && notesBtn) {
    notesBtn.hidden = false;
    notesBtn.addEventListener("click", function () {
      state.notes = !state.notes;
      saveState();
      renderNotes();
    });
  }
  renderNotes();

  // 3. Core + Bonus Progress Tracker
  var doneBoxes = document.querySelectorAll("[data-done]");
  var progressText = document.getElementById("progressText");
  var progressBar = document.getElementById("progressBar");

  function renderProgress() {
    var coreDone = 0;
    var coreTotal = 0;
    var bonusDone = 0;
    doneBoxes.forEach(function (box) {
      var id = box.getAttribute("data-done");
      var checked = Boolean(state.done[id]);
      box.checked = checked;
      var isBonus = id.indexOf("4-") === 0;
      if (isBonus) {
        if (checked) bonusDone++;
      } else {
        coreTotal++;
        if (checked) coreDone++;
      }
      var stepEl = document.getElementById("step-" + id);
      if (stepEl) stepEl.classList.toggle("is-done", checked);
      document.querySelectorAll('[data-step-link="' + id + '"]').forEach(function (link) {
        link.classList.toggle("done", checked);
      });
    });
    if (progressBar) {
      progressBar.max = coreTotal || 10;
      progressBar.value = coreDone;
    }
    if (progressText) {
      var label = coreDone + " of " + coreTotal + " core steps";
      if (bonusDone > 0) label += " (+" + bonusDone + " bonus)";
      progressText.textContent = label;
    }
  }

  doneBoxes.forEach(function (box) {
    box.addEventListener("change", function () {
      state.done[box.getAttribute("data-done")] = box.checked;
      saveState();
      renderProgress();
    });
  });

  document.querySelectorAll("[data-ready]").forEach(function (box) {
    box.checked = Boolean(state.ready[box.id]);
    box.addEventListener("change", function () {
      state.ready[box.id] = box.checked;
      saveState();
    });
  });
  renderProgress();

  // 4. One-Click Copy Buttons
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = document.getElementById(btn.getAttribute("data-copy"));
      if (!target) return;
      var text = target.textContent;
      var orig = btn.textContent;
      function markCopied() {
        btn.textContent = "Copied ✓";
        btn.classList.add("ok");
        setTimeout(function () {
          btn.textContent = orig;
          btn.classList.remove("ok");
        }, 1600);
      }
      function selectFallback() {
        var range = document.createRange();
        range.selectNodeContents(target);
        var sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
        btn.textContent = "Press Cmd/Ctrl+C";
        setTimeout(function () {
          btn.textContent = orig;
        }, 2200);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(markCopied, selectFallback);
      } else {
        selectFallback();
      }
    });
  });

  // 5. Accessible Role Chooser Tabs
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".chooser-tab"));
  function activateTab(selectedTab, moveFocus) {
    tabs.forEach(function (tab) {
      var active = tab === selectedTab;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      var panel = document.getElementById(tab.getAttribute("aria-controls"));
      if (panel) panel.hidden = !active;
    });
    if (moveFocus) selectedTab.focus();
  }
  tabs.forEach(function (tab, idx) {
    tab.addEventListener("click", function () {
      activateTab(tab, false);
    });
    tab.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        var dir = e.key === "ArrowRight" ? 1 : -1;
        var next = tabs[(idx + dir + tabs.length) % tabs.length];
        activateTab(next, true);
      }
    });
  });

  // 6. Modal Lightbox (<dialog> + replaceChildren — zero innerHTML)
  var lb = document.getElementById("lightbox");
  var lbBody = document.getElementById("lbBody");
  var lbClose = document.getElementById("lbClose");

  if (lb && lbBody && lbClose) {
    document.querySelectorAll("main .frame").forEach(function (frame) {
      if (!frame.querySelector("img")) return;
      frame.classList.add("is-zoomable");
      frame.setAttribute("tabindex", "0");
      frame.setAttribute("role", "button");
      frame.setAttribute("aria-label", "Enlarge screenshot");
      function openModal() {
        var clone = frame.cloneNode(true);
        clone.removeAttribute("tabindex");
        clone.removeAttribute("role");
        clone.removeAttribute("aria-label");
        lbBody.replaceChildren(clone);
        if (typeof lb.showModal === "function") lb.showModal();
      }
      frame.addEventListener("click", openModal);
      frame.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openModal();
        }
      });
    });

    lbClose.addEventListener("click", function () {
      lb.close();
    });
    lbBody.addEventListener("click", function () {
      lb.close();
    });

    if (typeof HTMLDialogElement !== "undefined" && !("closedBy" in HTMLDialogElement.prototype)) {
      lb.addEventListener("click", function (event) {
        if (event.target !== lb) return;
        var rect = lb.getBoundingClientRect();
        var inside =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!inside) lb.close();
      });
    }
  }

  // 7. Scroll-Spy Active Highlight
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".rail a, .chips a"));
  var observedSections = [];
  navLinks.forEach(function (a) {
    var href = a.getAttribute("href");
    if (href && href.charAt(0) === "#") {
      var el = document.getElementById(href.slice(1));
      if (el && observedSections.indexOf(el) === -1) observedSections.push(el);
    }
  });

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var id = "#" + entry.target.id;
            navLinks.forEach(function (a) {
              a.classList.toggle("active", a.getAttribute("href") === id);
            });
          }
        });
      },
      { rootMargin: "-25% 0px -65% 0px" }
    );
    observedSections.forEach(function (sec) {
      observer.observe(sec);
    });
  }
})();
