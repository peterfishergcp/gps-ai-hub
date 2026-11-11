/**
 * BigQuery-Aligned Compliance & Legal Hold Data Schema Types
 * BigQuery schema types configured via BIGQUERY_DATASET in .env.
 */

// -----------------------------------------------------------------------------
// 1. Core Gemini Enterprise Chat Log (Table: processed_logs / processed_logs_latest)
// -----------------------------------------------------------------------------
export type InteractionSurface =
  | 'REGULAR_CHAT_AGENT'
  | 'NO_CODE_AGENT'
  | 'HIGH_CODE_AGENT'
  | 'DEEP_RESEARCH'
  | 'WORKFLOW_AGENT'
  | 'FILE_UPLOAD';

export interface ArtifactFile {
  file_id: string;
  file_name: string;
  mime_type: string;
  gcs_uri: string;
  gcs_bucket?: string;
  gcs_blob_path?: string;
  sha256: string;
  crc32c?: string;
  size_bytes?: number;
  turn_index?: number;
  preview_url?: string;
  content_text?: string;
  web_url?: string;
  snippet?: string;
}

export interface GroundedCitation {
  source_uri: string;
  title: string;
  snippet: string;
  confidence_score?: string;
}

export interface ProcessedLogRecord {
  insert_id: string;
  timestamp: string;
  receive_timestamp?: string;
  trace_id?: string;
  span_id?: string;
  project_id: string;
  location: string;
  engine_id: string;
  assistant_id?: string;

  // User & Identity
  user_email: string;
  user_id: string;
  principal_type: 'USER' | 'SERVICE_ACCOUNT' | 'UNKNOWN';

  // Surface & Agent
  interaction_surface: InteractionSurface;
  agent_id?: string;
  agent_name: string;
  agent_kind: 'DEFAULT' | 'USER' | 'REGISTRY' | 'WORKFLOW';
  is_core_assistant: boolean;
  spiffe_id?: string;

  // Session & Turn State
  session_id: string;
  session_path: string;
  answer_id?: string;
  turn_count: number;
  state: string; // SUCCEEDED, ERROR_*, IN_PROGRESS

  // Archive Completeness
  archive_status: 'COMPLETE' | 'ARTIFACTS_PARTIAL' | 'SESSION_FETCH_FAILED';
  archive_errors: string[];

  // Content Payloads
  input_text: string;
  input_artifacts: ArtifactFile[];
  output_text: string;
  output_artifacts: ArtifactFile[];
  reasoning_trace?: string;
  reasoning_text?: string;

  // Grounding
  citations: GroundedCitation[];
  search_queries: string[];
  raw_session_json?: string;
  gcs_raw_conversation_uri?: string;

  // Legal Hold Metadata (Client/Overlay)
  is_held?: boolean;
  matter_ids?: string[];
  privilege_status?: 'NONE' | 'ATTORNEY_CLIENT' | 'WORK_PRODUCT' | 'PENDING';
  tags?: string[];
}

// -----------------------------------------------------------------------------
// 2. Gemini Enterprise Notebooks Sources (Table: sources)
// -----------------------------------------------------------------------------
export type SourceType =
  | 'FILE'
  | 'PDF'
  | 'GOOGLE_DOC'
  | 'GOOGLE_SLIDES'
  | 'WEB_URL'
  | 'YOUTUBE'
  | 'DISCOVERED_WEB'
  | 'DISCOVERED_PDF'
  | 'PROMOTED_NOTE'
  | 'PASTED_TEXT';

export interface NotebookSourceRecord {
  event_id: string;
  event_time: string;
  ingest_time?: string;
  notebook_id: string;
  notebook_title?: string;
  source_id: string;
  source_title: string;
  source_type: SourceType;
  source_kind?: string;
  source_url?: string;
  original_url?: string;
  action?: string;
  action_type: 'CREATED' | 'UPDATED' | 'DELETED' | 'INGESTED' | 'VIEWED' | string;
  is_deleted: boolean;
  word_count?: number;
  token_count?: number;
  gcs_uri?: string;
  mime_type?: string;
  byte_size?: number;
  sha256_hash?: string;
  metadata?: Record<string, any>;
  status_code?: number;
  status_message?: string;
  trace_id?: string;
  user_email: string;
  principal_type?: string;
  content_preview?: string;
  full_content?: string;
}

export type NotebookSource = NotebookSourceRecord;

// -----------------------------------------------------------------------------
// 3. Gemini Enterprise Notebooks Chat Q&A (Table: chat)
// -----------------------------------------------------------------------------
export interface CitationSpan {
  source_id: string;
  cited_text: string;
  chunk_index: number;
  start_offset: number;
  end_offset: number;
}

export interface NotebookChatRecord {
  event_id: string;
  event_time: string;
  notebook_id: string;
  notebook_title?: string;
  session_id?: string;
  turn_id: string;
  user_email: string;
  user_query: string;
  model_response: string;
  citations: CitationSpan[];
}

// -----------------------------------------------------------------------------
// 4. Gemini Enterprise Notebooks Studio Output & Living Notes (Table: studio)
// -----------------------------------------------------------------------------
export type StudioArtifactType =
  | 'AUDIO_OVERVIEW'
  | 'VIDEO'
  | 'VIDEO_OVERVIEW'
  | 'SLIDES'
  | 'SLIDE_DECK'
  | 'MIND_MAP'
  | 'INFOGRAPHIC'
  | 'REPORT'
  | 'BRIEFING_DOC'
  | 'STUDY_GUIDE'
  | 'FAQ'
  | 'TIMELINE'
  | 'QUIZ'
  | 'FLASHCARDS'
  | 'NOTE'
  | 'STUDIO_NOTE'
  | 'STUDIO_ARTIFACT'
  | 'NOTEBOOK_GUIDE';

export type ArtifactType = StudioArtifactType;

export interface NotebookStudioRecord {
  event_id: string;
  event_time: string;
  notebook_id: string;
  notebook_title?: string;
  artifact_id: string;
  artifact_type: StudioArtifactType;
  action_type: 'CREATED' | 'UPDATED' | 'DELETED' | 'REQUESTED' | 'GENERATING' | 'READY' | string;
  lifecycle_state?: string;
  version?: number;
  title: string;
  artifact_title?: string;
  mime_type: string;
  duration_seconds?: number;
  gcs_uri: string;
  sha256_hash: string;
  metadata?: Record<string, any>;
  customization_options?: Record<string, any>;
  user_email: string;
  note_content?: string;
  quiz_data?: any;
  flashcards_data?: any;
  mind_map_data?: any;
  influenced_by_source_ids?: string[];
  grounded_source_ids?: string[] | string;
  source_ids?: string[];
  user_steering_prompt?: string;
  customization_prompt?: string;
  slide_count?: number;
  byte_size?: number;
  status_code?: number;
  status_message?: string;
}

export type NotebookStudioArtifact = NotebookStudioRecord;

// -----------------------------------------------------------------------------
// 5. User Entities & Unified Dataset Model
// -----------------------------------------------------------------------------
export interface UserProfile {
  email: string;
  display_name: string;
  avatar_url?: string;
  title?: string;
  department?: string;
}

export interface ComplianceDataset {
  processedLogs: ProcessedLogRecord[];
  sources: NotebookSourceRecord[];
  chats: NotebookChatRecord[];
  studio: NotebookStudioRecord[];
  notebookRawLogs: any[];
}

export const EMPTY_DATASET: ComplianceDataset = {
  processedLogs: [],
  sources: [],
  chats: [],
  studio: [],
  notebookRawLogs: [],
};

// -----------------------------------------------------------------------------
// 6. Unified Review Item (Master-Detail Evidence Model)
// -----------------------------------------------------------------------------
export type ReviewItemKind = 'CORE_CHAT_SESSION' | 'NOTEBOOK_LM_CONTAINER';

export interface UnifiedReviewItem {
  id: string;
  kind: ReviewItemKind;
  title: string;
  user_email: string;
  user_name: string;
  department?: string;
  surface: 'GEMINI_ENTERPRISE_CHAT' | 'NOTEBOOK_LM';
  agent_type?: InteractionSurface;
  timestamp: string;
  gcs_uri?: string;
  turn_count: number;
  is_held: boolean;
  privilege_status: 'NONE' | 'ATTORNEY_CLIENT' | 'WORK_PRODUCT' | 'PENDING';
  tags?: string[];
  artifacts_count: {
    input: number;
    output: number;
    sources: number;
    studio: number;
  };
  snippet: string;
  chat_turns?: ProcessedLogRecord[];
  notebook_sources?: NotebookSourceRecord[];
  notebook_chats?: NotebookChatRecord[];
  notebook_studio?: NotebookStudioRecord[];
}

