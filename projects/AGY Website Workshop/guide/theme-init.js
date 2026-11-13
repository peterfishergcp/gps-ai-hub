// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0
// Pre-paint color-scheme initializer (prevents flash of wrong theme).

(function () {
  "use strict";
  try {
    var savedScheme = localStorage.getItem("agy-workshop-color-scheme");
    if (savedScheme === "light" || savedScheme === "dark") {
      var meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.setAttribute("content", savedScheme);
      document.documentElement.setAttribute("data-theme", savedScheme);
    }
  } catch (e) {}
})();
