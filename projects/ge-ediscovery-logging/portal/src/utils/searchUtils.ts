import { UnifiedReviewItem, ArtifactFile, NotebookChatRecord, NotebookSourceRecord, NotebookStudioRecord, ProcessedLogRecord } from '../types/schema';
import { ensureArray } from './arrayUtils';

const corpusCache = new WeakMap<UnifiedReviewItem, string[]>();

/**
 * Extracts searchable text fields from a UnifiedReviewItem.
 */
function buildSearchCorpus(item: UnifiedReviewItem): string[] {
  const fields: (string | undefined | null)[] = [
    item.title,
    item.snippet,
    item.user_email,
    item.user_name,
    item.department,
  ];

  for (const turn of ensureArray<ProcessedLogRecord>(item.chat_turns)) {
    fields.push(turn.input_text, turn.output_text, turn.user_email);
    for (const artifact of ensureArray<ArtifactFile>(turn.input_artifacts)) {
      fields.push(artifact.file_name, artifact.snippet);
    }
    for (const artifact of ensureArray<ArtifactFile>(turn.output_artifacts)) {
      fields.push(artifact.file_name);
    }
  }

  for (const chat of ensureArray<NotebookChatRecord>(item.notebook_chats)) {
    fields.push(chat.user_query, chat.model_response, chat.user_email);
  }

  for (const source of ensureArray<NotebookSourceRecord>(item.notebook_sources)) {
    fields.push(source.source_title, source.user_email);
  }

  for (const studio of ensureArray<NotebookStudioRecord>(item.notebook_studio)) {
    fields.push(
      studio.title,
      studio.user_email,
      studio.artifact_type,
      studio.note_content,
      studio.customization_prompt,
      studio.user_steering_prompt,
      studio.quiz_data ? JSON.stringify(studio.quiz_data) : undefined,
      studio.flashcards_data ? JSON.stringify(studio.flashcards_data) : undefined,
      studio.mind_map_data ? JSON.stringify(studio.mind_map_data) : undefined
    );
  }

  return fields
    .filter((field): field is string => Boolean(field && typeof field === 'string'))
    .map((entry) => entry.toLowerCase());
}

export interface SearchResultItem {
  id: string;
  sessionId: string;
  surface: 'GEMINI_ENTERPRISE_CHAT' | 'NOTEBOOK_LM';
  userEmail: string;
  userName: string;
  title: string;
  category: 'Session' | 'Chat Turn' | 'Source / Upload' | 'Studio Note';
  matchedText: string;
  timestamp?: string;
  turnIndex?: number;
  turnId?: string;
  artifactFile?: ArtifactFile;
}

/**
 * Searches across all unified review items and returns structured result objects.
 */
export function searchAllItems(items: UnifiedReviewItem[], rawQuery?: string | null): SearchResultItem[] {
  if (!rawQuery) return [];
  const normalizedQuery = rawQuery.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const results: SearchResultItem[] = [];

  for (const item of items) {
    // Match session title and custodian identity
    if (
      item.title.toLowerCase().includes(normalizedQuery) ||
      item.user_email.toLowerCase().includes(normalizedQuery) ||
      (item.user_name && item.user_name.toLowerCase().includes(normalizedQuery))
    ) {
      results.push({
        id: `sess-${item.id}`,
        sessionId: item.id,
        surface: item.surface,
        userEmail: item.user_email,
        userName: item.user_name || item.user_email,
        title: item.title,
        category: 'Session',
        matchedText: item.user_email.toLowerCase().includes(normalizedQuery) ? item.user_email : item.title,
        timestamp: item.timestamp,
      });
    }

    // Match chat turn prompts, responses, and attached files
    const turns = ensureArray<ProcessedLogRecord>(item.chat_turns);
    turns.forEach((turn, idx) => {
      if (turn.input_text?.toLowerCase().includes(normalizedQuery) || turn.output_text?.toLowerCase().includes(normalizedQuery)) {
        const matchedSnippet = turn.input_text?.toLowerCase().includes(normalizedQuery)
          ? turn.input_text
          : turn.output_text.slice(0, 120);
        results.push({
          id: `turn-${turn.insert_id || idx}`,
          sessionId: item.id,
          surface: item.surface,
          userEmail: turn.user_email || item.user_email,
          userName: item.user_name || item.user_email,
          title: `Turn #${idx + 1}: ${turn.input_text ? turn.input_text.slice(0, 45) : item.title}`,
          category: 'Chat Turn',
          matchedText: matchedSnippet,
          turnIndex: idx + 1,
          turnId: turn.insert_id,
          timestamp: turn.timestamp,
        });
      }

      for (const art of ensureArray<ArtifactFile>(turn.input_artifacts)) {
        if (art.file_name?.toLowerCase().includes(normalizedQuery) || art.snippet?.toLowerCase().includes(normalizedQuery)) {
          results.push({
            id: `art-in-${art.file_id || art.file_name}`,
            sessionId: item.id,
            surface: item.surface,
            userEmail: item.user_email,
            userName: item.user_name || item.user_email,
            title: `Attached File: ${art.file_name}`,
            category: 'Source / Upload',
            matchedText: art.file_name,
            turnIndex: idx + 1,
            artifactFile: art,
            timestamp: turn.timestamp,
          });
        }
      }

      for (const art of ensureArray<ArtifactFile>(turn.output_artifacts)) {
        if (art.file_name?.toLowerCase().includes(normalizedQuery)) {
          results.push({
            id: `art-out-${art.file_id || art.file_name}`,
            sessionId: item.id,
            surface: item.surface,
            userEmail: item.user_email,
            userName: item.user_name || item.user_email,
            title: `Generated Asset: ${art.file_name}`,
            category: 'Source / Upload',
            matchedText: art.file_name,
            turnIndex: idx + 1,
            artifactFile: art,
            timestamp: turn.timestamp,
          });
        }
      }
    });

    // Match ingested notebook sources and studio outputs
    for (const source of ensureArray<NotebookSourceRecord>(item.notebook_sources)) {
      if (source.source_title?.toLowerCase().includes(normalizedQuery) || source.content_preview?.toLowerCase().includes(normalizedQuery)) {
        results.push({
          id: `src-${source.source_id}`,
          sessionId: item.id,
          surface: item.surface,
          userEmail: source.user_email || item.user_email,
          userName: item.user_name || item.user_email,
          title: `Source: ${source.source_title}`,
          category: 'Source / Upload',
          matchedText: source.source_title,
          timestamp: source.event_time,
        });
      }
    }

    for (const studio of ensureArray<NotebookStudioRecord>(item.notebook_studio)) {
      if (
        studio.title?.toLowerCase().includes(normalizedQuery) ||
        studio.artifact_type?.toLowerCase().includes(normalizedQuery) ||
        studio.note_content?.toLowerCase().includes(normalizedQuery) ||
        studio.customization_prompt?.toLowerCase().includes(normalizedQuery) ||
        studio.user_steering_prompt?.toLowerCase().includes(normalizedQuery) ||
        (studio.quiz_data && JSON.stringify(studio.quiz_data).toLowerCase().includes(normalizedQuery)) ||
        (studio.flashcards_data && JSON.stringify(studio.flashcards_data).toLowerCase().includes(normalizedQuery)) ||
        (studio.mind_map_data && JSON.stringify(studio.mind_map_data).toLowerCase().includes(normalizedQuery))
      ) {
        results.push({
          id: `studio-${studio.artifact_id || studio.event_id}`,
          sessionId: item.id,
          surface: item.surface,
          userEmail: studio.user_email || item.user_email,
          userName: item.user_name || item.user_email,
          title: `${studio.artifact_type || 'Studio'}: ${studio.title}`,
          category: 'Studio Note',
          matchedText: studio.title || studio.note_content?.slice(0, 100) || studio.artifact_type,
          timestamp: studio.event_time,
        });
      }
    }
  }

  return results.slice(0, 16);
}

/**
 * Checks if a review item deeply matches a search term across email, content, and file names.
 */
export function matchesQuery(item: UnifiedReviewItem, rawQuery?: string | null): boolean {
  if (!rawQuery) return true;
  const normalizedQuery = rawQuery.trim().toLowerCase();
  if (!normalizedQuery) return true;

  let corpus = corpusCache.get(item);
  if (!corpus) {
    corpus = buildSearchCorpus(item);
    corpusCache.set(item, corpus);
  }

  return corpus.some((field) => field.includes(normalizedQuery));
}
