import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { config } from './src/server/config.ts';
import {
  buildValidPdfBuffer,
  ParsedPageSpec,
  PdfValidationError,
} from './src/server/pdfParserAdapter.ts';
import { runSecurityVerificationSuite } from './src/server/securityVerifier.ts';
import { retrieveChunks } from './src/server/services/chunkingAndRetrieval.ts';
import { answerQuestionWithCitations } from './src/server/services/citationsAndChat.ts';
import { exportTableToCsv } from './src/server/services/tablesAndComparison.ts';
import { storage } from './src/server/storage.ts';
import { AppSettings, ChatRequest } from './src/shared/types.ts';

function parseMultipartSingleFile(
  rawBody: Buffer,
  contentTypeHeader: string
): { filename: string; mimeType: string; fileBuffer: Buffer } | null {
  const boundaryMatch = contentTypeHeader.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return null;
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const delimiter = Buffer.from(`--${boundary}`, 'latin1');

  let start = rawBody.indexOf(delimiter);
  while (start !== -1) {
    start += delimiter.length;
    if (rawBody.subarray(start, start + 2).toString('latin1') === '--') {
      break;
    }
    if (rawBody.subarray(start, start + 2).toString('latin1') === '\r\n') {
      start += 2;
    }

    const nextDelimiter = rawBody.indexOf(delimiter, start);
    if (nextDelimiter === -1) break;

    const part = rawBody.subarray(start, nextDelimiter - 2); // strip trailing \r\n
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n', 'latin1'));
    if (headerEnd !== -1) {
      const headersText = part.subarray(0, headerEnd).toString('utf-8');
      const filenameMatch = headersText.match(/filename="([^"]*)"/i);
      if (filenameMatch) {
        const mimeMatch = headersText.match(/Content-Type:\s*([^\r\n;]+)/i);
        const fileBuffer = part.subarray(headerEnd + 4);
        return {
          filename: filenameMatch[1] || 'uploaded.pdf',
          mimeType: mimeMatch ? mimeMatch[1].trim() : 'application/pdf',
          fileBuffer,
        };
      }
    }
    start = nextDelimiter;
  }

  return null;
}

async function startServer() {
  await storage.initialize();

  const app = express();
  const PORT = 3000;

  // Allow up to 35MB JSON or raw bodies to enforce our custom 25MB limit cleanly with 413
  app.use(express.json({ limit: '35mb' }));

  // 1. Health Endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'DocuLens API',
      env: config.env,
      parser: {
        name: config.parserName,
        version: config.parserVersion,
        timeout_seconds: config.parserTimeoutSeconds,
      },
      limits: {
        max_upload_mb: config.maxUploadMb,
        max_pages: config.maxPages,
      },
      remote_ai: {
        enabled: storage.isRemoteAiEnabled(),
        key_configured: config.geminiApiKeyConfigured,
        model: config.remoteModelName,
      },
      documents_ready: storage.listDocuments().length,
    });
  });

  // 2. Settings Endpoints
  app.get('/api/settings', (_req: Request, res: Response) => {
    const settings: AppSettings = {
      env: config.env,
      max_upload_mb: config.maxUploadMb,
      max_pages: config.maxPages,
      parser_timeout_seconds: config.parserTimeoutSeconds,
      remote_ai_enabled: storage.isRemoteAiEnabled(),
      remote_ai_Configured: config.geminiApiKeyConfigured,
      remote_model_name: config.remoteModelName,
      parser_adapter: config.parserName,
      parser_version: config.parserVersion,
      storage_document_count: storage.listDocuments().length,
      storage_bytes_used: storage.getStorageBytesUsed(),
    };
    res.json(settings);
  });

  app.post('/api/settings', (req: Request, res: Response) => {
    const { remote_ai_enabled } = req.body || {};
    if (typeof remote_ai_enabled === 'boolean') {
      storage.setRemoteAiEnabled(remote_ai_enabled);
    }
    const settings: AppSettings = {
      env: config.env,
      max_upload_mb: config.maxUploadMb,
      max_pages: config.maxPages,
      parser_timeout_seconds: config.parserTimeoutSeconds,
      remote_ai_enabled: storage.isRemoteAiEnabled(),
      remote_ai_Configured: config.geminiApiKeyConfigured,
      remote_model_name: config.remoteModelName,
      parser_adapter: config.parserName,
      parser_version: config.parserVersion,
      storage_document_count: storage.listDocuments().length,
      storage_bytes_used: storage.getStorageBytesUsed(),
    };
    res.json(settings);
  });

  app.post('/api/settings/reset', async (req: Request, res: Response) => {
    const reseedDemo = req.body?.reseed_demo !== false;
    await storage.clearAllAndResetDemo(reseedDemo);
    res.json({
      reset: true,
      reseeded_demo: reseedDemo,
      documents: storage.listDocuments(),
    });
  });

  // 3. Documents List & Upload
  app.get('/api/documents', (_req: Request, res: Response) => {
    res.json({
      documents: storage.listDocuments(),
    });
  });

  app.post(
    '/api/documents',
    express.raw({ type: 'multipart/form-data', limit: '35mb' }),
    async (req: Request, res: Response) => {
      try {
        let originalName = 'uploaded.pdf';
        let mimeType = 'application/pdf';
        let fileBuffer: Buffer | null = null;

        const contentType = req.headers['content-type'] || '';
        if (contentType.includes('multipart/form-data') && Buffer.isBuffer(req.body)) {
          const parsed = parseMultipartSingleFile(req.body, contentType);
          if (!parsed) {
            res.status(400).json({
              error_code: 'MISSING_FILE',
              message: 'No PDF file found in multipart upload request.',
            });
            return;
          }
          originalName = parsed.filename;
          mimeType = parsed.mimeType;
          fileBuffer = parsed.fileBuffer;
        } else if (req.body && typeof req.body === 'object') {
          if (req.body.pages && Array.isArray(req.body.pages)) {
            originalName = req.body.filename || 'custom_fixture.pdf';
            mimeType = 'application/pdf';
            fileBuffer = buildValidPdfBuffer(req.body.pages as ParsedPageSpec[]);
          } else if (typeof req.body.base64Data === 'string') {
            originalName = req.body.filename || 'uploaded.pdf';
            mimeType = req.body.mimeType || 'application/pdf';
            fileBuffer = Buffer.from(req.body.base64Data, 'base64');
          }
        }

        if (!fileBuffer) {
          res.status(400).json({
            error_code: 'MISSING_FILE',
            message: 'Provide a valid PDF file to upload.',
          });
          return;
        }

        const doc = await storage.ingestPdfBuffer({
          originalName,
          buffer: fileBuffer,
          mimeType,
          isDemo: false,
        });

        res.status(201).json({ document: doc });
      } catch (err) {
        if (err instanceof PdfValidationError) {
          res.status(err.statusCode).json({
            error_code: err.code,
            message: err.message,
          });
          return;
        }
        res.status(500).json({
          error_code: 'UPLOAD_FAILED',
          message: 'Document upload failed safely without exposing system paths.',
        });
      }
    }
  );

  app.get('/api/documents/:id', (req: Request, res: Response) => {
    const doc = storage.getDocumentById(req.params.id);
    if (!doc) {
      res.status(404).json({
        error_code: 'DOCUMENT_NOT_FOUND',
        message: 'Document not found.',
      });
      return;
    }
    const elements = storage.getDocumentElements(doc.id);
    const chunks = storage.getDocumentChunks(doc.id);
    const tables = storage.listTables(doc.id);
    const markdown = storage.getDocumentMarkdown(doc.id);

    res.json({
      document: doc,
      elements,
      chunks,
      tables,
      markdown,
    });
  });

  app.get('/api/documents/:id/download.pdf', (req: Request, res: Response) => {
    const doc = storage.getDocumentById(req.params.id);
    const buf = storage.getDocumentPdfBuffer(req.params.id);
    if (!doc || !buf) {
      res.status(404).json({
        error_code: 'DOCUMENT_NOT_FOUND',
        message: 'Stored PDF file not found.',
      });
      return;
    }
    const safeName = doc.original_name.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.send(buf);
  });

  app.post('/api/documents/:id/reprocess', async (req: Request, res: Response) => {
    try {
      const updated = await storage.reprocessDocument(req.params.id);
      res.json({ document: updated });
    } catch (err) {
      if (err instanceof PdfValidationError) {
        res.status(err.statusCode).json({
          error_code: err.code,
          message: err.message,
        });
        return;
      }
      res.status(500).json({
        error_code: 'REPROCESS_FAILED',
        message: 'Unable to reprocess document.',
      });
    }
  });

  app.delete('/api/documents/:id', (req: Request, res: Response) => {
    try {
      const result = storage.deleteDocumentCascade(req.params.id);
      res.json(result);
    } catch (err) {
      if (err instanceof PdfValidationError) {
        res.status(err.statusCode).json({
          error_code: err.code,
          message: err.message,
        });
        return;
      }
      res.status(500).json({
        error_code: 'DELETE_FAILED',
        message: 'Deletion encountered an error; please retry.',
      });
    }
  });

  // 4. Lexical Search Endpoint
  app.post('/api/search', (req: Request, res: Response) => {
    const { query, document_ids, limit } = req.body || {};
    const allChunks = storage.getDocumentChunks();
    const results = retrieveChunks(
      String(query || ''),
      allChunks,
      Array.isArray(document_ids) ? document_ids : undefined,
      typeof limit === 'number' ? limit : 10
    );
    res.json({
      query: String(query || ''),
      results,
      total: results.length,
    });
  });

  // 5. Chat with Server-Validated Citations
  app.post('/api/chat', async (req: Request, res: Response) => {
    try {
      const chatReq: ChatRequest = {
        question: String(req.body?.question || ''),
        document_ids: Array.isArray(req.body?.document_ids)
          ? req.body.document_ids
          : [],
        mode: req.body?.mode,
        simulate_hallucinated_citation: Boolean(
          req.body?.simulate_hallucinated_citation
        ),
      };

      const allReadyChunks = storage.getDocumentChunks();
      const response = await answerQuestionWithCitations(
        chatReq,
        allReadyChunks,
        storage.isRemoteAiEnabled()
      );
      res.json(response);
    } catch {
      res.status(500).json({
        error_code: 'CHAT_ERROR',
        message: 'Unable to complete evidence synthesis.',
      });
    }
  });

  // 6. Tables Endpoints & Safe CSV Export
  app.get('/api/tables', (req: Request, res: Response) => {
    const documentId =
      typeof req.query.document_id === 'string' ? req.query.document_id : undefined;
    res.json({
      tables: storage.listTables(documentId),
    });
  });

  app.get('/api/documents/:id/tables', (req: Request, res: Response) => {
    res.json({
      tables: storage.listTables(req.params.id),
    });
  });

  app.get('/api/tables/:id', (req: Request, res: Response) => {
    const table = storage.getTableById(req.params.id);
    if (!table) {
      res.status(404).json({
        error_code: 'TABLE_NOT_FOUND',
        message: 'Table not found.',
      });
      return;
    }
    res.json({ table });
  });

  app.get('/api/tables/:id/export.csv', (req: Request, res: Response) => {
    const table = storage.getTableById(req.params.id);
    if (!table) {
      res.status(404).json({
        error_code: 'TABLE_NOT_FOUND',
        message: 'Table not found.',
      });
      return;
    }
    const { filename, csvContent, mitigatedFormulaCells } = exportTableToCsv(table);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-DocuLens-Mitigated-Cells', String(mitigatedFormulaCells));
    res.send(csvContent);
  });

  // 7. Document Comparisons Endpoints
  app.get('/api/comparisons', (_req: Request, res: Response) => {
    res.json({
      comparisons: storage.listComparisons(),
    });
  });

  app.get('/api/comparisons/:id', (req: Request, res: Response) => {
    const cmp = storage.getComparisonById(req.params.id);
    if (!cmp) {
      res.status(404).json({
        error_code: 'COMPARISON_NOT_FOUND',
        message: 'Comparison not found.',
      });
      return;
    }
    res.json({ comparison: cmp });
  });

  app.post('/api/comparisons', (req: Request, res: Response) => {
    try {
      const { left_document_id, right_document_id } = req.body || {};
      if (!left_document_id || !right_document_id) {
        res.status(400).json({
          error_code: 'MISSING_DOCUMENTS',
          message: 'Comparison needs two ready documents.',
        });
        return;
      }
      const comparison = storage.createComparison(
        String(left_document_id),
        String(right_document_id)
      );
      res.status(201).json({ comparison });
    } catch (err) {
      if (err instanceof PdfValidationError) {
        res.status(err.statusCode).json({
          error_code: err.code,
          message: err.message,
        });
        return;
      }
      res.status(500).json({
        error_code: 'COMPARISON_FAILED',
        message: 'Failed to compare selected documents.',
      });
    }
  });

  // 8. Live Security & Invariant Verification Endpoint
  app.post('/api/security/verify', (_req: Request, res: Response) => {
    const checks = runSecurityVerificationSuite();
    res.json({
      all_passed: checks.every((c) => c.passed),
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DocuLens server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
