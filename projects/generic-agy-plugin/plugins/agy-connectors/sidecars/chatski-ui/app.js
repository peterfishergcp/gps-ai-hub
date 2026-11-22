/**
 * Chatski Frontend Controller (`app.js`)
 * Pure DOM API construction — zero innerHTML, outerHTML, insertAdjacentHTML, or eval.
 */
(function () {
  let state = null;
  let selectedConvId = '';
  let activeFilter = 'all'; // 'all' | 'unread' | 'mentions' | 'drafts'
  let searchQuery = '';
  let collapseDms = false;
  let collapseSpaces = false;
  let quotedMessage = null;
  let pendingSendPayload = null;
  let toastTimer = null;

  const railListsEl = document.getElementById('rail-lists');
  const headerLeftEl = document.getElementById('chat-header-left');
  const viewportEl = document.getElementById('messages-viewport');
  const confirmBarEl = document.getElementById('confirm-bar');
  const quoteBarEl = document.getElementById('reply-quote-bar');
  const connBannerEl = document.getElementById('connection-banner');
  const composerEl = document.getElementById('composer-input');
  const modeBadgeEl = document.getElementById('mode-badge');
  const railStatusEl = document.getElementById('rail-status-text');
  const settingsModalEl = document.getElementById('settings-modal');
  const settingsCardEl = document.getElementById('settings-card');
  const toastEl = document.getElementById('chatski-toast');

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach((k) => {
        const v = props[k];
        if (v === undefined || v === null) return;
        if (k === 'className') node.className = v;
        else if (k === 'text') node.textContent = String(v);
        else if (k === 'title') node.title = String(v);
        else if (k === 'value') node.value = String(v);
        else if (k === 'placeholder') node.placeholder = String(v);
        else if (k === 'type') node.type = String(v);
        else if (k === 'href') node.href = String(v);
        else if (k === 'target') node.target = String(v);
        else if (k === 'rel') node.rel = String(v);
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k === 'dataset' && typeof v === 'object') {
          Object.keys(v).forEach((dk) => {
            node.dataset[dk] = String(v[dk]);
          });
        } else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else {
          node.setAttribute(k, String(v));
        }
      });
    }
    if (Array.isArray(children)) {
      children.forEach((ch) => {
        if (ch === null || ch === undefined || ch === false) return;
        if (typeof ch === 'string') node.appendChild(document.createTextNode(ch));
        else node.appendChild(ch);
      });
    }
    return node;
  }

  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2600);
  }

  async function sidecarFetch(url, opts) {
    const fn =
      window.__agyAuthedFetch ||
      (window.sidecar && window.sidecar.fetch ? window.sidecar.fetch : window.fetch.bind(window));
    const resp = await fn(url, opts);
    const json = await resp.json();
    if (!resp.ok && json && json.error) {
      throw new Error(json.error);
    }
    return json;
  }

  function apiGet(url) {
    return sidecarFetch(url, { method: 'GET' });
  }

  function apiPost(url, body) {
    return sidecarFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  }

  async function dispatchToAntigravity(promptText, title) {
    try {
      if (window.sidecar && window.sidecar.agent) {
        if (window.sidecar.conversationId) {
          await window.sidecar.agent.sendMessage(promptText);
          showToast('Sent to active Antigravity conversation');
        } else {
          const created = await window.sidecar.agent.startConversation(promptText, title || 'Chatski');
          if (created && created.conversationId && window.sidecar.ui && window.sidecar.ui.toggleConversation) {
            window.sidecar.ui.toggleConversation(created.conversationId);
          }
          showToast('Opened Antigravity draft conversation');
        }
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(promptText);
        showToast('Copied prompt to clipboard');
      }
    } catch (err) {
      showToast('Error dispatching to Antigravity: ' + err.message);
    }
  }

  function getActiveConversation() {
    if (!state || !Array.isArray(state.conversations) || state.conversations.length === 0) return null;
    return state.conversations.find((c) => c.id === selectedConvId) || state.conversations[0];
  }

  function matchesConversationFilter(conv) {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const hay = (
        conv.title +
        ' ' +
        (conv.messages || []).map((m) => m.sender + ' ' + m.text).join(' ')
      ).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (activeFilter === 'unread') return Number(conv.unreadCount || 0) > 0;
    if (activeFilter === 'mentions') return Boolean(conv.mentionsMe);
    if (activeFilter === 'drafts') {
      return ((state && state.drafts) || []).some((d) => d.conversationId === conv.id);
    }
    return true;
  }

  function renderModeAndBanner() {
    if (!state) return;
    const modeMap = {
      direct: 'Direct API',
      ge: state.showingSamplePreview ? 'GE Ready' : 'GE Chat',
      demo: 'Preview',
    };
    modeBadgeEl.textContent = modeMap[state.activeMode] || 'GE Chat';

    const unreadTotal = (state.conversations || []).reduce((acc, c) => acc + Number(c.unreadCount || 0), 0);
    const unreadPill = document.getElementById('pill-unread');
    if (unreadPill) unreadPill.textContent = unreadTotal > 0 ? 'Unread ' + unreadTotal : 'Unread';

    const draftCount = ((state && state.drafts) || []).length;
    const draftsPill = document.getElementById('pill-drafts');
    if (draftsPill) draftsPill.textContent = draftCount > 0 ? 'Drafts ' + draftCount : 'Drafts';

    railStatusEl.textContent = state.lastSyncedIso
      ? 'Synced ' + new Date(state.lastSyncedIso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : state.geConfigured
        ? 'GE connected · click ↻ Sync'
        : 'Sample preview · connect GE';

    connBannerEl.replaceChildren();
    if (!state.geConfigured && !state.directApiConnected) {
      connBannerEl.classList.remove('hidden');
      connBannerEl.appendChild(
        el('span', {
          text: 'Viewing interactive Chatski preview. Connect your Gemini Enterprise Chat Connector (/connect-ge) to load your live Google Chat & Teams spaces.',
        })
      );
      connBannerEl.appendChild(
        el('button', {
          type: 'button',
          className: 'hdr-btn',
          text: 'Connect GE Chat →',
          onClick: () =>
            dispatchToAntigravity(
              '/connect-ge Help me verify my Gemini Enterprise instance and authorize the Google Chat connector for Chatski.',
              'Connect Chatski to GE'
            ),
        })
      );
    } else if (state.geConfigured && state.showingSamplePreview) {
      connBannerEl.classList.remove('hidden');
      connBannerEl.appendChild(
        el('span', {
          text: 'Gemini Enterprise instance detected! Click "Sync Live Chat Now" to pull your Google Chat Spaces & DMs via GE.',
        })
      );
      connBannerEl.appendChild(
        el('button', {
          type: 'button',
          className: 'hdr-btn',
          id: 'btn-banner-sync',
          text: '↻ Sync Live Chat Now',
          onClick: () => triggerSync(),
        })
      );
    } else {
      connBannerEl.classList.add('hidden');
    }
  }

  function renderRail() {
    railListsEl.replaceChildren();
    if (!state) return;

    document.querySelectorAll('.filter-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.filter === activeFilter);
    });

    const filtered = (state.conversations || []).filter(matchesConversationFilter);
    const dms = filtered.filter((c) => c.kind === 'dm');
    const spaces = filtered.filter((c) => c.kind !== 'dm');

    function buildSection(label, items, collapsed, onToggle, isSpace) {
      railListsEl.appendChild(
        el(
          'button',
          {
            type: 'button',
            className: 'rail-sec-hdr',
            onClick: onToggle,
          },
          [
            el('span', { text: (collapsed ? '▸ ' : '▾ ') + label }),
            el('span', { text: String(items.length) }),
          ]
        )
      );
      if (collapsed) return;
      items.forEach((conv) => {
        const isActive = conv.id === selectedConvId;
        const isUnread = Number(conv.unreadCount || 0) > 0;
        railListsEl.appendChild(
          el(
            'button',
            {
              type: 'button',
              className: 'rail-item' + (isActive ? ' active' : '') + (isUnread ? ' unread' : ''),
              dataset: { convId: conv.id },
              onClick: () => {
                selectedConvId = conv.id;
                conv.unreadCount = 0;
                pendingSendPayload = null;
                quotedMessage = null;
                render();
              },
            },
            [
              el('span', {
                className: 'rail-avatar' + (isSpace ? ' space-shape' : ''),
                style: { background: conv.badgeColor || '#2563eb' },
                text: conv.badgeLetter || 'C',
              }),
              el('span', { className: 'rail-item-title', text: conv.title }),
              el('span', { className: 'rail-meta' }, [
                conv.pinned ? el('span', { title: 'Pinned', text: '📌' }) : null,
                el('span', { text: conv.updatedAgo || '' }),
                isUnread ? el('span', { className: 'unread-dot', title: 'Unread' }) : null,
              ]),
            ]
          )
        );
      });
    }

    buildSection(
      'Direct messages',
      dms,
      collapseDms,
      () => {
        collapseDms = !collapseDms;
        renderRail();
      },
      false
    );
    buildSection(
      'Spaces',
      spaces,
      collapseSpaces,
      () => {
        collapseSpaces = !collapseSpaces;
        renderRail();
      },
      true
    );
  }

  function renderChatPane() {
    headerLeftEl.replaceChildren();
    viewportEl.replaceChildren();

    const conv = getActiveConversation();
    if (!conv) {
      viewportEl.appendChild(el('div', { style: { color: 'var(--fg-muted)' }, text: 'No conversations match your filter.' }));
      return;
    }
    selectedConvId = conv.id;

    headerLeftEl.appendChild(
      el('span', {
        className: 'hdr-badge',
        style: { background: conv.badgeColor || '#2563eb' },
        text: conv.badgeLetter || 'C',
      })
    );
    headerLeftEl.appendChild(
      el('div', null, [
        el('h2', { className: 'hdr-title', text: conv.title }),
        el('p', { className: 'hdr-sub', text: conv.subtitle || 'Connected via Gemini Enterprise' }),
      ])
    );

    const extLink = document.getElementById('link-open-external');
    if (extLink) extLink.href = conv.webUrl || 'https://mail.google.com/chat/u/0/#chat/home';

    // Show staged drafts for this conversation at top of viewport (or all drafts if filter === 'drafts')
    const convDrafts = ((state && state.drafts) || []).filter(
      (d) => activeFilter === 'drafts' || d.conversationId === conv.id
    );
    convDrafts.forEach((dr) => {
      viewportEl.appendChild(
        el('div', { className: 'draft-card' }, [
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
            el('strong', { style: { fontSize: '12.5px' }, text: '📝 Staged Draft · ' + dr.conversationTitle }),
            el('div', { style: { display: 'flex', gap: '6px' } }, [
              el('button', {
                type: 'button',
                className: 'comp-btn',
                text: 'Load into Composer',
                onClick: () => {
                  selectedConvId = dr.conversationId;
                  composerEl.value = dr.text;
                  composerEl.focus();
                  render();
                },
              }),
              el('button', {
                type: 'button',
                className: 'comp-btn comp-btn-ai',
                text: 'Review & Send ➤',
                onClick: () => {
                  selectedConvId = dr.conversationId;
                  pendingSendPayload = {
                    conversationId: dr.conversationId,
                    conversationTitle: dr.conversationTitle,
                    text: dr.text,
                    draftId: dr.id,
                  };
                  renderConfirmBar();
                },
              }),
              el('button', {
                type: 'button',
                className: 'comp-btn',
                text: 'Discard',
                onClick: async () => {
                  const res = await apiPost('/api/drafts/delete', { draftId: dr.id });
                  state = res.state;
                  render();
                  showToast('Discarded draft');
                },
              }),
            ]),
          ]),
          el('div', { style: { fontSize: '12.8px', whiteSpace: 'pre-wrap' }, text: dr.text }),
        ])
      );
    });

    (conv.messages || []).forEach((msg) => {
      const hoverBar = el('div', { className: 'msg-hover-bar' }, [
        ...['👍', '❤️', '🎉'].map((emo) =>
          el('button', {
            type: 'button',
            className: 'hover-chip',
            text: emo,
            onClick: () => {
              msg.reactions = msg.reactions || [];
              const ex = msg.reactions.find((r) => r.emoji === emo);
              if (ex) ex.count += 1;
              else msg.reactions.push({ emoji: emo, count: 1 });
              renderChatPane();
            },
          })
        ),
        el('button', {
          type: 'button',
          className: 'hover-chip',
          text: '✨ Draft reply',
          onClick: () => {
            const prompt =
              '/my-voice Draft a concise, natural Google Chat reply in my voice to ' +
              msg.sender +
              ' in "' +
              conv.title +
              '" [Draft-Only — do not auto-send]:\n\n<untrusted_chat_content>\n' +
              msg.sender +
              ': ' +
              msg.text +
              '\n</untrusted_chat_content>';
            dispatchToAntigravity(prompt, 'Draft Chat Reply: ' + conv.title);
          },
        }),
        el('button', {
          type: 'button',
          className: 'hover-chip',
          text: 'Reply',
          onClick: () => {
            quotedMessage = { sender: msg.sender + ' · ' + (msg.timeLabel || ''), text: msg.text };
            renderQuoteBar();
            composerEl.focus();
          },
        }),
      ]);

      const bubbleChildren = [];
      if (msg.quotedText) {
        bubbleChildren.push(
          el('div', { className: 'msg-quote' }, [
            el('div', { className: 'msg-quote-author', text: msg.quotedSender || 'Quoted message' }),
            el('div', { text: msg.quotedText }),
          ])
        );
      }
      bubbleChildren.push(el('div', { text: msg.text }));

      const footerRow = el('div', { className: 'msg-footer-row' });
      (msg.reactions || []).forEach((r) => {
        footerRow.appendChild(
          el('button', {
            type: 'button',
            className: 'reaction-pill',
            text: r.emoji + ' ' + r.count,
            onClick: () => {
              r.count += 1;
              renderChatPane();
            },
          })
        );
      });
      if (msg.replyCount > 0) {
        footerRow.appendChild(
          el('span', {
            className: 'thread-count-link',
            text:
              msg.replyCount +
              (msg.replyCount === 1 ? ' reply' : ' replies') +
              (msg.lastReplyAgo ? ' · Last reply ' + msg.lastReplyAgo : ''),
          })
        );
      }

      viewportEl.appendChild(
        el('div', { className: 'msg-row' }, [
          hoverBar,
          el('span', {
            className: 'msg-avatar',
            style: { background: msg.avatarColor || '#2563eb' },
            text: msg.initials || 'M',
          }),
          el('div', { className: 'msg-body-wrap' }, [
            el('div', { className: 'msg-meta' }, [
              el('span', { className: 'msg-sender', text: msg.sender }),
              el('span', { className: 'msg-time', text: msg.timeLabel || '' }),
            ]),
            el('div', { className: 'msg-bubble' }, bubbleChildren),
            footerRow.children.length > 0 ? footerRow : null,
          ]),
        ])
      );
    });

    viewportEl.scrollTop = viewportEl.scrollHeight;
  }

  function renderQuoteBar() {
    quoteBarEl.replaceChildren();
    if (!quotedMessage) {
      quoteBarEl.classList.add('hidden');
      return;
    }
    quoteBarEl.classList.remove('hidden');
    quoteBarEl.appendChild(
      el('div', { style: { fontSize: '12px' } }, [
        el('strong', { text: 'Replying to ' + quotedMessage.sender + ': ' }),
        el('span', { text: quotedMessage.text.slice(0, 120) }),
      ])
    );
    quoteBarEl.appendChild(
      el('button', {
        type: 'button',
        className: 'comp-btn',
        text: '✕',
        onClick: () => {
          quotedMessage = null;
          renderQuoteBar();
        },
      })
    );
  }

  function renderConfirmBar() {
    confirmBarEl.replaceChildren();
    if (!pendingSendPayload) {
      confirmBarEl.classList.add('hidden');
      return;
    }
    confirmBarEl.classList.remove('hidden');
    const viaLabel =
      state && state.activeMode === 'direct'
        ? 'Direct Google Chat API'
        : state && state.geConfigured && state.activeMode === 'ge'
          ? 'Gemini Enterprise Chat Connector'
          : 'Sample Preview';

    const promptLabel = pendingSendPayload.geSession
      ? 'Gemini Enterprise Action Confirmation: Confirm sending message to "' + pendingSendPayload.conversationTitle + '"?'
      : 'Send message to "' + pendingSendPayload.conversationTitle + '" via ' + viaLabel + '?';

    confirmBarEl.appendChild(el('span', { style: { fontWeight: '600' }, text: promptLabel }));
    confirmBarEl.appendChild(
      el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
        el('button', {
          type: 'button',
          className: 'comp-btn comp-btn-ai',
          id: 'btn-confirm-send-now',
          text: pendingSendPayload.geSession ? '✓ Confirm GE Send' : '✓ Confirm & Send',
          onClick: async () => {
            try {
              const res = await apiPost('/api/send', {
                confirmedByUser: true,
                conversationId: pendingSendPayload.conversationId,
                text: pendingSendPayload.text,
                geSession: pendingSendPayload.geSession || '',
                draftId: pendingSendPayload.draftId || '',
              });
              if (res.pendingGeConfirmation) {
                pendingSendPayload.geSession = res.geSession;
                renderConfirmBar();
                showToast('Click Confirm GE Send to finalize connector action');
                return;
              }
              if (res.readOnlyConnector) {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  await navigator.clipboard.writeText(pendingSendPayload.text);
                }
                showToast('Message copied — opening Google Chat (GE connector is read-only)');
                if (res.openChatUrl) window.open(res.openChatUrl, '_blank', 'noopener,noreferrer');
                pendingSendPayload = null;
                renderConfirmBar();
                return;
              }
              state = res.state;
              composerEl.value = '';
              quotedMessage = null;
              pendingSendPayload = null;
              renderQuoteBar();
              renderConfirmBar();
              render();
              showToast('Message sent (' + res.delivery + ')');
            } catch (err) {
              showToast('Send error: ' + err.message);
            }
          },
        }),
        el('button', {
          type: 'button',
          className: 'comp-btn',
          text: 'Copy & Open Chat ↗',
          onClick: async () => {
            const conv = getActiveConversation();
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(pendingSendPayload.text);
            }
            if (conv && conv.webUrl) window.open(conv.webUrl, '_blank', 'noopener,noreferrer');
            pendingSendPayload = null;
            renderConfirmBar();
            showToast('Copied message & opened Google Chat');
          },
        }),
        el('button', {
          type: 'button',
          className: 'comp-btn',
          text: 'Cancel',
          onClick: () => {
            pendingSendPayload = null;
            renderConfirmBar();
          },
        }),
      ])
    );
  }

  function openSettingsModal() {
    settingsCardEl.replaceChildren();
    settingsModalEl.classList.remove('hidden');

    const geInput = el('input', {
      type: 'text',
      className: 'hdr-btn',
      id: 'settings-ge-input',
      style: { width: '100%' },
      value: (state && state.geEngineResource) || '',
      placeholder: 'projects/YOUR_PROJECT_ID/locations/global/collections/default_collection/engines/YOUR_ENGINE_ID',
    });

    const modeSelect = el('select', { className: 'hdr-btn', id: 'settings-mode-select' }, [
      el('option', { value: 'auto', text: 'Auto (Use Gemini Enterprise Chat Connector when configured)' }),
      el('option', { value: 'ge', text: 'Gemini Enterprise Chat Connector (StreamAssist)' }),
      el('option', { value: 'direct', text: 'Direct Google Chat REST API (chat.googleapis.com)' }),
      el('option', { value: 'demo', text: 'Interactive Sample Preview' }),
    ]);
    modeSelect.value = (state && state.modePreference) || 'auto';

    const clientIdInput = el('input', {
      type: 'text',
      className: 'hdr-btn',
      style: { width: '100%' },
      placeholder: 'Optional Desktop OAuth Client ID (*.apps.googleusercontent.com) for Direct Chat API',
    });

    settingsCardEl.appendChild(el('h3', { style: { margin: '0', fontSize: '16px' }, text: 'Chatski Connection Settings' }));
    settingsCardEl.appendChild(
      el('div', { style: { fontSize: '12.5px', color: 'var(--fg-muted)', lineHeight: '1.5' } }, [
        state && state.geConfigured
          ? '✓ Gemini Enterprise Engine connected: ' + state.geEngineResource
          : '• Gemini Enterprise not configured yet — paste your GE Engine resource path below or run /connect-ge in Antigravity chat.',
      ])
    );
    settingsCardEl.appendChild(
      el('label', { style: { fontSize: '12px', fontWeight: '700' }, text: 'Gemini Enterprise Engine Resource (or Console URL)' })
    );
    settingsCardEl.appendChild(geInput);
    settingsCardEl.appendChild(el('label', { style: { fontSize: '12px', fontWeight: '700', marginTop: '4px' }, text: 'Connection Mode' }));
    settingsCardEl.appendChild(modeSelect);
    settingsCardEl.appendChild(
      el('label', { style: { fontSize: '12px', fontWeight: '700', marginTop: '4px' }, text: 'Optional Upgrade: Direct Google Chat API (Sub-200ms)' })
    );
    settingsCardEl.appendChild(clientIdInput);

    settingsCardEl.appendChild(
      el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '8px', flexWrap: 'wrap' } }, [
        el('button', {
          type: 'button',
          className: 'comp-btn',
          text: 'Authorize Direct Chat API ↗',
          onClick: async () => {
            try {
              const res = await apiPost('/api/direct-oauth/start', { clientId: clientIdInput.value.trim() });
              if (res.authorizeUrl) {
                window.open(res.authorizeUrl, '_blank', 'noopener,noreferrer');
                showToast('Complete Google Chat OAuth in browser, then click Sync');
              }
            } catch (err) {
              showToast(err.message);
            }
          },
        }),
        el('div', { style: { display: 'flex', gap: '8px' } }, [
          el('button', {
            type: 'button',
            className: 'comp-btn',
            text: 'Cancel',
            onClick: () => settingsModalEl.classList.add('hidden'),
          }),
          el('button', {
            type: 'button',
            className: 'comp-btn comp-btn-ai',
            id: 'btn-save-settings',
            text: 'Save Settings',
            onClick: async () => {
              try {
                const rawGe = geInput.value.trim();
                if (rawGe && rawGe !== ((state && state.geEngineResource) || '')) {
                  await apiPost('/api/save-ge', { geInstance: rawGe });
                }
                state = await apiPost('/api/mode', { mode: modeSelect.value });
                settingsModalEl.classList.add('hidden');
                render();
                showToast('Updated Chatski settings');
                if (state.geConfigured && state.showingSamplePreview && state.activeMode === 'ge') {
                  triggerSync();
                }
              } catch (err) {
                showToast('Settings error: ' + err.message);
              }
            },
          }),
        ]),
      ])
    );
  }

  async function triggerSync() {
    railStatusEl.textContent = 'Syncing from Gemini Enterprise...';
    try {
      const res = await apiPost('/api/sync', {});
      state = res;
      if (
        state.conversations &&
        state.conversations.length > 0 &&
        !state.conversations.some((c) => c.id === selectedConvId)
      ) {
        selectedConvId = state.conversations[0].id;
      }
      render();
      showToast('Synced conversations (' + (res.syncSource || 'ready') + ')');
    } catch (err) {
      renderModeAndBanner();
      showToast('Sync error: ' + err.message);
    }
  }

  function render() {
    renderModeAndBanner();
    renderRail();
    renderChatPane();
    renderQuoteBar();
    renderConfirmBar();
  }

  async function loadInitial() {
    state = await apiGet('/api/state');
    if (state.conversations && state.conversations.length > 0 && !selectedConvId) {
      selectedConvId = state.conversations[0].id;
    }
    render();
    if (state.geConfigured && state.showingSamplePreview && !state.lastSyncedIso && state.activeMode === 'ge') {
      triggerSync();
    }
  }

  // Wire UI controls
  document.querySelectorAll('.filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter || 'all';
      render();
    });
  });

  const searchInput = document.getElementById('chat-search-input');
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value || '';
    renderRail();
  });

  document.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      searchInput.focus();
    }
  });

  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn && !themeBtn.__agyBound) {
    themeBtn.__agyBound = true;
    themeBtn.addEventListener('click', () => {
      if (typeof window.__toggleAgyTheme === 'function') {
        window.__toggleAgyTheme();
        return;
      }
      const html = document.documentElement;
      const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      html.setAttribute('data-theme', next);
      themeBtn.textContent = next === 'dark' ? '☀' : '☾';
    });
  }

  document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
  document.getElementById('btn-sync-ge').addEventListener('click', triggerSync);

  document.getElementById('btn-refresh-thread').addEventListener('click', async () => {
    const conv = getActiveConversation();
    if (!conv) return;
    try {
      state = await apiPost('/api/messages/refresh', { conversationId: conv.id });
      render();
      showToast('Refreshed thread');
    } catch (err) {
      showToast('Refresh failed: ' + err.message);
    }
  });

  document.getElementById('btn-summarize-space').addEventListener('click', () => {
    const conv = getActiveConversation();
    if (!conv) return;
    const transcript = (conv.messages || [])
      .slice(-12)
      .map((m) => m.sender + ' (' + (m.timeLabel || '') + '): ' + m.text)
      .join('\n');
    dispatchToAntigravity(
      'Summarize key decisions, blockers, and action items for me from "' +
        conv.title +
        '":\n\n<untrusted_chat_content>\n' +
        transcript +
        '\n</untrusted_chat_content>',
      'Summarize Chat: ' + conv.title
    );
  });

  document.getElementById('btn-stage-draft').addEventListener('click', async () => {
    const conv = getActiveConversation();
    const txt = (composerEl.value || '').trim();
    if (!conv || !txt) {
      showToast('Type a draft message first');
      return;
    }
    const res = await apiPost('/api/drafts/save', {
      conversationId: conv.id,
      conversationTitle: conv.title,
      text: txt,
    });
    state = res.state;
    composerEl.value = '';
    render();
    showToast('Saved to Drafts');
  });

  document.getElementById('btn-ai-draft').addEventListener('click', () => {
    const conv = getActiveConversation();
    if (!conv) return;
    const hint = (composerEl.value || '').trim();
    const recent = (conv.messages || [])
      .slice(-5)
      .map((m) => m.sender + ': ' + m.text)
      .join('\n');
    const prompt =
      '/my-voice Draft a concise, natural Google Chat message in my voice for "' +
      conv.title +
      '"' +
      (hint ? ' (my intent: ' + hint + ')' : '') +
      ' [Draft-Only — do not auto-send]:\n\n<untrusted_chat_content>\n' +
      recent +
      '\n</untrusted_chat_content>';
    dispatchToAntigravity(prompt, 'Draft Chat Message: ' + conv.title);
  });

  function requestSendConfirmation() {
    const conv = getActiveConversation();
    const raw = (composerEl.value || '').trim();
    if (!conv || !raw) {
      composerEl.focus();
      return;
    }
    const fullText = quotedMessage ? '> ' + quotedMessage.sender + ': ' + quotedMessage.text + '\n\n' + raw : raw;
    pendingSendPayload = {
      conversationId: conv.id,
      conversationTitle: conv.title,
      text: fullText,
    };
    renderConfirmBar();
  }

  document.getElementById('btn-send-msg').addEventListener('click', requestSendConfirmation);
  composerEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      requestSendConfirmation();
    }
  });

  viewportEl.addEventListener('scroll', () => {
    const nearBottom = viewportEl.scrollHeight - viewportEl.scrollTop - viewportEl.clientHeight < 80;
    document.getElementById('btn-jump-latest').classList.toggle('hidden', nearBottom);
  });
  document.getElementById('btn-jump-latest').addEventListener('click', () => {
    viewportEl.scrollTop = viewportEl.scrollHeight;
  });

  if (window.AGYTokenPill) {
    window.AGYTokenPill.mount(document.getElementById('token-anchor'));
  }

  loadInitial()
    .then(() => {
      if (typeof window !== 'undefined' && window.location && new URLSearchParams(window.location.search).get('hover') === '1') {
        const bars = document.querySelectorAll('.msg-hover-bar');
        if (bars.length > 0) bars[bars.length - 1].style.display = 'inline-flex';
      }
    })
    .catch((err) => {
      viewportEl.replaceChildren(el('div', { text: 'Unable to load Chatski: ' + err.message }));
    });
})();
