import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  X,
} from 'lucide-react';
import { api, DocumentDetailsResponse, EvidenceFocus } from '../lib/api.ts';
import { ElementType } from '../shared/types.ts';

interface EvidencePanelProps {
  focus: EvidenceFocus | null;
  activeDocumentId: string | null;
  onCloseMobile?: () => void;
  onSelectPage?: (docId: string, pageNumber: number) => void;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
  focus,
  activeDocumentId,
  onCloseMobile,
}) => {
  const targetDocId = focus?.documentId || activeDocumentId;
  const [details, setDetails] = useState<DocumentDetailsResponse | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'page' | 'outline' | 'markdown'>('page');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!targetDocId) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .getDocumentDetails(targetDocId)
      .then((res) => {
        if (!cancelled) {
          setDetails(res);
          if (focus && focus.documentId === targetDocId && focus.pageNumber) {
            setCurrentPage(focus.pageNumber);
          } else {
            setCurrentPage(1);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setDetails(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [targetDocId]);

  useEffect(() => {
    if (focus?.pageNumber) {
      setCurrentPage(focus.pageNumber);
      setViewMode('page');
    }
  }, [focus]);

  const cleanDocTitle = (raw?: string) =>
    (raw || 'Untitled Document')
      .replace(/^\[Demo\]\s*/i, '')
      .replace(/\.pdf$/i, '')
      .replace(/_/g, ' ');

  if (!targetDocId) {
    return (
      <aside
        aria-label="Reading Desk Folio"
        className="h-full flex flex-col bg-[#E6E0D4] border-l border-[#CEC7B8] p-8 justify-between"
      >
        <div className="space-y-3">
          <div className="text-xs tracking-wider text-[#6E6C63]">
            Reading Desk Folio
          </div>
          <h2 className="font-editorial text-2xl italic text-[#1F201C] font-normal">
            No document open on the desk
          </h2>
          <p className="text-sm text-[#4A4942] leading-relaxed">
            Choose a report from the shelf on the left, or click any footnote reference in your notes to open the corresponding page here.
          </p>
        </div>
        <div className="border-t border-[#CEC7B8] pt-4 text-xs font-editorial italic text-[#6E6C63]">
          Every citation opens directly to its source page and paragraph.
        </div>
      </aside>
    );
  }

  const pageCount = Math.max(1, details?.document.page_count || 1);
  const pageElements = (details?.elements || []).filter(
    (el) => el.page_number === currentPage
  );
  const headings = (details?.elements || []).filter(
    (el) => el.type === ElementType.HEADING
  );

  return (
    <aside
      aria-label="Reading Desk Folio"
      className="h-full flex flex-col bg-[#E6E0D4] border-l border-[#CEC7B8] select-text"
    >
      {/* Top Desk Rail */}
      <div className="px-5 py-3.5 border-b border-[#CEC7B8] bg-[#ECE7DC] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-[#6E6C63] truncate">
            Source Folio · {details?.document.page_count || 1} pages
          </div>
          <h2
            className="font-editorial text-base font-medium text-[#1F201C] truncate"
            title={details?.document.original_name}
          >
            {cleanDocTitle(details?.document.original_name)}
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {details?.document && (
            <a
              href={`/api/documents/${encodeURIComponent(details.document.id)}/download.pdf`}
              download
              className="px-2.5 py-1 text-xs text-[#1F201C] hover:text-[#B84B2F] border-b border-transparent hover:border-[#B84B2F] transition-colors inline-flex items-center gap-1 whitespace-nowrap"
              title="Download original PDF file"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Original PDF</span>
            </a>
          )}
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1 text-[#4A4942] hover:text-[#1F201C] lg:hidden"
              aria-label="Close source reader"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Desk Controls: Reader View Switcher & Page Turner */}
      <div className="px-5 py-2.5 border-b border-[#CEC7B8] bg-[#E6E0D4] flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4">
          {(
            [
              ['page', 'Printed Page'],
              ['outline', `Contents (${headings.length})`],
              ['markdown', 'Plain Text'],
            ] as const
          ).map(([modeKey, label]) => (
            <button
              key={modeKey}
              type="button"
              onClick={() => setViewMode(modeKey)}
              className={`pb-0.5 transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === modeKey
                  ? 'text-[#1F201C] font-semibold border-b border-[#B84B2F]'
                  : 'text-[#6E6C63] hover:text-[#1F201C]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {viewMode === 'page' && (
          <div className="flex items-center gap-1.5 text-xs text-[#1F201C]">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1 text-[#4A4942] hover:text-[#1F201C] disabled:opacity-30 cursor-pointer"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-editorial italic text-sm px-1 whitespace-nowrap">
              p. {currentPage} of {pageCount}
            </span>
            <button
              type="button"
              disabled={currentPage >= pageCount}
              onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
              className="p-1 text-[#4A4942] hover:text-[#1F201C] disabled:opacity-30 cursor-pointer"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Pinned Margin Slip when inspecting a specific citation */}
      {focus && focus.documentId === targetDocId && (
        <div className="px-5 py-3 bg-[#EFECE3] border-b border-[#CEC7B8]">
          <div className="flex items-baseline justify-between gap-2 text-[11px] text-[#B84B2F] mb-1">
            <span className="font-semibold">
              Cited Passage · Page {focus.pageNumber}
            </span>
            <span className="font-editorial italic text-[#6E6C63] truncate">
              {focus.sectionPath}
            </span>
          </div>
          <p className="font-editorial italic text-xs text-[#1F201C] leading-relaxed">
            “{focus.quote}”
          </p>
        </div>
      )}

      {/* Desk Surface holding the Physical Paper Sheet */}
      <div className="flex-1 overflow-y-auto p-5 lg:p-6">
        {loading ? (
          <div className="folio-sheet p-8 min-h-[500px] space-y-4">
            <div className="h-4 bg-[#E6E0D4] w-1/3" />
            <div className="h-24 bg-[#EFECE3] w-full" />
            <div className="h-24 bg-[#EFECE3] w-full" />
          </div>
        ) : viewMode === 'outline' ? (
          <div className="folio-sheet p-7 min-h-[480px] space-y-5">
            <div className="border-b border-[#D5CFC2] pb-3">
              <div className="text-[11px] text-[#6E6C63]">Table of Contents</div>
              <h3 className="font-editorial text-xl text-[#1F201C] font-normal mt-0.5">
                {cleanDocTitle(details?.document.original_name)}
              </h3>
            </div>
            {headings.length === 0 ? (
              <p className="text-xs text-[#6E6C63] italic">
                No section headings recorded in this document.
              </p>
            ) : (
              <ol className="space-y-3">
                {headings.map((h, idx) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentPage(h.page_number);
                        setViewMode('page');
                      }}
                      className="w-full text-left flex items-baseline justify-between gap-3 group cursor-pointer"
                    >
                      <span
                        className={`font-editorial text-sm text-[#1F201C] group-hover:text-[#B84B2F] transition-colors ${
                          h.heading_level === 1 ? 'font-medium' : 'pl-4 text-[#4A4942]'
                        }`}
                      >
                        <span className="font-mono-tabular text-[11px] text-[#6E6C63] mr-2">
                          0{idx + 1}
                        </span>
                        {h.content}
                      </span>
                      <span className="font-editorial italic text-xs text-[#6E6C63] shrink-0">
                        p. {h.page_number}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : viewMode === 'markdown' ? (
          <div className="folio-sheet p-6 min-h-[480px]">
            <div className="text-[11px] text-[#6E6C63] mb-3 pb-2 border-b border-[#D5CFC2] flex justify-between">
              <span>Extracted Plain-Text Transcript</span>
              <span className="font-mono-tabular">
                {details?.markdown.length || 0} chars
              </span>
            </div>
            <pre className="text-xs font-mono-tabular text-[#1F201C] whitespace-pre-wrap leading-relaxed overflow-x-auto">
              {details?.markdown || 'No transcript available.'}
            </pre>
          </div>
        ) : (
          /* Tactile Printed Manuscript Sheet */
          <div className="folio-sheet px-7 py-8 min-h-[540px] flex flex-col justify-between border border-[#D5CFC2]">
            <div>
              {/* Running Folio Header */}
              <div className="flex items-baseline justify-between border-b border-[#242520]/20 pb-2.5 mb-6 text-[11px] text-[#6E6C63]">
                <span className="font-editorial italic truncate max-w-[240px]">
                  {cleanDocTitle(details?.document.original_name)}
                </span>
                <span className="font-editorial italic shrink-0">
                  Folio {currentPage}
                </span>
              </div>

              {/* Page Elements with Left Margin Paragraph Markers */}
              {pageElements.length === 0 ? (
                <div className="py-16 text-center font-editorial italic text-sm text-[#6E6C63]">
                  Blank page in manuscript.
                </div>
              ) : (
                <div className="space-y-5">
                  {pageElements.map((el, idx) => {
                    const isHighlighted =
                      focus &&
                      focus.documentId === targetDocId &&
                      focus.pageNumber === currentPage &&
                      ((focus.quote &&
                        el.content
                          .toLowerCase()
                          .includes(focus.quote.toLowerCase().slice(0, 26))) ||
                        (focus.boundingBox &&
                          Math.abs(el.bounding_box.y - focus.boundingBox.y) <= 8));

                    return (
                      <div
                        key={el.id}
                        className={`relative pl-8 transition-colors ${
                          isHighlighted
                            ? 'border-l-2 border-[#B84B2F] bg-[#B84B2F]/[0.06] py-2.5 pr-3 -ml-1'
                            : ''
                        }`}
                      >
                        {/* Quiet Left Margin Paragraph Number */}
                        <span
                          className={`absolute left-0 top-0.5 font-mono-tabular text-[10px] select-none ${
                            isHighlighted
                              ? 'text-[#B84B2F] font-semibold left-1.5 top-3'
                              : 'text-[#6E6C63]/60'
                          }`}
                        >
                          ¶{idx + 1}
                        </span>

                        {el.type === ElementType.HEADING ? (
                          <h3 className="font-editorial text-lg font-medium text-[#1F201C] tracking-tight pt-1">
                            {el.content}
                          </h3>
                        ) : el.type === ElementType.TABLE ? (
                          <div className="my-2 overflow-x-auto border-y border-[#242520]/30 py-2.5 bg-[#F4F1E9]/50 px-3">
                            <div className="font-editorial italic text-xs text-[#4A4942] mb-1.5">
                              Table · {el.section_path}
                            </div>
                            <pre className="text-[11px] font-mono-tabular text-[#1F201C] whitespace-pre leading-relaxed">
                              {el.content}
                            </pre>
                          </div>
                        ) : (
                          <p className="text-[13px] text-[#1F201C] leading-[1.7] font-normal">
                            {el.content}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Colophon Footnote at Bottom of Sheet */}
            <div className="mt-10 pt-3 border-t border-[#D5CFC2] flex items-center justify-between text-[10px] text-[#6E6C63]">
              <span className="font-mono-tabular">
                Checksum {details?.document.sha256.slice(0, 12)}
              </span>
              <span className="font-editorial italic">
                Page {currentPage} of {pageCount}
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
