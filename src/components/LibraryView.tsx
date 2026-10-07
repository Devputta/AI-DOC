import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Download,
  FilePlus2,
  FileUp,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { api, EvidenceFocus } from '../lib/api.ts';
import {
  DocumentRecord,
  DocumentStatus,
  ElementType,
} from '../shared/types.ts';

interface LibraryViewProps {
  documents: DocumentRecord[];
  selectedDocIds: string[];
  onToggleSelectDoc: (id: string) => void;
  onRefreshDocuments: () => Promise<void>;
  onOpenDocumentInWorkspace: (docId: string, focus?: EvidenceFocus) => void;
  onNotify: (message: string, type?: 'info' | 'error' | 'success') => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  documents,
  selectedDocIds,
  onToggleSelectDoc,
  onRefreshDocuments,
  onOpenDocumentInWorkspace,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<DocumentRecord | null>(
    null
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  const [showComposer, setShowComposer] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customSection, setCustomSection] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [customTableCsv, setCustomTableCsv] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    e.target.value = '';
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const created = await api.uploadPdfFile(file);
      await onRefreshDocuments();
      onNotify(
        `Added "${created.original_name}" (${created.page_count} pages).`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      setUploadError(msg);
      onNotify(msg, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateCustomPdf = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    setUploadError(null);
    try {
      const filename = customTitle.trim().endsWith('.pdf')
        ? customTitle.trim()
        : `${customTitle.trim() || 'custom_report'}.pdf`;

      const tableLines = customTableCsv
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const parsedRows = tableLines.map((line) =>
        line.split('|').map((c) => c.trim())
      );
      const columns =
        parsedRows.length > 0 ? parsedRows[0] : ['Column 1', 'Column 2'];
      const rows = parsedRows.length > 1 ? parsedRows.slice(1) : [];

      const created = await api.createCustomStructuredPdf({
        filename,
        pages: [
          {
            pageNumber: 1,
            elements: [
              {
                type: ElementType.HEADING,
                content: customSection.trim() || '1. Technical Overview',
                headingLevel: 1,
                sectionPath: customSection.trim() || '1. Technical Overview',
              },
              {
                type: ElementType.PARAGRAPH,
                content: customBody.trim(),
                sectionPath: customSection.trim() || '1. Technical Overview',
              },
              ...(rows.length > 0
                ? [
                    {
                      type: ElementType.TABLE,
                      content: tableLines.join('\n'),
                      sectionPath: customSection.trim() || '1. Technical Overview',
                      tableData: {
                        title: `${customSection.trim()} — Extracted Table`,
                        columns,
                        rows,
                        warnings: rows.some((r) =>
                          r.some((c) => /^[=+\-@]/.test(c.trim()))
                        )
                          ? [
                              'Contains formula-prefixed cell values; CSV export applies single-quote escaping.',
                            ]
                          : [],
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
      });

      await onRefreshDocuments();
      setShowComposer(false);
      onNotify(
        `Cataloged "${created.original_name}" (${created.page_count} page).`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create PDF.';
      setUploadError(msg);
      onNotify(msg, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleReprocess = async (doc: DocumentRecord) => {
    setReprocessingId(doc.id);
    try {
      await api.reprocessDocument(doc.id);
      await onRefreshDocuments();
      onNotify(`Re-indexed "${doc.original_name}".`, 'success');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Reprocess failed.',
        'error'
      );
    } finally {
      setReprocessingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteDoc) return;
    setDeletingId(confirmDeleteDoc.id);
    try {
      const res = await api.deleteDocument(confirmDeleteDoc.id);
      setConfirmDeleteDoc(null);
      await onRefreshDocuments();
      onNotify(
        `Removed manuscript and ${res.removed_chunks} indexed passages from desk.`,
        'info'
      );
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Deletion failed.',
        'error'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const cleanDocTitle = (raw: string) =>
    raw.replace(/^\[Demo\]\s*/i, '').replace(/\.pdf$/i, '').replace(/_/g, ' ');

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-5xl space-y-8">
      {/* Masthead */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pb-4">
          <div>
            <h1 className="font-editorial text-3xl lg:text-4xl font-normal text-[#1F201C] tracking-tight">
              Manuscript Catalog
            </h1>
            <p className="text-sm text-[#4A4942] mt-1 font-editorial italic">
              {documents.length} cataloged PDFs on local storage ·{' '}
              {selectedDocIds.length} active on the reading desk
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => setShowComposer((v) => !v)}
              className="px-3.5 py-2 text-xs font-medium text-[#1F201C] border border-[#242520]/30 hover:border-[#242520] rounded-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>{showComposer ? 'Close Draft Sheet' : 'Draft Test PDF'}</span>
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-xs font-medium text-white bg-[#B84B2F] hover:bg-[#963920] disabled:opacity-50 rounded-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>{uploading ? 'Cataloging PDF…' : 'Add a PDF'}</span>
            </button>
          </div>
        </div>
        <div className="editorial-double-rule" />
      </div>

      {/* Upload Error Callout */}
      {uploadError && (
        <div
          role="alert"
          className="py-3 px-4 border-l-2 border-[#9E2A2B] bg-[#9E2A2B]/5 flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[#9E2A2B] shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-semibold text-[#9E2A2B]">
                Manuscript Rejected by Intake Check
              </div>
              <p className="text-xs text-[#1F201C] mt-0.5">{uploadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-xs text-[#6E6C63] hover:text-[#1F201C]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Draft Test PDF Sheet */}
      {showComposer && (
        <form
          onSubmit={handleCreateCustomPdf}
          className="folio-sheet p-7 border border-[#D5CFC2] space-y-5"
        >
          <div className="border-b border-[#D5CFC2] pb-3">
            <h2 className="font-editorial text-xl text-[#1F201C] font-normal">
              Compose a Test PDF Manuscript
            </h2>
            <p className="text-xs text-[#6E6C63] mt-0.5">
              Writes a binary %PDF-1.4 document with embedded text and table streams directly to your local shelf.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs text-[#4A4942] mb-1">
                File Name (.pdf)
              </label>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-[#F4F1E9] border border-[#D5CFC2] text-[#1F201C] focus:outline-none focus:border-[#B84B2F]"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#4A4942] mb-1">
                Primary Section Heading
              </label>
              <input
                type="text"
                value={customSection}
                onChange={(e) => setCustomSection(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-[#F4F1E9] border border-[#D5CFC2] text-[#1F201C] focus:outline-none focus:border-[#B84B2F]"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#4A4942] mb-1">
              Body Passage
            </label>
            <textarea
              rows={3}
              value={customBody}
              onChange={(e) => setCustomBody(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#F4F1E9] border border-[#D5CFC2] text-[#1F201C] focus:outline-none focus:border-[#B84B2F] leading-relaxed"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-[#4A4942] mb-1">
              Tabular Data (Pipe-delimited rows; first row is column headers)
            </label>
            <textarea
              rows={4}
              value={customTableCsv}
              onChange={(e) => setCustomTableCsv(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono-tabular bg-[#F4F1E9] border border-[#D5CFC2] text-[#1F201C] focus:outline-none focus:border-[#B84B2F]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowComposer(false)}
              className="px-3 py-1.5 text-xs text-[#6E6C63] hover:text-[#1F201C]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="px-4 py-2 text-xs font-medium text-white bg-[#B84B2F] hover:bg-[#963920] rounded-sm transition-colors cursor-pointer"
            >
              Typeset & Add to Catalog
            </button>
          </div>
        </form>
      )}

      {/* Open Archival Catalog Ledger */}
      {documents.length === 0 ? (
        <div className="py-16 border-b border-[#D5CFC2] text-center space-y-3">
          <div className="font-editorial text-2xl italic text-[#1F201C]">
            Your reading desk is empty
          </div>
          <p className="text-xs text-[#6E6C63] max-w-md mx-auto">
            Add a PDF report or technical monograph to extract passages, tables, and page-level provenance.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#D5CFC2] border-b border-[#D5CFC2]">
          {documents.map((doc, index) => {
            const isSelected = selectedDocIds.includes(doc.id);
            const isSample =
              doc.is_demo || doc.original_name.startsWith('[Demo]');

            return (
              <div
                key={doc.id}
                className="py-6 flex flex-col lg:flex-row lg:items-baseline justify-between gap-6 group"
              >
                <div className="flex items-baseline gap-4 min-w-0">
                  <span className="font-editorial italic text-lg text-[#6E6C63] w-7 shrink-0">
                    0{index + 1}.
                  </span>

                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelectDoc(doc.id)}
                    aria-label={`Include ${doc.original_name} in active reading scope`}
                    className="h-3.5 w-3.5 accent-[#B84B2F] cursor-pointer shrink-0 translate-y-0.5"
                  />

                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onOpenDocumentInWorkspace(doc.id)}
                        className="font-editorial text-xl text-[#1F201C] hover:text-[#B84B2F] text-left transition-colors cursor-pointer"
                      >
                        {cleanDocTitle(doc.original_name)}
                      </button>
                      {isSample && (
                        <span className="font-editorial italic text-xs text-[#6E6C63]">
                          · Reference edition
                        </span>
                      )}
                    </div>

                    {/* Quiet Editorial Colophon Line */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6E6C63]">
                      <span
                        className={
                          doc.status === DocumentStatus.READY
                            ? 'text-[#1E5631] font-medium'
                            : 'text-[#9E2A2B] font-medium'
                        }
                      >
                        {doc.status === DocumentStatus.READY
                          ? 'Indexed & Ready'
                          : doc.status}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{doc.page_count} pages</span>
                      <span aria-hidden="true">·</span>
                      <span>{doc.chunk_count || 0} indexed passages</span>
                      <span aria-hidden="true">·</span>
                      <span>{doc.table_count || 0} tables</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {formatBytes(doc.size_bytes)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className="font-mono-tabular text-[11px]"
                        title={`SHA-256: ${doc.sha256}`}
                      >
                        SHA {doc.sha256.slice(0, 10)}
                      </span>
                    </div>

                    {doc.error_message && (
                      <p className="text-xs text-[#9E2A2B]">
                        {doc.error_message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Quiet Text-Led Actions */}
                <div className="flex items-center gap-4 shrink-0 pl-11 lg:pl-0 text-xs">
                  <button
                    type="button"
                    onClick={() => onOpenDocumentInWorkspace(doc.id)}
                    className="font-medium text-[#1F201C] hover:text-[#B84B2F] inline-flex items-center gap-1 whitespace-nowrap cursor-pointer border-b border-[#242520]/30 hover:border-[#B84B2F] pb-0.5"
                  >
                    <span>Read on Desk</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>

                  <a
                    href={`/api/documents/${encodeURIComponent(doc.id)}/download.pdf`}
                    download
                    className="text-[#4A4942] hover:text-[#1F201C] inline-flex items-center gap-1 whitespace-nowrap"
                    title="Download PDF"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </a>

                  <button
                    type="button"
                    disabled={reprocessingId === doc.id}
                    onClick={() => handleReprocess(doc)}
                    className="text-[#6E6C63] hover:text-[#1F201C] disabled:opacity-40 cursor-pointer"
                    title="Re-run extraction"
                    aria-label={`Reprocess ${doc.original_name}`}
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        reprocessingId === doc.id ? 'animate-spin' : ''
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDeleteDoc(doc)}
                    className="text-[#6E6C63] hover:text-[#9E2A2B] cursor-pointer"
                    title="Remove from catalog"
                    aria-label={`Delete ${doc.original_name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDeleteDoc && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div className="folio-sheet border border-[#D5CFC2] max-w-md w-full p-7 space-y-4">
            <h2
              id="delete-dialog-title"
              className="font-editorial text-2xl text-[#1F201C] font-normal"
            >
              Remove manuscript from catalog?
            </h2>
            <p className="text-xs text-[#4A4942] leading-relaxed">
              This permanently removes{' '}
              <strong className="text-[#1F201C]">
                {cleanDocTitle(confirmDeleteDoc.original_name)}
              </strong>{' '}
              along with its stored PDF binary, extracted passages, tables, and comparison notes.
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#D5CFC2]">
              <button
                type="button"
                onClick={() => setConfirmDeleteDoc(null)}
                className="px-3.5 py-1.5 text-xs text-[#6E6C63] hover:text-[#1F201C]"
              >
                Keep Manuscript
              </button>
              <button
                type="button"
                disabled={deletingId === confirmDeleteDoc.id}
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 text-xs font-medium text-white bg-[#9E2A2B] hover:bg-[#7D2021] rounded-sm transition-colors cursor-pointer"
              >
                {deletingId === confirmDeleteDoc.id
                  ? 'Removing…'
                  : 'Remove Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
