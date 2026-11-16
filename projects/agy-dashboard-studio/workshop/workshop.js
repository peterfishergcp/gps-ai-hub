/**
 * Build Dashboards with Antigravity (State of West Virginia Workshop)
 * Interactive progress tracker, copy buttons, wayfinding, and lightbox.
 * Zero innerHTML / alert() usage.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'wv-antigravity-dashboard-workshop-v1';
  var state = { done: {}, ready: {}, notes: true };
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      state = Object.assign(state, saved);
    }
  } catch {}

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  // Facilitator review notes stay hidden for participants unless ?review is in the URL.
  var notesBtn = document.getElementById('notesToggle');
  var reviewMode = /[?&]review(=|&|$)/.test(window.location.search);
  function renderNotes() {
    var on = reviewMode && state.notes;
    document.body.classList.toggle('hide-notes', !on);
    if (notesBtn) {
      notesBtn.textContent = 'Review notes: ' + (on ? 'on' : 'off');
      notesBtn.setAttribute('aria-pressed', String(on));
    }
  }
  if (reviewMode && notesBtn) {
    notesBtn.hidden = false;
    notesBtn.addEventListener('click', function () {
      state.notes = !state.notes;
      save();
      renderNotes();
    });
  }
  renderNotes();

  // Step progress tracker
  var doneBoxes = document.querySelectorAll('[data-done]');
  function renderProgress() {
    var count = 0;
    doneBoxes.forEach(function (box) {
      var stepId = box.getAttribute('data-done');
      var on = Boolean(state.done[stepId]);
      box.checked = on;
      if (on) count++;
      var stepArticle = document.getElementById('step-' + stepId);
      if (stepArticle) stepArticle.classList.toggle('is-done', on);
      document.querySelectorAll('[data-step-link="' + stepId + '"]').forEach(function (a) {
        a.classList.toggle('done', on);
      });
    });
    var textEl = document.getElementById('progressText');
    var barEl = document.getElementById('progressBar');
    if (textEl) textEl.textContent = count + ' of ' + doneBoxes.length + ' steps';
    if (barEl && doneBoxes.length > 0) {
      barEl.style.width = ((count / doneBoxes.length) * 100) + '%';
    }
  }

  doneBoxes.forEach(function (box) {
    box.addEventListener('change', function () {
      state.done[box.getAttribute('data-done')] = box.checked;
      save();
      renderProgress();
    });
  });

  document.querySelectorAll('[data-ready]').forEach(function (box) {
    box.checked = Boolean(state.ready[box.id]);
    box.addEventListener('change', function () {
      state.ready[box.id] = box.checked;
      save();
    });
  });
  renderProgress();

  // Copy buttons
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetEl = document.getElementById(btn.getAttribute('data-copy'));
      if (!targetEl) return;
      var text = targetEl.textContent || '';
      var originalLabel = btn.textContent;
      function markCopied() {
        btn.textContent = 'Copied';
        btn.classList.add('ok');
        setTimeout(function () {
          btn.textContent = originalLabel;
          btn.classList.remove('ok');
        }, 1600);
      }
      function fallbackSelect() {
        var range = document.createRange();
        range.selectNodeContents(targetEl);
        var sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
        btn.textContent = 'Press Ctrl/Cmd+C';
        setTimeout(function () {
          btn.textContent = originalLabel;
        }, 2200);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(markCopied, fallbackSelect);
      } else {
        fallbackSelect();
      }
    });
  });

  // Screenshot Lightbox (zero innerHTML — uses replaceChildren + cloneNode)
  var lb = document.getElementById('lightbox');
  var lbBody = document.getElementById('lbBody');
  var lbClose = document.getElementById('lbClose');
  if (lb && lbBody && lbClose) {
    document.querySelectorAll('main .frame').forEach(function (frame) {
      frame.setAttribute('tabindex', '0');
      frame.setAttribute('role', 'button');
      frame.setAttribute('aria-label', 'Enlarge diagram');
      function openModal() {
        lbBody.replaceChildren(frame.cloneNode(true));
        if (typeof lb.showModal === 'function') lb.showModal();
      }
      frame.addEventListener('click', openModal);
      frame.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          openModal();
        }
      });
    });
    lbClose.addEventListener('click', function () {
      lb.close();
    });
    lb.addEventListener('click', function (ev) {
      if (ev.target === lb || (ev.target.closest && ev.target.closest('.frame'))) {
        lb.close();
      }
    });
  }

  // Highlight active section in left rail / top chips
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.rail a, .chips a'));
  var targets = navLinks
    .map(function (a) {
      var href = a.getAttribute('href');
      return href && href.startsWith('#') ? document.querySelector(href) : null;
    })
    .filter(Boolean);

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            var id = '#' + en.target.id;
            navLinks.forEach(function (a) {
              a.classList.toggle('active', a.getAttribute('href') === id);
            });
            var activeChip = document.querySelector('.chips a.active');
            if (activeChip && window.matchMedia('(max-width: 1079px)').matches && activeChip.parentNode) {
              activeChip.parentNode.scrollLeft = activeChip.offsetLeft - 16;
            }
          }
        });
      },
      { rootMargin: '-32% 0px -60% 0px' }
    );
    targets.forEach(function (t) {
      io.observe(t);
    });
  }
})();
