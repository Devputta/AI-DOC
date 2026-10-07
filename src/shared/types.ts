export enum DocumentStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

export enum ElementType {
  HEADING = 'heading',
  PARAGRAPH = 'paragraph',
  TABLE = 'table',
  LIST = 'list',
  FOOTNOTE = 'footnote',
}

export enum ComparisonChangeType {
  ADDED = 'added',
  REMOVED = 'removed',
  CHANGED = 'changed',
  UNCERTAIN = 'uncertain',
}

export interface BoundingBox {
  x: number; // 0..100 percentage of page width
  y: number; // 0..100 percentage of page height
  width: number;
  height: number;
}

export interface DocumentRecord {
  id: string;
  original_name: string;
  stored_filename: string;
  sha256: string;
  size_bytes: number;
  page_count: number;
  status: DocumentStatus;
  parser_name: string;
  parser_version: string;
  created_at: string;
  processed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  is_demo?: boolean;
  chunk_count?: number;
  table_count?: number;
  element_count?: number;
}

export interface DocumentElement {
  id: string;
  document_id: string;
  type: ElementType;
  page_number: number; // 1-indexed
  content: string;
  heading_level: number | null;
  section_path: string;
  bounding_box: BoundingBox;
  source_element_id: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  document_name: string;
  text: string;
  page_start: number;
  page_end: number;
  element_ids: string[];
  section_path: string;
  bounding_box: BoundingBox;
  search_text: string;
}

export interface TableRecord {
  id: string;
  document_id: string;
  document_name: string;
  title: string;
  page_number: number;
  source_element_id: string;
  columns: string[];
  rows: string[][];
  warnings: string[];
  bounding_box: BoundingBox;
}

export interface SearchResult {
  chunk_id: string;
  document_id: string;
  document_name: string;
  page_start: number;
  page_end: number;
  section_path: string;
  text: string;
  highlighted_excerpt: string;
  score: number;
  element_ids: string[];
  bounding_box: BoundingBox;
}

export interface Citation {
  citation_index: number;
  document_id: string;
  document_name: string;
  page_number: number; // 1-indexed
  chunk_id: string;
  section_path: string;
  quote: string;
  bounding_box: BoundingBox;
  verified: boolean;
}

export interface ChatRequest {
  question: string;
  document_ids: string[];
  mode?: 'local' | 'remote' | 'fake';
  simulate_hallucinated_citation?: boolean;
}

export interface ChatResponse {
  answer: string;
  citations: Citation[];
  insufficient_evidence: boolean;
  conflicting_evidence: boolean;
  mode_used: 'local_extractive' | 'remote_gemini' | 'fake_provider';
  remote_disclosed: boolean;
  rejected_citation_count: number;
  retrieved_chunks: SearchResult[];
  notice?: string;
}

export interface ComparisonEvidenceSide {
  document_id: string;
  document_name: string;
  chunk_id: string | null;
  page_number: number | null;
  section_path: string | null;
  excerpt: string | null;
  bounding_box: BoundingBox | null;
}

export interface NumericDelta {
  label: string;
  left_value: string;
  right_value: string;
}

export interface ComparisonChange {
  id: string;
  comparison_id: string;
  type: ComparisonChangeType;
  section_title: string;
  summary: string;
  confidence: number; // 0..1
  numeric_deltas: NumericDelta[];
  left_evidence: ComparisonEvidenceSide;
  right_evidence: ComparisonEvidenceSide;
}

export interface ComparisonRecord {
  id: string;
  left_document_id: string;
  right_document_id: string;
  left_document_name: string;
  right_document_name: string;
  status: 'ready' | 'failed';
  created_at: string;
  summary_counts: {
    added: number;
    removed: number;
    changed: number;
    uncertain: number;
    unchanged: number;
  };
  changes: ComparisonChange[];
}

export interface AppSettings {
  env: string;
  max_upload_mb: number;
  max_pages: number;
  parser_timeout_seconds: number;
  remote_ai_enabled: boolean;
  remote_ai_Configured: boolean;
  remote_model_name: string;
  parser_adapter: string;
  parser_version: string;
  storage_document_count: number;
  storage_bytes_used: number;
}

export interface SecurityCheckResult {
  id: string;
  name: string;
  category: 'upload' | 'citations' | 'csv' | 'prompt_injection' | 'traversal';
  passed: boolean;
  detail: string;
}
