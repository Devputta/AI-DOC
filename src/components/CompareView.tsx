import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  HelpCircle,
  Minus,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { api, EvidenceFocus } from '../lib/api.ts';
import {
  ComparisonChange,
  ComparisonChangeType,
  ComparisonRecord,
  DocumentRecord,
  DocumentStatus,
} from '../shared/types.ts';

interface CompareViewProps {
  documents: DocumentRecord[];
  onInspectEvidence: (focus: EvidenceFocus) => void;
  onNotify: (message: string, type?: 'info' | 'error' | 'success') => void;
}

export const CompareView: React.FC<CompareViewProps> = ({
  documents,
  onInspectEvidence,
  onNotify,
}) => {
  const readyDocs = documents.filter((d) => d.status === DocumentStatus.READY);

  const [leftId, setLeftId] = useState<string>('');
  const [rightId, setRightId] = useState<string>('');
  const [activeComparison, setActiveComparison] =
    useState<ComparisonRecord | null>(null);
  const [filterType, setFilterType] = useState<'all' | ComparisonChangeType>(
    'all'
  );
  const [running, setRunning] = useState<boolean>(false);

  useEffect(() => {
    if (readyDocs.length >= 2 && (!leftId || !rightId)) {
      const q3 = readyDocs.find((d) => d.id.includes('q3')) || readyDocs[0];
      const q4 =
        readyDocs.find((d) => d.id.includes('q4') && d.id !== q3.id) ||
        readyDocs.find((d) => d.id !== q3.id) ||
        readyDocs[1];
      setLeftId(q3.id);
      setRightId(q4.id);
    }
  }, [readyDocs.length]);

  useEffect(() => {
    api
      .listComparisons()
      .then((list) => {
        if (list.length > 0) {
          setActiveComparison(list[0]);
          setLeftId(list[0].left_document_id);
          setRightId(list[0].right_document_id);
        }
      })
      .catch(() => {});
  }, []);

  const handleRunComparison = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!leftId || !rightId) {
      onNotify('Comparison needs two ready documents.', 'error');
      return;
    }
    setRunning(true);
    try {
      const cmp = await api.createComparison(leftId, rightId);
      setActiveComparison(cmp);
      setFilterType('all');
    } catch (err) {
      onNotify(
        err instanceof Error
          ? err.message
          : 'Comparison needs two ready documents.',
        'error'
      );
    } finally {
      setRunning(false);
    }
  };

  const cleanDocTitle = (raw: string) =>
    raw.replace(/^\[Demo\]\s*/i, '').replace(/\.pdf$/i, '').replace(/_/g, ' ');

  if (readyDocs.length < 2) {
    return (
      <div className="px-6 py-12 lg:px-10 max-w-4xl">
        <div className="py-12 border-y border-[#D5CFC2] text-center space-y-2">
          <div className="font-editorial text-2xl italic text-[#1F201C]">
            Comparison needs two ready documents
          </div>
          <p className="text-xs text-[#6E6C63] max-w-md mx-auto">
            Currently {readyDocs.length}{' '}
            {readyDocs.length === 1 ? 'manuscript is' : 'manuscripts are'} ready on the desk. Add a second PDF in the Catalog to collate revisions side by side.
          </p>
        </div>
      </div>
    );
  }

  const filteredChanges = (activeComparison?.changes || []).filter((c) =>
    filterType === 'all' ? true : c.type === filterType
  );

  const renderChangeLabel = (change: ComparisonChange) => {
    switch (change.type) {
      case ComparisonChangeType.CHANGED:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#A35C17]">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Revised Passage</span>
          </span>
        );
      case ComparisonChangeType.ADDED:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E5631]">
            <Plus className="w-3.5 h-3.5" />
            <span>Addition in Right Edition</span>
          </span>
        );
      case ComparisonChangeType.REMOVED:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#9E2A2B]">
            <Minus className="w-3.5 h-3.5" />
            <span>Omitted from Right Edition</span>
          </span>
        );
      case ComparisonChangeType.UNCERTAIN:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#525B66]">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Uncertain Alignment (Inspect Both)</span>
          </span>
        );
    }
  };

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-5xl space-y-8">
      {/* Masthead */}
      <div>
        <div className="pb-4">
          <h1 className="font-editorial text-3xl lg:text-4xl font-normal text-[#1F201C] tracking-tight">
            Side-by-Side Collation
          </h1>
          <p className="text-sm text-[#4A4942] mt-1 font-editorial italic">
            Aligning sections, quantitative shifts, and structural additions across two editions
          </p>
        </div>
        <div className="editorial-double-rule" />
      </div>

      {/* Edition Selector Strip */}
      <form
        onSubmit={handleRunComparison}
        className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end pb-6 border-b border-[#D5CFC2]"
      >
        <div className="md:col-span-5">
          <label
            htmlFor="cmp-left-doc"
            className="block text-xs text-[#6E6C63] mb-1.5"
          >
            Earlier / Baseline Edition (Left Column)
          </label>
          <select
            id="cmp-left-doc"
            value={leftId}
            onChange={(e) => setLeftId(e.target.value)}
            className="w-full py-2 px-2.5 text-xs bg-[#FCFBF7] border border-[#242520]/30 text-[#1F201C] focus:outline-none focus:border-[#B84B2F]"
          >
            {readyDocs.map((d) => (
              <option key={d.id} value={d.id}>
                {cleanDocTitle(d.original_name)} ({d.page_count}p)
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-5">
          <label
            htmlFor="cmp-right-doc"
            className="block text-xs text-[#6E6C63] mb-1.5"
          >
            Later / Revised Edition (Right Column)
          </label>
          <select
            id="cmp-right-doc"
            value={rightId}
            onChange={(e) => setRightId(e.target.value)}
            className="w-full py-2 px-2.5 text-xs bg-[#FCFBF7] border border-[#242520]/30 text-[#1F201C] focus:outline-none focus:border-[#B84B2F]"
          >
            {readyDocs.map((d) => (
              <option key={d.id} value={d.id}>
                {cleanDocTitle(d.original_name)} ({d.page_count}p)
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={running}
            className="w-full py-2 px-4 text-xs font-medium text-white bg-[#B84B2F] hover:bg-[#963920] disabled:opacity-50 rounded-sm transition-colors whitespace-nowrap cursor-pointer"
          >
            {running ? 'Collating…' : 'Collate Editions'}
          </button>
        </div>
      </form>

      {/* Collation Summary & Filter */}
      {activeComparison && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[#D5CFC2] pb-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#6E6C63]">
              <span className="font-semibold text-[#1F201C]">
                {activeComparison.changes.length} collated variations
              </span>
              <span aria-hidden="true">·</span>
              <span>{activeComparison.summary_counts.changed} revised</span>
              <span aria-hidden="true">·</span>
              <span>{activeComparison.summary_counts.added} added</span>
              <span aria-hidden="true">·</span>
              <span>{activeComparison.summary_counts.removed} omitted</span>
              <span aria-hidden="true">·</span>
              <span>{activeComparison.summary_counts.uncertain} uncertain</span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              {(
                [
                  ['all', 'All Variations'],
                  [ComparisonChangeType.CHANGED, 'Revised'],
                  [ComparisonChangeType.ADDED, 'Added'],
                  [ComparisonChangeType.REMOVED, 'Omitted'],
                  [ComparisonChangeType.UNCERTAIN, 'Uncertain'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterType(key)}
                  className={`pb-0.5 transition-colors whitespace-nowrap cursor-pointer ${
                    filterType === key
                      ? 'text-[#1F201C] font-semibold border-b border-[#B84B2F]'
                      : 'text-[#6E6C63] hover:text-[#1F201C]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredChanges.length === 0 ? (
            <p className="font-editorial italic text-base text-[#6E6C63] py-8">
              {activeComparison.changes.length === 0
                ? 'Both manuscripts are identical across all compared sections.'
                : 'No variations match the selected filter.'}
            </p>
          ) : (
            <div className="divide-y divide-[#242520]/20">
              {filteredChanges.map((chg, idx) => (
                <div key={chg.id} className="py-7 space-y-4">
                  {/* Variation Heading */}
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-2.5">
                      <span className="font-mono-tabular text-xs text-[#6E6C63]">
                        0{idx + 1}.
                      </span>
                      {renderChangeLabel(chg)}
                      <span className="text-xs text-[#6E6C63]" aria-hidden="true">
                        ·
                      </span>
                      <h3 className="font-editorial text-lg text-[#1F201C] font-medium">
                        {chg.section_title}
                      </h3>
                    </div>

                    <span className="text-xs font-editorial italic text-[#6E6C63]">
                      Alignment similarity {Math.round(chg.confidence * 100)}%
                    </span>
                  </div>

                  {/* Editorial Summary & Quantitative Shifts */}
                  <div className="pl-6 space-y-2">
                    <p className="text-xs text-[#4A4942] leading-relaxed">
                      {chg.summary}
                    </p>

                    {chg.numeric_deltas.length > 0 && (
                      <div className="flex flex-wrap items-center gap-4 pt-1 text-xs font-mono-tabular">
                        <span className="font-editorial italic text-[#6E6C63] font-sans">
                          Quantitative shifts:
                        </span>
                        {chg.numeric_deltas.map((nd, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1.5 text-[#1F201C] border-b border-[#D5CFC2] pb-0.5"
                          >
                            <span className="text-[#9E2A2B] line-through">
                              {nd.left_value}
                            </span>
                            <ArrowRight className="w-3 h-3 text-[#6E6C63]" />
                            <span className="text-[#1E5631] font-semibold">
                              {nd.right_value}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Parallel Side-by-Side Passages */}
                  <div className="pl-6 grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    {/* Left Passage */}
                    <div className="border-l-2 border-[#D5CFC2] pl-4 flex flex-col justify-between space-y-3">
                      <div className="space-y-1.5">
                        <div className="text-[11px] text-[#6E6C63] flex items-baseline justify-between">
                          <span className="font-medium text-[#4A4942] truncate">
                            {cleanDocTitle(chg.left_evidence.document_name)}
                          </span>
                          {chg.left_evidence.page_number && (
                            <span className="font-editorial italic shrink-0">
                              p. {chg.left_evidence.page_number}
                            </span>
                          )}
                        </div>
                        {chg.left_evidence.excerpt ? (
                          <p className="text-xs text-[#1F201C] leading-[1.7]">
                            {chg.left_evidence.excerpt}
                          </p>
                        ) : (
                          <p className="font-editorial italic text-xs text-[#6E6C63]">
                            Absent in baseline edition.
                          </p>
                        )}
                      </div>

                      {chg.left_evidence.page_number &&
                        chg.left_evidence.excerpt && (
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                onInspectEvidence({
                                  documentId: chg.left_evidence.document_id,
                                  documentName: chg.left_evidence.document_name,
                                  pageNumber: chg.left_evidence.page_number!,
                                  sectionPath:
                                    chg.left_evidence.section_path ||
                                    chg.section_title,
                                  quote: chg.left_evidence.excerpt!,
                                  chunkId:
                                    chg.left_evidence.chunk_id || undefined,
                                  boundingBox: chg.left_evidence.bounding_box,
                                })
                              }
                              className="text-xs font-medium text-[#B84B2F] hover:underline inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>
                                Open source · page {chg.left_evidence.page_number}
                              </span>
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                    </div>

                    {/* Right Passage */}
                    <div className="border-l-2 border-[#B84B2F]/60 pl-4 flex flex-col justify-between space-y-3">
                      <div className="space-y-1.5">
                        <div className="text-[11px] text-[#6E6C63] flex items-baseline justify-between">
                          <span className="font-medium text-[#1F201C] truncate">
                            {cleanDocTitle(chg.right_evidence.document_name)}
                          </span>
                          {chg.right_evidence.page_number && (
                            <span className="font-editorial italic shrink-0">
                              p. {chg.right_evidence.page_number}
                            </span>
                          )}
                        </div>
                        {chg.right_evidence.excerpt ? (
                          <p className="text-xs text-[#1F201C] leading-[1.7]">
                            {chg.right_evidence.excerpt}
                          </p>
                        ) : (
                          <p className="font-editorial italic text-xs text-[#6E6C63]">
                            Omitted in revised edition.
                          </p>
                        )}
                      </div>

                      {chg.right_evidence.page_number &&
                        chg.right_evidence.excerpt && (
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                onInspectEvidence({
                                  documentId: chg.right_evidence.document_id,
                                  documentName:
                                    chg.right_evidence.document_name,
                                  pageNumber: chg.right_evidence.page_number!,
                                  sectionPath:
                                    chg.right_evidence.section_path ||
                                    chg.section_title,
                                  quote: chg.right_evidence.excerpt!,
                                  chunkId:
                                    chg.right_evidence.chunk_id || undefined,
                                  boundingBox: chg.right_evidence.bounding_box,
                                })
                              }
                              className="text-xs font-medium text-[#B84B2F] hover:underline inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>
                                Open source · page{' '}
                                {chg.right_evidence.page_number}
                              </span>
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
