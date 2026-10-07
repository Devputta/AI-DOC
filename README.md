# DocuLens — Document Intelligence Platform

**Blueprint v1.0 · Advanced MVP · Local-first + optional remote AI**

DocuLens lets users upload PDFs, ask evidence-grounded questions with page citations, extract tables, and compare documents.

## MVP Capabilities
- **Library & Upload**: PDF signature (`%PDF-`) validation, byte/page limits, SHA-256 checksums, UUID storage isolation, and full cascade deletion.
- **Structured Extraction**: `PdfParser` interface with an OpenDataLoader-compatible PDF adapter that preserves page numbers, section headings, bounding boxes, and Markdown/JSON derivatives.
- **Lexical Retrieval**: Section-aware chunking and deterministic TF-IDF lexical search with document, page, and element provenance.
- **Evidence-Grounded Chat & Citation Validation**: Server-side citation validator rejects any model-invented chunk ID, document ID, or page number. Works 100% locally in Extractive Mode or with optional opt-in Remote AI (`gemini-3.8-flash`).
- **Table Extraction & Safe CSV Export**: Preview detected tables with extraction warnings and export RFC 4180 CSVs with spreadsheet formula-injection neutralization (`=`, `+`, `-`, `@`).
- **Two-Document Comparison**: Aligns sections and paragraphs across two ready PDFs, classifying `added`, `removed`, `changed`, and `uncertain` passages with numeric delta detection and side-by-side page evidence.
