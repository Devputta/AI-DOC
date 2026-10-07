import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  ComparisonRecord,
  DocumentChunk,
  DocumentElement,
  DocumentRecord,
  DocumentStatus,
  TableRecord,
} from '../shared/types.ts';
import { config, sanitizeFilename } from './config.ts';
import {
   pdfParserAdapter,
  PdfValidationError,
} from './pdfParserAdapter.ts';
import { buildSectionChunks } from './services/chunkingAndRetrieval.ts';
import { compareDocuments } from './services/tablesAndComparison.ts';

interface PersistedDatabase {
  remoteAiEnabled: boolean;
  documents: DocumentRecord[];
  elements: DocumentElement[];
  chunks: DocumentChunk[];
  tables: TableRecord[];
  comparisons: ComparisonRecord[];
}

export class DocuLensStorage {
  private state: PersistedDatabase = {
    remoteAiEnabled: config.remoteAiEnabledByDefault,
    documents: [],
    elements: [],
    chunks: [],
    tables: [],
    comparisons: [],
  };

  public async initialize(): Promise<void> {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    fs.mkdirSync(config.processedDir, { recursive: true });

    if (fs.existsSync(config.dbFilePath)) {
      try {
        const raw = fs.readFileSync(config.dbFilePath, 'utf-8');
        const parsed = JSON.parse(raw) as PersistedDatabase;
        if (parsed && Array.isArray(parsed.documents)) {
          this.state = parsed;
        }
      } catch {
        // Re-initialize if corrupted
      }
    }

    // Purge any development/demo PDFs that were created earlier
    const demoDocs = this.state.documents.filter(
      (d) =>
        d.is_demo ||
        d.id.startsWith('doc-demo-') ||
        d.original_name.startsWith('[Demo]')
    );
    if (demoDocs.length > 0) {
      for (const d of demoDocs) {
        try {
          this.deleteDocumentCascade(d.id);
        } catch {
          // continue cleanup
        }
      }
    }
  }

  private persist(): void {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.writeFileSync(config.dbFilePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  public isRemoteAiEnabled(): boolean {
    return this.state.remoteAiEnabled;
  }

  public setRemoteAiEnabled(enabled: boolean): boolean {
    this.state.remoteAiEnabled = Boolean(enabled);
    this.persist();
    return this.state.remoteAiEnabled;
  }

  public listDocuments(): DocumentRecord[] {
    return this.state.documents
      .map((doc) => ({
        ...doc,
        chunk_count: this.state.chunks.filter((c) => c.document_id === doc.id).length,
        table_count: this.state.tables.filter((t) => t.document_id === doc.id).length,
        element_count: this.state.elements.filter((e) => e.document_id === doc.id).length,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  public getDocumentById(id: string): DocumentRecord | undefined {
    const doc = this.state.documents.find((d) => d.id === id);
    if (!doc) return undefined;
    return {
      ...doc,
      chunk_count: this.state.chunks.filter((c) => c.document_id === doc.id).length,
      table_count: this.state.tables.filter((t) => t.document_id === doc.id).length,
      element_count: this.state.elements.filter((e) => e.document_id === doc.id).length,
    };
  }

  public getDocumentElements(documentId: string): DocumentElement[] {
    return this.state.elements.filter((e) => e.document_id === documentId);
  }

  public getDocumentChunks(documentId?: string): DocumentChunk[] {
    if (!documentId) {
      const readyIds = new Set(
        this.state.documents
          .filter((d) => d.status === DocumentStatus.READY)
          .map((d) => d.id)
      );
      return this.state.chunks.filter((c) => readyIds.has(c.document_id));
    }
    return this.state.chunks.filter((c) => c.document_id === documentId);
  }

  public getDocumentMarkdown(documentId: string): string {
    const mdPath = path.join(config.processedDir, documentId, 'document.md');
    if (fs.existsSync(mdPath)) {
      return fs.readFileSync(mdPath, 'utf-8');
    }
    return '';
  }

  public getDocumentPdfBuffer(documentId: string): Buffer | null {
    const doc = this.state.documents.find((d) => d.id === documentId);
    if (!doc) return null;
    const pdfPath = path.join(config.uploadsDir, doc.stored_filename);
    if (fs.existsSync(pdfPath)) {
      return fs.readFileSync(pdfPath);
    }
    return null;
  }

  public listTables(documentId?: string): TableRecord[] {
    if (documentId) {
      return this.state.tables.filter((t) => t.document_id === documentId);
    }
    return this.state.tables;
  }

  public getTableById(tableId: string): TableRecord | undefined {
    return this.state.tables.find((t) => t.id === tableId);
  }

  public listComparisons(): ComparisonRecord[] {
    return [...this.state.comparisons].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  }

  public getComparisonById(id: string): ComparisonRecord | undefined {
    return this.state.comparisons.find((c) => c.id === id);
  }

  public createComparison(
    leftDocumentId: string,
    rightDocumentId: string
  ): ComparisonRecord {
    const leftDoc = this.getDocumentById(leftDocumentId);
    const rightDoc = this.getDocumentById(rightDocumentId);

    if (!leftDoc || !rightDoc) {
      throw new PdfValidationError(
        'DOCUMENT_NOT_FOUND',
        'Comparison needs two ready documents.',
        404
      );
    }

    if (
      leftDoc.status !== DocumentStatus.READY ||
      rightDoc.status !== DocumentStatus.READY
    ) {
      throw new PdfValidationError(
        'DOCUMENTS_NOT_READY',
        'Comparison needs two ready documents.',
        400
      );
    }

    // Check if an identical comparison already exists
    const existing = this.state.comparisons.find(
      (c) =>
        c.left_document_id === leftDocumentId &&
        c.right_document_id === rightDocumentId
    );
    if (existing) {
      this.state.comparisons = this.state.comparisons.filter(
        (c) => c.id !== existing.id
      );
    }

    const leftChunks = this.getDocumentChunks(leftDocumentId);
    const rightChunks = this.getDocumentChunks(rightDocumentId);
    const cmpId = `cmp-${crypto.randomUUID().slice(0, 8)}`;

    const record = compareDocuments(
      cmpId,
      leftDoc,
      leftChunks,
      rightDoc,
      rightChunks
    );

    this.state.comparisons.unshift(record);
    this.persist();
    return record;
  }

  public async ingestPdfBuffer(params: {
    originalName: string;
    buffer: Buffer;
    mimeType?: string;
    forcedId?: string;
    isDemo?: boolean;
  }): Promise<DocumentRecord> {
    const safeOriginalName = sanitizeFilename(params.originalName);

    // Step 1: Validate PDF signature, MIME, extension, and size before writing
    pdfParserAdapter.validateBuffer(params.buffer, safeOriginalName, params.mimeType);

    // Step 2: Generate UUID storage path & SHA-256 checksum
    const docId = params.forcedId || `doc-${crypto.randomUUID()}`;
    const sha256 = crypto
      .createHash('sha256')
      .update(params.buffer)
      .digest('hex');

    const storedFilename = `${docId}.pdf`;
    const storedFilePath = path.join(config.uploadsDir, storedFilename);
    fs.writeFileSync(storedFilePath, params.buffer);

    const nowIso = new Date().toISOString();

    // Remove previous record with same ID if reprocessing/reseeding
    this.removeDerivedRecordsOnly(docId);
    this.state.documents = this.state.documents.filter((d) => d.id !== docId);

    const docRecord: DocumentRecord = {
      id: docId,
      original_name: safeOriginalName,
      stored_filename: storedFilename,
      sha256,
      size_bytes: params.buffer.length,
      page_count: 0,
      status: DocumentStatus.QUEUED,
      parser_name: pdfParserAdapter.name,
      parser_version: pdfParserAdapter.version,
      created_at: nowIso,
      processed_at: null,
      error_code: null,
      error_message: null,
      is_demo: Boolean(params.isDemo),
    };

    this.state.documents.push(docRecord);
    this.persist();

    // Step 3: Transition to PROCESSING and run parser with timeout
    await this.runExtractionPipeline(docRecord, params.buffer);
    return this.getDocumentById(docId)!;
  }

  public async reprocessDocument(documentId: string): Promise<DocumentRecord> {
    const doc = this.state.documents.find((d) => d.id === documentId);
    if (!doc) {
      throw new PdfValidationError(
        'DOCUMENT_NOT_FOUND',
        'Document not found in library.',
        404
      );
    }

    const pdfPath = path.join(config.uploadsDir, doc.stored_filename);
    if (!fs.existsSync(pdfPath)) {
      throw new PdfValidationError(
        'SOURCE_FILE_MISSING',
        'Stored PDF file is missing on disk; re-upload the document.',
        404
      );
    }

    const buffer = fs.readFileSync(pdfPath);
    this.removeDerivedRecordsOnly(documentId);
    await this.runExtractionPipeline(doc, buffer);
    return this.getDocumentById(documentId)!;
  }

  private async runExtractionPipeline(
    docRecord: DocumentRecord,
    buffer: Buffer
  ): Promise<void> {
    docRecord.status = DocumentStatus.PROCESSING;
    docRecord.error_code = null;
    docRecord.error_message = null;
    this.persist();

    const docProcessedDir = path.join(config.processedDir, docRecord.id);

    try {
      const parsePromise = pdfParserAdapter.parseDocument(
        docRecord.id,
        docRecord.original_name,
        buffer,
        docProcessedDir
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(
            new PdfValidationError(
              'PARSER_TIMEOUT',
              `PDF extraction exceeded timeout limit of ${config.parserTimeoutSeconds} seconds.`
            )
          );
        }, config.parserTimeoutSeconds * 1000);
      });

      const parsed = await Promise.race([parsePromise, timeoutPromise]);

      const chunks = buildSectionChunks(
        docRecord.id,
        docRecord.original_name,
        parsed.elements
      );

      this.state.elements.push(...parsed.elements);
      this.state.chunks.push(...chunks);
      this.state.tables.push(...parsed.tables);

      docRecord.page_count = parsed.pageCount;
      docRecord.parser_name = parsed.parserName;
      docRecord.parser_version = parsed.parserVersion;
      docRecord.status = DocumentStatus.READY;
      docRecord.processed_at = new Date().toISOString();
      this.persist();
    } catch (err) {
      docRecord.status = DocumentStatus.FAILED;
      if (err instanceof PdfValidationError) {
        docRecord.error_code = err.code;
        docRecord.error_message = err.message;
      } else {
        docRecord.error_code = 'PARSER_ERROR';
        docRecord.error_message =
          'Structured extraction failed safely without exposing system internals.';
      }
      this.persist();
    }
  }

  private removeDerivedRecordsOnly(documentId: string): void {
    this.state.elements = this.state.elements.filter(
      (e) => e.document_id !== documentId
    );
    this.state.chunks = this.state.chunks.filter(
      (c) => c.document_id !== documentId
    );
    this.state.tables = this.state.tables.filter(
      (t) => t.document_id !== documentId
    );
    this.state.comparisons = this.state.comparisons.filter(
      (cmp) =>
        cmp.left_document_id !== documentId &&
        cmp.right_document_id !== documentId
    );
  }

  /**
   * Cascade deletes metadata, elements, chunks, tables, comparisons, and all owned
   * disk artifacts. Verifies file deletion and reports any partial cleanup failure honestly.
   */
  public deleteDocumentCascade(documentId: string): {
    deleted: boolean;
    removed_chunks: number;
    removed_tables: number;
    files_cleaned: boolean;
  } {
    const doc = this.state.documents.find((d) => d.id === documentId);
    if (!doc) {
      throw new PdfValidationError(
        'DOCUMENT_NOT_FOUND',
        'Document not found or already deleted.',
        404
      );
    }

    const removedChunks = this.state.chunks.filter(
      (c) => c.document_id === documentId
    ).length;
    const removedTables = this.state.tables.filter(
      (t) => t.document_id === documentId
    ).length;

    const uploadFilePath = path.join(config.uploadsDir, doc.stored_filename);
    const processedDirPath = path.join(config.processedDir, documentId);

    let filesCleaned = true;
    try {
      if (fs.existsSync(uploadFilePath)) {
        fs.unlinkSync(uploadFilePath);
      }
      if (fs.existsSync(processedDirPath)) {
        fs.rmSync(processedDirPath, { recursive: true, force: true });
      }
    } catch {
      filesCleaned = false;
    }

    this.removeDerivedRecordsOnly(documentId);
    this.state.documents = this.state.documents.filter(
      (d) => d.id !== documentId
    );
    this.persist();

    if (!filesCleaned) {
      throw new PdfValidationError(
        'PARTIAL_CLEANUP_FAILURE',
        'Metadata was removed, but one or more derived files could not be unlinked. Retry cleanup.',
        500
      );
    }

    return {
      deleted: true,
      removed_chunks: removedChunks,
      removed_tables: removedTables,
      files_cleaned: filesCleaned,
    };
  }

  public async clearAllAndResetDemo(_reseedDemo?: boolean): Promise<void> {
    for (const doc of [...this.state.documents]) {
      try {
        this.deleteDocumentCascade(doc.id);
      } catch {
        // continue
      }
    }
    this.state.documents = [];
    this.state.elements = [];
    this.state.chunks = [];
    this.state.tables = [];
    this.state.comparisons = [];
    this.persist();
  }

  public getStorageBytesUsed(): number {
    return this.state.documents.reduce((sum, d) => sum + (d.size_bytes || 0), 0);
  }
}

export const storage = new DocuLensStorage();
