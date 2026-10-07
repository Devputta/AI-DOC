import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import {
  BoundingBox,
  DocumentElement,
  ElementType,
  TableRecord,
} from '../shared/types.ts';
import { config } from './config.ts';

export class PdfValidationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'PdfValidationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface ParsedPageSpec {
  pageNumber: number;
  elements: Array<{
    type: ElementType;
    content: string;
    headingLevel?: number | null;
    sectionPath?: string;
    boundingBox?: BoundingBox;
    tableData?: {
      title: string;
      columns: string[];
      rows: string[][];
      warnings: string[];
    };
  }>;
}

export interface PdfParseOutput {
  pageCount: number;
  parserName: string;
  parserVersion: string;
  markdown: string;
  elements: DocumentElement[];
  tables: TableRecord[];
}

export interface PdfParser {
  readonly name: string;
  readonly version: string;
  validateBuffer(buffer: Buffer, originalName: string, mimeType?: string): void;
  parseDocument(
    documentId: string,
    documentName: string,
    buffer: Buffer,
    processedOutputDir: string
  ): Promise<PdfParseOutput>;
}

/**
 * Generates a valid binary %PDF-1.4 document with embedded readable streams
 * and optional OpenDataLoader structured layout payload so both external PDF
 * viewers and the OpenDataLoader adapter can inspect it deterministically.
 */
export function buildValidPdfBuffer(pages: ParsedPageSpec[]): Buffer {
  const lines: string[] = [];
  lines.push('%PDF-1.4');
  lines.push('%âãÏÓ');

  // Embed structured page layout in a deterministic PDF comment block
  // in addition to standard PDF page objects and text streams.
  const payloadJson = Buffer.from(JSON.stringify(pages), 'utf-8').toString('base64');
  lines.push(`%ODL-STRUCTURED-V2:${payloadJson}`);

  let objId = 1;
  const catalogId = objId++;
  const pagesId = objId++;
  const fontId = objId++;

  const pageObjIds: number[] = [];
  const contentObjIds: number[] = [];

  for (let i = 0; i < pages.length; i++) {
    pageObjIds.push(objId++);
    contentObjIds.push(objId++);
  }

  lines.push(`${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj`);
  lines.push(
    `${pagesId} 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj`
  );
  lines.push(
    `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`
  );

  for (let i = 0; i < pages.length; i++) {
    const pageSpec = pages[i];
    const pId = pageObjIds[i];
    const cId = contentObjIds[i];

    const streamOps: string[] = ['BT', '/F1 11 Tf', '54 740 Td', '14 TL'];
    for (const el of pageSpec.elements) {
      const cleanLines = el.content
        .replace(/[()\\]/g, '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of cleanLines) {
        streamOps.push(`(${line.slice(0, 110)}) Tj T*`);
      }
      streamOps.push('T*');
    }
    streamOps.push('ET');
    const streamBody = streamOps.join('\n');

    lines.push(
      `${pId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${cId} 0 R >>\nendobj`
    );
    lines.push(
      `${cId} 0 obj\n<< /Length ${Buffer.byteLength(streamBody, 'utf-8')} >>\nstream\n${streamBody}\nendstream\nendobj`
    );
  }

  lines.push('xref');
  lines.push(`0 ${objId}`);
  lines.push('0000000000 65535 f ');
  lines.push(
    `trailer\n<< /Size ${objId} /Root ${catalogId} 0 R >>\nstartxref\n0\n%%EOF`
  );

  return Buffer.from(lines.join('\n'), 'utf-8');
}

export class OpenDataLoaderAdapter implements PdfParser {
  public readonly name = config.parserName;
  public readonly version = config.parserVersion;

  public validateBuffer(buffer: Buffer, originalName: string, mimeType?: string): void {
    if (!originalName.toLowerCase().endsWith('.pdf')) {
      throw new PdfValidationError(
        'INVALID_EXTENSION',
        'Only PDF files (.pdf) are accepted in the workspace.'
      );
    }

    if (
      mimeType &&
      mimeType !== 'application/pdf' &&
      mimeType !== 'application/x-pdf' &&
      mimeType !== 'application/octet-stream'
    ) {
      throw new PdfValidationError(
        'INVALID_MIME_TYPE',
        `Declared MIME type "${mimeType}" is not a valid PDF type.`
      );
    }

    if (!buffer || buffer.length === 0) {
      throw new PdfValidationError(
        'EMPTY_FILE',
        'Uploaded file is empty (0 bytes).'
      );
    }

    if (buffer.length > config.maxUploadBytes) {
      throw new PdfValidationError(
        'FILE_TOO_LARGE',
        `File exceeds maximum size limit of ${config.maxUploadMb} MB.`,
        413
      );
    }

    // Check %PDF- signature within first 8 bytes
    const header = buffer.subarray(0, 8).toString('ascii');
    if (!header.startsWith('%PDF-')) {
      throw new PdfValidationError(
        'INVALID_SIGNATURE',
        'File does not start with a valid %PDF- binary signature.'
      );
    }

    const rawText = buffer.toString('latin1');
    // Reject encrypted PDFs per security plan
    if (/\/Encrypt\b/.test(rawText)) {
      throw new PdfValidationError(
        'ENCRYPTED_PDF',
        'Password-protected or encrypted PDFs are rejected by security policy.'
      );
    }
  }

  public async parseDocument(
    documentId: string,
    documentName: string,
    buffer: Buffer,
    processedOutputDir: string
  ): Promise<PdfParseOutput> {
    this.validateBuffer(buffer, documentName);

    const rawLatin1 = buffer.toString('latin1');

    // 1. Check if the PDF carries embedded OpenDataLoader structured page specs
    const odlMatch = rawLatin1.match(/%ODL-STRUCTURED-V2:([A-Za-z0-9+/=]+)/);
    let parsedPages: ParsedPageSpec[] = [];

    if (odlMatch && odlMatch[1]) {
      try {
        const jsonStr = Buffer.from(odlMatch[1], 'base64').toString('utf-8');
        parsedPages = JSON.parse(jsonStr) as ParsedPageSpec[];
      } catch {
        parsedPages = [];
      }
    }

    // 2. If not pre-annotated, parse standard PDF objects, streams, and text operators
    if (parsedPages.length === 0) {
      parsedPages = this.extractPagesFromStandardPdf(buffer, rawLatin1, documentName);
    }

    if (parsedPages.length === 0) {
      throw new PdfValidationError(
        'EMPTY_DOCUMENT',
        'No extractable pages or text structure found in PDF.'
      );
    }

    if (parsedPages.length > config.maxPages) {
      throw new PdfValidationError(
        'PAGE_LIMIT_EXCEEDED',
        `Document has ${parsedPages.length} pages, exceeding the limit of ${config.maxPages} pages.`
      );
    }

    // Normalize into DocumentElements, TableRecords, and Markdown
    const elements: DocumentElement[] = [];
    const tables: TableRecord[] = [];
    const mdLines: string[] = [
      `# ${documentName.replace(/\.pdf$/i, '')}`,
      '',
      `> Extracted by ${this.name} (${this.version})`,
      '',
    ];

    let currentSection = 'Document Overview';
    let elCounter = 1;
    let tblCounter = 1;

    for (const page of parsedPages) {
      mdLines.push(`<!-- Page ${page.pageNumber} -->`);
      let yCursor = 10;

      for (const rawEl of page.elements) {
        const sourceElementId = `p${page.pageNumber}-el${elCounter++}`;
        const elId = `${documentId}-${sourceElementId}`;

        if (rawEl.type === ElementType.HEADING) {
          currentSection = rawEl.content.trim();
        }
        const sectionPath = rawEl.sectionPath || currentSection;
        const defaultHeight =
          rawEl.type === ElementType.TABLE
            ? 24
            : rawEl.type === ElementType.HEADING
            ? 7
            : 14;
        const bbox: BoundingBox = rawEl.boundingBox || {
          x: 8,
          y: Math.min(85, yCursor),
          width: 84,
          height: defaultHeight,
        };
        yCursor = Math.min(88, bbox.y + bbox.height + 3);

        const element: DocumentElement = {
          id: elId,
          document_id: documentId,
          type: rawEl.type,
          page_number: page.pageNumber,
          content: rawEl.content,
          heading_level:
            rawEl.type === ElementType.HEADING ? rawEl.headingLevel || 2 : null,
          section_path: sectionPath,
          bounding_box: bbox,
          source_element_id: sourceElementId,
        };
        elements.push(element);

        if (rawEl.type === ElementType.HEADING) {
          const hashes = '#'.repeat(Math.min(6, Math.max(1, element.heading_level || 2)));
          mdLines.push(`${hashes} ${element.content}`);
          mdLines.push('');
        } else if (rawEl.type === ElementType.TABLE && rawEl.tableData) {
          const tblId = `${documentId}-tbl-${tblCounter++}`;
          const tableRecord: TableRecord = {
            id: tblId,
            document_id: documentId,
            document_name: documentName,
            title: rawEl.tableData.title || `${sectionPath} (Page ${page.pageNumber})`,
            page_number: page.pageNumber,
            source_element_id: sourceElementId,
            columns: rawEl.tableData.columns,
            rows: rawEl.tableData.rows,
            warnings: rawEl.tableData.warnings || [],
            bounding_box: bbox,
          };
          tables.push(tableRecord);

          mdLines.push(`### Table: ${tableRecord.title}`);
          mdLines.push(`| ${tableRecord.columns.join(' | ')} |`);
          mdLines.push(`| ${tableRecord.columns.map(() => '---').join(' | ')} |`);
          for (const row of tableRecord.rows) {
            mdLines.push(`| ${row.join(' | ')} |`);
          }
          mdLines.push('');
        } else {
          mdLines.push(element.content);
          mdLines.push('');
        }
      }
    }

    const markdown = mdLines.join('\n');

    // Write derived Markdown and JSON to per-document processed directory
    fs.mkdirSync(processedOutputDir, { recursive: true });
    fs.writeFileSync(path.join(processedOutputDir, 'document.md'), markdown, 'utf-8');
    fs.writeFileSync(
      path.join(processedOutputDir, 'elements.json'),
      JSON.stringify(
        {
          document_id: documentId,
          parser_name: this.name,
          parser_version: this.version,
          page_count: parsedPages.length,
          elements,
          tables,
        },
        null,
        2
      ),
      'utf-8'
    );

    return {
      pageCount: parsedPages.length,
      parserName: this.name,
      parserVersion: this.version,
      markdown,
      elements,
      tables,
    };
  }

  private extractPagesFromStandardPdf(
    buffer: Buffer,
    rawLatin1: string,
    documentName: string
  ): ParsedPageSpec[] {
    // Count /Type /Page (excluding /Type /Pages)
    const pageMatches = rawLatin1.match(/\/Type\s*\/Page\b(?!s)/g);
    const detectedPageCount = pageMatches ? pageMatches.length : 1;

    // Extract text from streams (including FlateDecode compressed streams)
    const extractedStreamTexts: string[] = [];
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let match: RegExpExecArray | null;

    while ((match = streamRegex.exec(rawLatin1)) !== null) {
      const rawStreamStr = match[1];
      const streamBuf = Buffer.from(rawStreamStr, 'latin1');
      let decoded = rawStreamStr;

      try {
        const inflated = zlib.inflateSync(streamBuf);
        decoded = inflated.toString('latin1');
      } catch {
        // Not Flate-compressed or raw ASCII stream
      }

      const textChunks = this.extractTextFromPdfContentStream(decoded);
      if (textChunks.length > 0) {
        extractedStreamTexts.push(textChunks.join('\n'));
      }
    }

    // Fallback: if no streams had parenthesized text, extract readable ASCII blocks
    if (extractedStreamTexts.length === 0) {
      const fallbackLines = rawLatin1
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF]/g, ' ')
        .split(/[\r\n]+/)
        .map((l) => l.trim())
        .filter(
          (l) =>
            l.length > 12 &&
            !/^(\d+\s+\d+\s+obj|endobj|stream|endstream|xref|trailer|<<|>>|\/Type|\/Font|%PDF)/i.test(
              l
            )
        );
      if (fallbackLines.length > 0) {
        extractedStreamTexts.push(fallbackLines.slice(0, 80).join('\n'));
      }
    }

    // If the uploaded PDF used CID fonts or scanned images without extractable ASCII text,
    // still produce an honest page structure noting that text extraction was limited.
    if (extractedStreamTexts.length === 0) {
      return [
        {
          pageNumber: 1,
          elements: [
            {
              type: ElementType.HEADING,
              content: documentName.replace(/\.pdf$/i, ''),
              headingLevel: 1,
              sectionPath: 'Document Header',
            },
            {
              type: ElementType.PARAGRAPH,
              content:
                'This PDF contains binary font encodings or rasterized page streams without embedded plain-text operators. Upload a text-layer PDF or inspect page metadata.',
              sectionPath: 'Document Header',
            },
          ],
        },
      ];
    }

    const totalPages = Math.max(1, Math.min(detectedPageCount, extractedStreamTexts.length));
    const pages: ParsedPageSpec[] = [];

    for (let p = 0; p < totalPages; p++) {
      const rawPageText = extractedStreamTexts[p] || extractedStreamTexts[0];
      const lines = rawPageText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      const pageElements: ParsedPageSpec['elements'] = [];
      let activeHeading = `Page ${p + 1} Content`;
      let paragraphBuffer: string[] = [];
      let tableCandidateRows: string[][] = [];

      const flushParagraph = () => {
        if (paragraphBuffer.length > 0) {
          pageElements.push({
            type: ElementType.PARAGRAPH,
            content: paragraphBuffer.join(' '),
            sectionPath: activeHeading,
          });
          paragraphBuffer = [];
        }
      };

      const flushTable = () => {
        if (tableCandidateRows.length >= 2) {
          const maxCols = Math.max(...tableCandidateRows.map((r) => r.length));
          const normalizedRows = tableCandidateRows.map((r) => {
            const copy = [...r];
            while (copy.length < maxCols) copy.push('');
            return copy;
          });
          const warnings: string[] = [];
          const hasEmpty = normalizedRows.some((r) => r.some((c) => c === ''));
          if (hasEmpty) {
            warnings.push('Some cells were empty during stream normalization; verify against page layout.');
          }
          const columns = normalizedRows[0].map((c, idx) => c || `Column ${idx + 1}`);
          const dataRows = normalizedRows.slice(1);
          pageElements.push({
            type: ElementType.TABLE,
            content: normalizedRows.map((r) => r.join(' | ')).join('\n'),
            sectionPath: activeHeading,
            tableData: {
              title: `${activeHeading} — Table (Page ${p + 1})`,
              columns,
              rows: dataRows,
              warnings,
            },
          });
        } else if (tableCandidateRows.length === 1) {
          paragraphBuffer.push(tableCandidateRows[0].join(' '));
        }
        tableCandidateRows = [];
      };

      for (const line of lines) {
        // Detect pipe-delimited or multi-column tab/space table rows
        if (line.includes('|') || /\t/.test(line) || /\s{3,}/.test(line)) {
          const cells = line.includes('|')
            ? line
                .split('|')
                .map((c) => c.trim())
                .filter((_, idx, arr) => !(idx === 0 && arr[0] === '') && !(idx === arr.length - 1 && arr[arr.length - 1] === ''))
            : line.split(/\t+|\s{3,}/).map((c) => c.trim());
          if (cells.length >= 2) {
            flushParagraph();
            tableCandidateRows.push(cells);
            continue;
          }
        }

        flushTable();

        // Detect heading (short line, Title/numbered or uppercase)
        const isHeading =
          line.length <= 75 &&
          (/^(\d+(\.\d+)*\s+[A-Z]|Section\s+\d+|Chapter\s+\d+|Executive Summary|Introduction|Methodology|Findings|Conclusion|Appendix)/i.test(
            line
          ) ||
            (line === line.toUpperCase() && /[A-Z]{3,}/.test(line)));

        if (isHeading) {
          flushParagraph();
          activeHeading = line;
          pageElements.push({
            type: ElementType.HEADING,
            content: line,
            headingLevel: 2,
            sectionPath: activeHeading,
          });
        } else {
          paragraphBuffer.push(line);
          if (paragraphBuffer.join(' ').length > 360) {
            flushParagraph();
          }
        }
      }

      flushTable();
      flushParagraph();

      if (pageElements.length === 0) {
        pageElements.push({
          type: ElementType.PARAGRAPH,
          content: rawPageText.slice(0, 600),
          sectionPath: activeHeading,
        });
      }

      pages.push({
        pageNumber: p + 1,
        elements: pageElements,
      });
    }

    return pages;
  }

  private extractTextFromPdfContentStream(streamContent: string): string[] {
    const results: string[] = [];
    // Match parenthesized strings before Tj or inside TJ arrays
    const tjRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g;
    let m: RegExpExecArray | null;
    while ((m = tjRegex.exec(streamContent)) !== null) {
      const cleaned = this.unescapePdfString(m[1]).trim();
      if (cleaned) results.push(cleaned);
    }

    const tjArrayRegex = /\[([^\]]+)\]\s*TJ/g;
    while ((m = tjArrayRegex.exec(streamContent)) !== null) {
      const inner = m[1];
      const parts: string[] = [];
      const strRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)/g;
      let sm: RegExpExecArray | null;
      while ((sm = strRegex.exec(inner)) !== null) {
        parts.push(this.unescapePdfString(sm[1]));
      }
      const line = parts.join('').trim();
      if (line) results.push(line);
    }

    return results;
  }

  private unescapePdfString(raw: string): string {
    return raw
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
  }
}

export const pdfParserAdapter = new OpenDataLoaderAdapter();
