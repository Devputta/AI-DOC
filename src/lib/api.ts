import {
  AppSettings,
  BoundingBox,
  ChatRequest,
  ChatResponse,
  ComparisonRecord,
  DocumentChunk,
  DocumentElement,
  DocumentRecord,
  ElementType,
  SearchResult,
  SecurityCheckResult,
  TableRecord,
} from '../shared/types.ts';

export interface DocumentDetailsResponse {
  document: DocumentRecord;
  elements: DocumentElement[];
  chunks: DocumentChunk[];
  tables: TableRecord[];
  markdown: string;
}

export interface EvidenceFocus {
  documentId: string;
  documentName: string;
  pageNumber: number;
  sectionPath: string;
  quote: string;
  chunkId?: string;
  boundingBox?: BoundingBox | null;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const errData = await res.json();
      throw new Error(errData.message || `Request failed (${res.status})`);
    }
    throw new Error(`Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async getSettings(): Promise<AppSettings> {
    const res = await fetch('/api/settings');
    return handleResponse<AppSettings>(res);
  },

  async updateSettings(remoteAiEnabled: boolean): Promise<AppSettings> {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remote_ai_enabled: remoteAiEnabled }),
    });
    return handleResponse<AppSettings>(res);
  },

  async resetWorkspace(reseedDemo: boolean): Promise<{ documents: DocumentRecord[] }> {
    const res = await fetch('/api/settings/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reseed_demo: reseedDemo }),
    });
    return handleResponse<{ documents: DocumentRecord[] }>(res);
  },

  async listDocuments(): Promise<DocumentRecord[]> {
    const res = await fetch('/api/documents');
    const data = await handleResponse<{ documents: DocumentRecord[] }>(res);
    return data.documents;
  },

  async getDocumentDetails(id: string): Promise<DocumentDetailsResponse> {
    const res = await fetch(`/api/documents/${encodeURIComponent(id)}`);
    return handleResponse<DocumentDetailsResponse>(res);
  },

  async uploadPdfFile(file: File): Promise<DocumentRecord> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    const res = await fetch('/api/documents', {
      method: 'POST',
      body: formData,
    });
    const data = await handleResponse<{ document: DocumentRecord }>(res);
    return data.document;
  },

  async uploadRawPayload(params: {
    filename: string;
    mimeType: string;
    base64Data: string;
  }): Promise<DocumentRecord> {
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await handleResponse<{ document: DocumentRecord }>(res);
    return data.document;
  },

  async createCustomStructuredPdf(params: {
    filename: string;
    pages: Array<{
      pageNumber: number;
      elements: Array<{
        type: ElementType;
        content: string;
        headingLevel?: number;
        sectionPath?: string;
        tableData?: {
          title: string;
          columns: string[];
          rows: string[][];
          warnings: string[];
        };
      }>;
    }>;
  }): Promise<DocumentRecord> {
    const res = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await handleResponse<{ document: DocumentRecord }>(res);
    return data.document;
  },

  async reprocessDocument(id: string): Promise<DocumentRecord> {
    const res = await fetch(`/api/documents/${encodeURIComponent(id)}/reprocess`, {
      method: 'POST',
    });
    const data = await handleResponse<{ document: DocumentRecord }>(res);
    return data.document;
  },

  async deleteDocument(id: string): Promise<{
    deleted: boolean;
    removed_chunks: number;
    removed_tables: number;
    files_cleaned: boolean;
  }> {
    const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return handleResponse(res);
  },

  async searchLexical(
    query: string,
    documentIds: string[]
  ): Promise<{ query: string; results: SearchResult[]; total: number }> {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, document_ids: documentIds, limit: 12 }),
    });
    return handleResponse(res);
  },

  async askChat(req: ChatRequest): Promise<ChatResponse> {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return handleResponse<ChatResponse>(res);
  },

  async listTables(documentId?: string): Promise<TableRecord[]> {
    const url = documentId
      ? `/api/tables?document_id=${encodeURIComponent(documentId)}`
      : '/api/tables';
    const res = await fetch(url);
    const data = await handleResponse<{ tables: TableRecord[] }>(res);
    return data.tables;
  },

  async fetchTableCsvText(tableId: string): Promise<{
    csvText: string;
    mitigatedCount: number;
    filename: string;
  }> {
    const res = await fetch(`/api/tables/${encodeURIComponent(tableId)}/export.csv`);
    if (!res.ok) {
      throw new Error('Unable to export CSV for this table.');
    }
    const mitigatedCount = parseInt(
      res.headers.get('X-DocuLens-Mitigated-Cells') || '0',
      10
    );
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `${tableId}.csv`;
    const csvText = await res.text();
    return { csvText, mitigatedCount, filename };
  },

  async listComparisons(): Promise<ComparisonRecord[]> {
    const res = await fetch('/api/comparisons');
    const data = await handleResponse<{ comparisons: ComparisonRecord[] }>(res);
    return data.comparisons;
  },

  async createComparison(
    leftDocumentId: string,
    rightDocumentId: string
  ): Promise<ComparisonRecord> {
    const res = await fetch('/api/comparisons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        left_document_id: leftDocumentId,
        right_document_id: rightDocumentId,
      }),
    });
    const data = await handleResponse<{ comparison: ComparisonRecord }>(res);
    return data.comparison;
  },

  async runSecurityVerification(): Promise<{
    all_passed: boolean;
    checks: SecurityCheckResult[];
    timestamp: string;
  }> {
    const res = await fetch('/api/security/verify', {
      method: 'POST',
    });
    return handleResponse(res);
  },
};
