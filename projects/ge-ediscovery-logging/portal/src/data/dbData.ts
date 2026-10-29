import {
  UserProfile,
  UnifiedReviewItem,
  ProcessedLogRecord,
  NotebookSourceRecord,
  NotebookChatRecord,
  NotebookStudioRecord,
  ComplianceDataset,
} from '../types/schema';
import { ensureArray, parseTimestamp } from '../utils/arrayUtils';

/**
 * Builds dynamic user profiles aggregated from live BigQuery records.
 * Excludes backend service accounts (*.gserviceaccount.com) from human user rosters.
 */
export function buildDynamicUsers(datasetOrProcessedLogs: ComplianceDataset | ProcessedLogRecord[] = [], ...rest: any[]): UserProfile[] {
  let processedLogs: ProcessedLogRecord[] = [];
  let sources: NotebookSourceRecord[] = [];
  let chats: NotebookChatRecord[] = [];
  let studio: NotebookStudioRecord[] = [];
  let notebookRawLogs: any[] = [];

  if ('processedLogs' in datasetOrProcessedLogs) {
    processedLogs = datasetOrProcessedLogs.processedLogs || [];
    sources = datasetOrProcessedLogs.sources || [];
    chats = datasetOrProcessedLogs.chats || [];
    studio = datasetOrProcessedLogs.studio || [];
    notebookRawLogs = datasetOrProcessedLogs.notebookRawLogs || [];
  } else {
    processedLogs = datasetOrProcessedLogs;
    sources = rest[0] || [];
    chats = rest[1] || [];
    studio = rest[2] || [];
    notebookRawLogs = rest[3] || [];
  }

  const emailMap = new Map<string, UserProfile>();

  const isServiceAccount = (email: string): boolean => {
    return email.endsWith('.gserviceaccount.com') || email.includes('serverless-robot-prod');
  };

  const getOrCreate = (rawEmail: string): UserProfile | null => {
    const email = (rawEmail || '').toLowerCase().trim();
    if (!email || isServiceAccount(email)) {
      return null;
    }
    if (!emailMap.has(email)) {
      const handle = email.split('@')[0].replace(/[._-]/g, ' ');
      const formattedName = handle
        .split(' ')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');

      emailMap.set(email, {
        email,
        display_name: formattedName || email,
      });
    }
    return emailMap.get(email)!;
  };

  for (const bucket of [processedLogs, sources, chats, studio, notebookRawLogs]) {
    for (const row of ensureArray<{ user_email?: string }>(bucket)) {
      if (row?.user_email) getOrCreate(row.user_email);
    }
  }

  return Array.from(emailMap.values()).sort((a, b) => a.display_name.localeCompare(b.display_name));
}

/**
 * Transforms normalized BigQuery records into unified eDiscovery and compliance review items.
 */
export function getUnifiedReviewItems(
  datasetOrProcessedLogs: ComplianceDataset | ProcessedLogRecord[] = [],
  ...rest: any[]
): UnifiedReviewItem[] {
  let processedLogs: ProcessedLogRecord[] = [];
  let sources: NotebookSourceRecord[] = [];
  let chats: NotebookChatRecord[] = [];
  let studio: NotebookStudioRecord[] = [];
  let notebookRawLogs: any[] = [];

  if ('processedLogs' in datasetOrProcessedLogs) {
    processedLogs = datasetOrProcessedLogs.processedLogs || [];
    sources = datasetOrProcessedLogs.sources || [];
    chats = datasetOrProcessedLogs.chats || [];
    studio = datasetOrProcessedLogs.studio || [];
    notebookRawLogs = datasetOrProcessedLogs.notebookRawLogs || [];
  } else {
    processedLogs = datasetOrProcessedLogs;
    sources = rest[0] || [];
    chats = rest[1] || [];
    studio = rest[2] || [];
    notebookRawLogs = rest[3] || [];
  }

  const items: UnifiedReviewItem[] = [];
  const rawNotebookLogs = ensureArray(notebookRawLogs);
  const liveSources = ensureArray(sources);
  const liveChats = ensureArray(chats);
  const liveStudio = ensureArray(studio).filter((st) => {
    if (!st) return false;
    const type = (st.artifact_type || '').toUpperCase();
    const artId = String(st.artifact_id || '');
    if (artId.startsWith('unknown_') && !st.gcs_uri && !st.user_steering_prompt) return false;
    // Filter out empty AUDIO_OVERVIEW read probes lacking binary media or steering prompts
    if (
      type === 'AUDIO_OVERVIEW' &&
      !st.gcs_uri &&
      !st.user_steering_prompt &&
      !st.customization_prompt
    ) {
      return false;
    }
    return true;
  });
  const liveProcessed = ensureArray(processedLogs);

  // Group notebook telemetry by notebook_id
  function groupDedupeByTime<T>(
    items: T[],
    getGroupKey: (item: T) => string | undefined,
    getIdKey: (item: T) => string | undefined,
    getTimeKey: (item: T) => string | undefined,
    normalize: (item: T, id: string) => T
  ): Map<string, Map<string, T>> {
    const groups = new Map<string, Map<string, T>>();
    for (const item of items) {
      if (!item) continue;
      const groupKey = getGroupKey(item);
      if (!groupKey || groupKey === 'unknown_notebook') continue;
      const idKey = getIdKey(item);
      if (!idKey) continue;

      const map = groups.get(groupKey) || new Map<string, T>();
      const existing = map.get(idKey);
      const normalized = normalize(item, idKey);

      if (!existing || parseTimestamp(getTimeKey(item)) >= parseTimestamp(getTimeKey(existing))) {
        map.set(idKey, normalized);
      }
      groups.set(groupKey, map);
    }
    return groups;
  }

  // Deduplicate sources by (notebook_id, normalized_title) merging provisional src_... with finalized sources
  const sourceGroups = new Map<string, Map<string, NotebookSourceRecord>>();
  for (const s of liveSources) {
    if (!s || !s.notebook_id || s.notebook_id === 'unknown_notebook') continue;
    const nbId = String(s.notebook_id);
    const map = sourceGroups.get(nbId) || new Map<string, NotebookSourceRecord>();
    const title = s.source_title || (s.source_url ? s.source_url.replace(/^https?:\/\//, '').split('/')[0] : 'Ingested Source');
    const normTitle = title.toLowerCase().trim().replace(/\s+/g, ' ');
    const srcKey = normTitle || s.source_id || s.event_id || 'unknown';

    const normalizedSource: NotebookSourceRecord = {
      ...s,
      source_id: s.source_id || s.event_id || srcKey,
      source_title: title,
      source_type: (s.source_kind || s.source_type || 'FILE') as any,
      source_kind: (s.source_kind || s.source_type || 'FILE') as any,
      original_url: s.source_url || s.original_url || '',
      source_url: s.source_url || s.original_url || '',
      full_content: s.full_content || s.content_preview || '',
      content_preview: s.content_preview || (s.full_content ? s.full_content.slice(0, 160) : ''),
    };

    const existing = map.get(srcKey);
    if (!existing) {
      map.set(srcKey, normalizedSource);
    } else {
      const isExistingProvisional = String(existing.source_id || '').startsWith('src_');
      const isNewProvisional = String(normalizedSource.source_id || '').startsWith('src_');
      const preferNew =
        (!isNewProvisional && isExistingProvisional) ||
        Boolean(normalizedSource.gcs_uri && !existing.gcs_uri) ||
        Boolean(normalizedSource.word_count && !existing.word_count) ||
        (parseTimestamp(normalizedSource.event_time) >= parseTimestamp(existing.event_time) && !(isNewProvisional && !isExistingProvisional));

      const merged: NotebookSourceRecord = {
        ...(preferNew ? existing : normalizedSource),
        ...(preferNew ? normalizedSource : existing),
        source_id: (!isNewProvisional ? normalizedSource.source_id : (isExistingProvisional ? normalizedSource.source_id : existing.source_id)) || existing.source_id,
        gcs_uri: normalizedSource.gcs_uri || existing.gcs_uri,
        word_count: normalizedSource.word_count || existing.word_count,
        full_content: normalizedSource.full_content || existing.full_content,
        content_preview: normalizedSource.content_preview || existing.content_preview,
      };
      map.set(srcKey, merged);
    }
    sourceGroups.set(nbId, map);
  }

  const chatGroups = groupDedupeByTime(
    liveChats.filter(
      (c) => (c?.user_query && c.user_query.trim() !== '') || (c?.model_response && c.model_response.trim() !== '')
    ),
    (c) => (c.notebook_id ? String(c.notebook_id) : undefined),
    (c) =>
      c.user_query && c.user_query.trim() !== ''
        ? `q:${c.notebook_id}:${c.user_query.trim()}`
        : (c.turn_id && c.turn_id !== '0' ? c.turn_id : c.event_id) || '',
    (c) => c.event_time,
    (c, turnId) => ({
      ...c,
      turn_id: turnId,
      user_query: c.user_query || '',
      model_response: c.model_response || '',
      citations: ensureArray(c.citations),
    })
  );

  const studioGroups = groupDedupeByTime(
    liveStudio,
    (st) => st.notebook_id ? String(st.notebook_id) : undefined,
    (st) => st.artifact_id || st.event_id,
    (st) => st.event_time,
    (st, artId) => {
      const rawArtTitle = st.artifact_title || st.title || '';
      const modalityDisplay = (st.artifact_type || 'Studio Artifact').replace(/_/g, ' ');
      let artTitle = rawArtTitle;
      if (!artTitle || artTitle === 'Studio Artifact' || artTitle === 'Report' || artTitle === 'Untitled Note') {
        artTitle = st.user_steering_prompt
          ? `${modalityDisplay}: ${st.user_steering_prompt.slice(0, 50)}`
          : (st.notebook_title ? `${modalityDisplay} - ${st.notebook_title}` : modalityDisplay);
      } else if (st.notebook_title && artTitle === st.notebook_title) {
        artTitle = `${modalityDisplay} - ${st.notebook_title}`;
      }
      return {
        ...st,
        artifact_id: artId,
        artifact_type: st.artifact_type || 'NOTE',
        title: artTitle,
        artifact_title: artTitle,
        note_content: st.note_content || '',
      };
    }
  );

  const rawNotebookGroups = new Map<string, any[]>();
  rawNotebookLogs.forEach((r) => {
    if (!r?.notebook_id || r.notebook_id === 'unknown_notebook') return;
    const nbId = String(r.notebook_id);
    const arr = rawNotebookGroups.get(nbId) || [];
    arr.push(r);
    rawNotebookGroups.set(nbId, arr);
  });

  // Discover notebook IDs from active database rows
  const validNotebookIds = new Set<string>([
    ...Array.from(sourceGroups.keys()),
    ...Array.from(chatGroups.keys()),
    ...Array.from(studioGroups.keys()),
  ]);

  validNotebookIds.forEach((nbId) => {
    if (nbId === 'unknown_notebook' || nbId === 'default_notebook') return;

    const rawLogs = rawNotebookGroups.get(nbId) || [];
    const nbSources = Array.from(sourceGroups.get(nbId)?.values() || []);
    const nbChats = Array.from(chatGroups.get(nbId)?.values() || []).sort(
      (a, b) => parseTimestamp(a.event_time) - parseTimestamp(b.event_time)
    );
    const nbStudio = Array.from(studioGroups.get(nbId)?.values() || []);

    // Filter Out Empty Containers
    if (nbSources.length === 0 && nbChats.length === 0 && nbStudio.length === 0) {
      return;
    }

    const latestEventTime =
      nbStudio[0]?.event_time ||
      nbSources[0]?.event_time ||
      nbChats[0]?.event_time ||
      rawLogs[0]?.event_time ||
      '';

    const userEmail =
      nbSources[0]?.user_email ||
      nbStudio[0]?.user_email ||
      nbChats[0]?.user_email ||
      rawLogs.find((r) => r.user_email)?.user_email ||
      '';

    const allTitles = [
      ...nbStudio.map((st) => st.notebook_title),
      ...nbSources.map((s) => s.notebook_title),
      ...nbChats.map((c) => c.notebook_title),
      ...rawLogs.map((r) => r.notebook_title),
    ].filter((t): t is string => Boolean(t && t.trim().length > 0));

    const descriptiveTitle = allTitles.slice().reverse().find(
      (t) => !t.startsWith('Notebook ') && !t.toLowerCase().startsWith('untitled') && t !== nbId
    );
    const title = descriptiveTitle || allTitles[allTitles.length - 1] || allTitles[0] || `Notebook ${nbId.slice(0, 8)}`;

    items.push({
      id: nbId,
      kind: 'NOTEBOOK_LM_CONTAINER',
      title: title,
      user_email: userEmail,
      user_name: userEmail ? (userEmail.split('@')[0] || userEmail) : '',
      surface: 'NOTEBOOK_LM',
      timestamp: latestEventTime,
      turn_count: nbChats.length,
      is_held: false,
      privilege_status: 'NONE',
      artifacts_count: {
        input: 0,
        output: 0,
        sources: nbSources.length,
        studio: nbStudio.length,
      },
      snippet: `${nbSources.length} sources · ${nbChats.length} Q&A turns · ${nbStudio.length} studio artifacts`,
      notebook_sources: nbSources,
      notebook_chats: nbChats,
      notebook_studio: nbStudio,
    });
  });

  // Group Gemini Enterprise Chat sessions
  const chatSessions = new Map<string, ProcessedLogRecord[]>();
  liveProcessed.forEach((log) => {
    if (!log) return;
    const sessId = log.session_id || log.insert_id || 'unassigned_session';
    const arr = chatSessions.get(sessId) || [];
    arr.push(log);
    chatSessions.set(sessId, arr);
  });

  chatSessions.forEach((logs, sessId) => {
    const sorted = [...logs].sort(
      (a, b) => parseTimestamp(a.timestamp) - parseTimestamp(b.timestamp)
    );
    const latest = sorted[sorted.length - 1];
    const first = sorted[0];
    const userEmail = latest.user_email || '';

    const inputArtifactsCount = sorted.reduce(
      (acc, l) => acc + (ensureArray(l.input_artifacts)?.length || 0),
      0
    );
    const outputArtifactsCount = sorted.reduce(
      (acc, l) => acc + (ensureArray(l.output_artifacts)?.length || 0),
      0
    );

    const firstPrompt =
      sorted.find((l) => l.input_text && l.input_text.trim().length > 0)?.input_text ||
      sessId;
    const title = firstPrompt.length > 70 ? `${firstPrompt.slice(0, 70)}...` : firstPrompt;
    const gcsRawUri =
      sorted
        .slice()
        .reverse()
        .find((l) => Boolean(l.gcs_raw_conversation_uri))?.gcs_raw_conversation_uri || undefined;

    items.push({
      id: sessId,
      kind: 'CORE_CHAT_SESSION',
      title: title,
      user_email: userEmail,
      user_name: userEmail ? (userEmail.split('@')[0] || userEmail) : '',
      surface: 'GEMINI_ENTERPRISE_CHAT',
      timestamp: latest.timestamp || first.timestamp || '',
      gcs_uri: gcsRawUri,
      turn_count: sorted.length,
      is_held: false,
      privilege_status: 'NONE',
      artifacts_count: {
        input: inputArtifactsCount,
        output: outputArtifactsCount,
        sources: 0,
        studio: 0,
      },
      snippet: latest.output_text
        ? latest.output_text.slice(0, 160)
        : `${sorted.length} recorded turns`,
      chat_turns: sorted,
    });
  });

  return items.sort((a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp));
}
