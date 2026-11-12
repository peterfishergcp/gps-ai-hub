// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0
//
// Safe DOM rendering using createElement + textContent only (zero innerHTML sinks).

(function () {
  "use strict";

  var INITIATIVES = [
    {
      title: "Policy Briefing Synthesizer",
      status: "Active Pilot",
      summary: "Summarizes multi-agency regulatory updates into plain-language executive briefs with source citations."
    },
    {
      title: "Constituent Intake Triage Assistant",
      status: "Active Pilot",
      summary: "Routes incoming service requests to specialist queues while enforcing strict PII handling boundaries."
    },
    {
      title: "Readiness Exercise Coach",
      status: "Planned",
      summary: "Multi-agent ADK coach pairing a topic explainer with a scenario quizzer for analyst onboarding."
    }
  ];

  function updateGreeting() {
    var greetingEl = document.getElementById("greetingText");
    if (!greetingEl) return;
    var hour = new Date().getHours();
    var prefix = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    greetingEl.textContent = prefix + " · Mission Operations";
  }

  function renderProjects(onlyActive) {
    var grid = document.getElementById("projectGrid");
    var countEl = document.getElementById("projectCount");
    if (!grid) return;

    var items = INITIATIVES.filter(function (item) {
      return !onlyActive || item.status === "Active Pilot";
    });

    grid.replaceChildren();
    items.forEach(function (item) {
      var article = document.createElement("article");
      article.setAttribute("class", "project-card");

      var badge = document.createElement("span");
      badge.setAttribute("class", "project-status");
      badge.textContent = item.status;

      var heading = document.createElement("h3");
      heading.textContent = item.title;

      var body = document.createElement("p");
      body.textContent = item.summary;

      article.appendChild(badge);
      article.appendChild(heading);
      article.appendChild(body);
      grid.appendChild(article);
    });

    if (countEl) {
      countEl.textContent = items.length + (items.length === 1 ? " initiative" : " initiatives");
    }
  }

  function bindFilters() {
    var allBtn = document.getElementById("filterAllBtn");
    var activeBtn = document.getElementById("filterActiveBtn");
    if (!allBtn || !activeBtn) return;

    allBtn.addEventListener("click", function () {
      allBtn.setAttribute("aria-pressed", "true");
      activeBtn.setAttribute("aria-pressed", "false");
      renderProjects(false);
    });

    activeBtn.addEventListener("click", function () {
      allBtn.setAttribute("aria-pressed", "false");
      activeBtn.setAttribute("aria-pressed", "true");
      renderProjects(true);
    });
  }

  updateGreeting();
  bindFilters();
  renderProjects(false);
})();
