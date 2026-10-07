import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CornerDownLeft,
  FileUp,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { api, EvidenceFocus } from '../lib/api.ts';
import {
  AppSettings,
  ChatResponse,
  Citation,
  DocumentRecord,
  SearchResult,
} from '../shared/types.ts';

interface WorkspaceViewProps {
  documents: DocumentRecord[];
  selectedDocIds: string[];
  settings: AppSettings | null;
  onInspectEvidence: (focus: EvidenceFocus) => void;
  onToggleRemoteAi: (enabled: boolean) => Promise<void>;
  onTriggerUpload: () => void;
  onNavigateToLibrary: () => void;
}

const GENERAL_PROMPTS = [
  {
    label: 'Primary thesis & conclusions',
    question: 'What are the main findings and conclusions stated in this document?',
  },
  {
    label: 'Key figures & measurements',
    question: 'What specific numbers, percentages, or financial figures are reported?',
  },
  {
    label: 'Methodology & scope',
    question: 'What methodology, scope, or assumptions are described in the text?',
  },
];

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  documents,
  selectedDocIds,
  settings,
  onInspectEvidence,
  onToggleRemoteAi,
  onTriggerUpload,
  onNavigateToLibrary,
}) => {
  const [subTab, setSubTab] = useState<'qa' | 'search'>('qa');

  const [question, setQuestion] = useState('');
  const [synthesisMode, setSynthesisMode] = useState<'local' | 'remote' | 'fake'>(
    'local'
  );
  const [simulateHallucination, setSimulateHallucination] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatResult, setChatResult] = useState<ChatResponse | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleRunQuestion = async (
    qText: string,
    modeOverride?: 'local' | 'remote' | 'fake',
    hallucinateOverride?: boolean
  ) => {
    const activeQ = qText.trim();
    if (!activeQ) return;

    const useMode = modeOverride ?? synthesisMode;
    const useHallucinate = hallucinateOverride ?? simulateHallucination;

    setChatLoading(true);
    try {
      if (useMode === 'remote' && settings && !settings.remote_ai_enabled) {
        await onToggleRemoteAi(true);
      }
      const res = await api.askChat({
        question: activeQ,
        document_ids: selectedDocIds,
        mode: useMode,
        simulate_hallucinated_citation: useHallucinate,
      });
      setChatResult(res);

      if (res.citations.length > 0) {
        const c = res.citations[0];
        onInspectEvidence({
          documentId: c.document_id,
          documentName: c.document_name,
          pageNumber: c.page_number,
          sectionPath: c.section_path,
          quote: c.quote,
          chunkId: c.chunk_id,
          boundingBox: c.bounding_box,
        });
      }
    } finally {
      setChatLoading(false);
    }
  };

  const handleRunSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setHasSearched(true);
    try {
      const res = await api.searchLexical(searchQuery, selectedDocIds);
      setSearchResults(res.results);
      if (res.results.length > 0) {
        const first = res.results[0];
        onInspectEvidence({
          documentId: first.document_id,
          documentName: first.document_name,
          pageNumber: first.page_start,
          sectionPath: first.section_path,
          quote: first.highlighted_excerpt,
          chunkId: first.chunk_id,
          boundingBox: first.bounding_box,
        });
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const handleCitationClick = (c: Citation) => {
    onInspectEvidence({
      documentId: c.document_id,
      documentName: c.document_name,
      pageNumber: c.page_number,
      sectionPath: c.section_path,
      quote: c.quote,
      chunkId: c.chunk_id,
      boundingBox: c.bounding_box,
    });
  };

  const cleanDocTitle = (raw: string) =>
    raw.replace(/\.pdf$/i, '').replace(/_/g, ' ');

  if (documents.length === 0) {
    return (
      <div className="px-6 py-10 lg:px-12 lg:py-14 max-w-4xl">
        <div className="pb-4">
          <h1 className="font-editorial text-3xl lg:text-4xl font-normal text-[#1F201C] tracking-tight">
            Reading Room & Inquiry
          </h1>
          <p className="text-sm text-[#4A4942] mt-1 font-editorial italic">
            A quiet workspace for evidence-grounded reading, table extraction, and document collation
          </p>
        </div>

        <div className="editorial-double-rule mb-12" />

        <div className="py-12 max-w-xl space-y-6">
          <div className="text-xs font-mono-tabular text-[#6E6C63]">
            DESK STATUS · EMPTY FOLIO
          </div>
          <h2 className="font-editorial text-3xl text-[#1F201C] font-normal leading-snug">
            Place your first PDF manuscript on the reading desk to begin.
          </h2>
          <p className="text-sm text-[#4A4942] leading-relaxed">
            Once added, DocuLens parses the pages locally, indexes every section and table with exact page provenance, and lets you ask questions where every claim is backed by a verified footnote.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={onTriggerUpload}
              className="px-5 py-2.5 text-xs font-medium text-white bg-[#B84B2F] hover:bg-[#963920] rounded-sm transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <FileUp className="w-4 h-4" />
              <span>Add a PDF from Device</span>
            </button>

            <button
              type="button"
              onClick={onNavigateToLibrary}
              className="px-4 py-2.5 text-xs font-medium text-[#1F201C] border border-[#242520]/30 hover:border-[#242520] rounded-sm transition-colors cursor-pointer"
            >
              Open Manuscript Catalog
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-5xl">
      {/* Editorial Masthead Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pb-4">
        <div>
          <h1 className="font-editorial text-3xl lg:text-4xl font-normal text-[#1F201C] tracking-tight">
            Reading Room & Inquiry
          </h1>
          <p className="text-sm text-[#4A4942] mt-1 font-editorial italic">
            Working across {selectedDocIds.length || documents.length} selected{' '}
            {(selectedDocIds.length || documents.length) === 1
              ? 'manuscript'
              : 'manuscripts'}{' '}
            on your desk
          </p>
        </div>

        <div className="flex items-center gap-6 text-xs border-b border-[#D5CFC2] sm:border-none pb-2 sm:pb-0">
          <button
            type="button"
            onClick={() => setSubTab('qa')}
            className={`pb-1 transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'qa'
                ? 'text-[#1F201C] font-semibold border-b-2 border-[#B84B2F]'
                : 'text-[#6E6C63] hover:text-[#1F201C]'
            }`}
          >
            01. Cited Inquiry
          </button>
          <button
            type="button"
            onClick={() => setSubTab('search')}
            className={`pb-1 transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'search'
                ? 'text-[#1F201C] font-semibold border-b-2 border-[#B84B2F]'
                : 'text-[#6E6C63] hover:text-[#1F201C]'
            }`}
          >
            02. Concordance & Index Search
          </button>
        </div>
      </div>

      <div className="editorial-double-rule mb-8" />

      {subTab === 'qa' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-10">
          {/* Left Margin Column */}
          <div className="xl:col-span-4 space-y-8 xl:border-r xl:border-[#D5CFC2] xl:pr-7">
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-[#1F201C]">
                Reading Method
              </div>
              <div className="space-y-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setSynthesisMode('local');
                    setSimulateHallucination(false);
                  }}
                  className={`w-full text-left py-1.5 px-2.5 rounded-sm transition-colors flex items-center justify-between cursor-pointer ${
                    synthesisMode === 'local' && !simulateHallucination
                      ? 'bg-[#E6E0D4] text-[#1F201C] font-medium'
                      : 'text-[#4A4942] hover:text-[#1F201C]'
                  }`}
                >
                  <span>Local Extractive (Offline)</span>
                  {synthesisMode === 'local' && !simulateHallucination && (
                    <Check className="w-3.5 h-3.5 text-[#B84B2F]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSynthesisMode('remote');
                    setSimulateHallucination(false);
                  }}
                  className={`w-full text-left py-1.5 px-2.5 rounded-sm transition-colors flex items-center justify-between cursor-pointer ${
                    synthesisMode === 'remote' && !simulateHallucination
                      ? 'bg-[#E6E0D4] text-[#1F201C] font-medium'
                      : 'text-[#4A4942] hover:text-[#1F201C]'
                  }`}
                >
                  <span>Remote AI Synthesis (Opt-in)</span>
                  {synthesisMode === 'remote' && !simulateHallucination && (
                    <Check className="w-3.5 h-3.5 text-[#B84B2F]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSynthesisMode('fake');
                    setSimulateHallucination(true);
                  }}
                  className={`w-full text-left py-1.5 px-2.5 rounded-sm transition-colors flex items-center justify-between cursor-pointer ${
                    simulateHallucination
                      ? 'bg-[#E6E0D4] text-[#1F201C] font-medium'
                      : 'text-[#4A4942] hover:text-[#1F201C]'
                  }`}
                >
                  <span>Audit Citation Filter</span>
                  {simulateHallucination && (
                    <Check className="w-3.5 h-3.5 text-[#B84B2F]" />
                  )}
                </button>
              </div>

              {synthesisMode === 'remote' && (
                <p className="text-[11px] text-[#A35C17] leading-relaxed pt-1 border-t border-[#D5CFC2]">
                  Note: Retrieved passages leave this device for synthesis via Gemini. Full PDFs are never transmitted.
                </p>
              )}

              {simulateHallucination && (
                <p className="text-[11px] text-[#4A4942] leading-relaxed pt-1 border-t border-[#D5CFC2]">
                  Injects an unverified page 999 citation so you can observe the server strip it before rendering.
                </p>
              )}
            </div>

            <div className="space-y-3 border-t border-[#D5CFC2] pt-6">
              <div className="text-xs font-semibold text-[#1F201C]">
                General Lines of Inquiry
              </div>
              <ul className="space-y-2.5">
                {GENERAL_PROMPTS.map((sq, idx) => (
                  <li key={sq.label}>
                    <button
                      type="button"
                      onClick={() => {
                        setQuestion(sq.question);
                        handleRunQuestion(sq.question);
                      }}
                      className="text-left group cursor-pointer block w-full"
                    >
                      <div className="text-[11px] font-mono-tabular text-[#6E6C63]">
                        0{idx + 1} · {sq.label}
                      </div>
                      <div className="font-editorial text-sm text-[#1F201C] group-hover:text-[#B84B2F] leading-snug mt-0.5 transition-colors">
                        “{sq.question}”
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right Main Column */}
          <div className="xl:col-span-8 space-y-8">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRunQuestion(question);
              }}
              className="border-b-2 border-[#242520] pb-4 space-y-3"
            >
              <label
                htmlFor="doculens-question-input"
                className="block text-xs text-[#6E6C63]"
              >
                Question for the selected manuscripts
              </label>
              <textarea
                id="doculens-question-input"
                rows={2}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a specific question grounded in your uploaded PDF…"
                className="w-full font-editorial text-xl lg:text-2xl text-[#1F201C] bg-transparent focus:outline-none resize-none leading-snug"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-editorial italic text-[#6E6C63]">
                  Answers are restricted strictly to passages found in the active scope.
                </span>
                <button
                  type="submit"
                  disabled={chatLoading || !question.trim()}
                  className="px-4 py-2 text-xs font-medium text-white bg-[#B84B2F] hover:bg-[#963920] disabled:opacity-50 rounded-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <span>
                    {chatLoading ? 'Consulting folio…' : 'Consult Sources'}
                  </span>
                  <CornerDownLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

            {!chatResult ? (
              <div className="py-8 text-sm font-editorial italic text-[#6E6C63]">
                Enter a question above to retrieve passages and generate a footnote-verified note.
              </div>
            ) : (
              <article className="space-y-8">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6E6C63] border-b border-[#D5CFC2] pb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[#1F201C] font-medium">
                      {chatResult.mode_used === 'remote_gemini'
                        ? 'Synthesized Note (Remote AI)'
                        : chatResult.mode_used === 'fake_provider'
                        ? 'Audit Note (Citation Filter Test)'
                        : 'Extractive Note (Local Desk)'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {chatResult.citations.length}{' '}
                      {chatResult.citations.length === 1
                        ? 'verified footnote'
                        : 'verified footnotes'}
                    </span>
                    {chatResult.rejected_citation_count > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#9E2A2B] font-medium inline-flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Stripped {chatResult.rejected_citation_count} unverified{' '}
                          {chatResult.rejected_citation_count === 1
                            ? 'reference'
                            : 'references'}
                        </span>
                      </>
                    )}
                  </div>

                  {chatResult.insufficient_evidence && (
                    <span className="text-[#A35C17] font-medium inline-flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      No supporting passage found
                    </span>
                  )}
                </div>

                {chatResult.notice && (
                  <p className="text-xs font-editorial italic text-[#4A4942] border-l-2 border-[#D5CFC2] pl-3">
                    {chatResult.notice}
                  </p>
                )}

                <div className="space-y-4">
                  {chatResult.answer.split('\n\n').map((para, idx) => (
                    <p
                      key={idx}
                      className={`text-[15px] text-[#1F201C] leading-[1.75] max-w-[68ch] ${
                        idx === 0 && !chatResult.insufficient_evidence
                          ? 'first-letter:font-editorial first-letter:text-4xl first-letter:float-left first-letter:mr-2.5 first-letter:leading-none first-letter:text-[#B84B2F]'
                          : ''
                      }`}
                    >
                      {para}
                    </p>
                  ))}
                </div>

                {chatResult.citations.length > 0 && (
                  <div className="pt-6 border-t border-[#242520]/25 space-y-4">
                    <h2 className="font-editorial italic text-base text-[#4A4942] font-normal">
                      Footnotes & Verified Passages
                    </h2>

                    <ol className="divide-y divide-[#D5CFC2]">
                      {chatResult.citations.map((cit) => (
                        <li
                          key={cit.chunk_id}
                          className="py-3.5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 group"
                        >
                          <div className="space-y-1 max-w-xl">
                            <div className="text-xs text-[#4A4942] flex flex-wrap items-baseline gap-1.5">
                              <span className="font-mono-tabular font-semibold text-[#B84B2F]">
                                [{cit.citation_index}]
                              </span>
                              <span className="font-medium text-[#1F201C]">
                                {cleanDocTitle(cit.document_name)}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-editorial italic">
                                {cit.section_path}, p. {cit.page_number}
                              </span>
                            </div>
                            <p className="font-editorial italic text-sm text-[#1F201C] leading-relaxed pl-5">
                              “{cit.quote}”
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleCitationClick(cit)}
                            className="pl-5 sm:pl-0 text-xs font-medium text-[#B84B2F] hover:text-[#963920] inline-flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer border-b border-transparent hover:border-[#B84B2F] pb-0.5"
                          >
                            <span>Open source · page {cit.page_number}</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </article>
            )}
          </div>
        </div>
      ) : (
        /* Concordance & Lexical Search View */
        <div className="space-y-8 max-w-3xl">
          <form
            onSubmit={handleRunSearch}
            className="flex items-center gap-3 border-b-2 border-[#242520] pb-2"
          >
            <Search className="w-4 h-4 text-[#6E6C63] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter keywords, phrases, or figures to search across manuscripts…"
              className="flex-1 font-editorial text-xl text-[#1F201C] bg-transparent focus:outline-none"
            />
            <button
              type="submit"
              disabled={searchLoading || !searchQuery.trim()}
              className="px-4 py-1.5 text-xs font-medium text-white bg-[#1F201C] hover:bg-[#B84B2F] disabled:opacity-40 rounded-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              {searchLoading ? 'Searching…' : 'Find Passages'}
            </button>
          </form>

          {!hasSearched ? (
            <p className="font-editorial italic text-sm text-[#6E6C63] py-6">
              Enter a search term above to locate matching paragraphs and section headings.
            </p>
          ) : searchResults.length === 0 ? (
            <p className="font-editorial italic text-base text-[#6E6C63] py-8">
              No matching passages found for “{searchQuery}”.
            </p>
          ) : (
            <div className="divide-y divide-[#D5CFC2]">
              {searchResults.map((sr, i) => (
                <div key={sr.chunk_id} className="py-5 space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-baseline gap-2 text-xs text-[#6E6C63]">
                      <span className="font-mono-tabular text-[#B84B2F] font-semibold">
                        0{i + 1}
                      </span>
                      <span className="font-medium text-[#1F201C]">
                        {cleanDocTitle(sr.document_name)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-editorial italic">
                        {sr.section_path} (p. {sr.page_start})
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onInspectEvidence({
                          documentId: sr.document_id,
                          documentName: sr.document_name,
                          pageNumber: sr.page_start,
                          sectionPath: sr.section_path,
                          quote: sr.highlighted_excerpt,
                          chunkId: sr.chunk_id,
                          boundingBox: sr.bounding_box,
                        })
                      }
                      className="text-xs font-medium text-[#B84B2F] hover:underline inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <span>Open source · page {sr.page_start}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-sm text-[#1F201C] leading-relaxed max-w-[68ch]">
                    {sr.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
