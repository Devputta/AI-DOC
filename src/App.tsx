import React, { useEffect, useRef, useState } from 'react';
import {
  FileUp,
  PanelRightOpen,
  X,
} from 'lucide-react';
import { CompareView } from './components/CompareView.tsx';
import { EvidencePanel } from './components/EvidencePanel.tsx';
import { LibraryView } from './components/LibraryView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { TablesView } from './components/TablesView.tsx';
import { WorkspaceView } from './components/WorkspaceView.tsx';
import { api, EvidenceFocus } from './lib/api.ts';
import {
  AppSettings,
  DocumentRecord,
  DocumentStatus,
} from './shared/types.ts';

type NavTab = 'workspace' | 'library' | 'tables' | 'compare' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('workspace');
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [evidenceFocus, setEvidenceFocus] = useState<EvidenceFocus | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [mobileEvidenceOpen, setMobileEvidenceOpen] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'info' | 'error' | 'success';
  } | null>(null);

  const quickUploadInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (
    message: string,
    type: 'info' | 'error' | 'success' = 'info'
  ) => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const loadWorkspaceData = async () => {
    const [docs, cfg] = await Promise.all([
      api.listDocuments(),
      api.getSettings(),
    ]);
    setDocuments(docs);
    setSettings(cfg);

    const readyIds = docs
      .filter((d) => d.status === DocumentStatus.READY)
      .map((d) => d.id);

    setSelectedDocIds((prev) => {
      const validPrev = prev.filter((id) => readyIds.includes(id));
      return validPrev.length > 0 ? validPrev : readyIds;
    });

    if (docs.length > 0 && (!activeDocId || !docs.some((d) => d.id === activeDocId))) {
      setActiveDocId(docs[0].id);
    }
  };

  useEffect(() => {
    loadWorkspaceData().catch(() => {});
  }, []);

  const handleToggleSelectDoc = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleInspectEvidence = (focus: EvidenceFocus) => {
    setActiveDocId(focus.documentId);
    setEvidenceFocus(focus);
    setMobileEvidenceOpen(true);
  };

  const handleOpenDocumentInWorkspace = (
    docId: string,
    focus?: EvidenceFocus
  ) => {
    setActiveDocId(docId);
    if (!selectedDocIds.includes(docId)) {
      setSelectedDocIds((prev) => [...prev, docId]);
    }
    if (focus) {
      setEvidenceFocus(focus);
    } else {
      const doc = documents.find((d) => d.id === docId);
      setEvidenceFocus({
        documentId: docId,
        documentName: doc?.original_name || 'Document',
        pageNumber: 1,
        sectionPath: 'Folio Page 1',
        quote: 'Opened manuscript on reading desk.',
      });
    }
    setActiveTab('workspace');
  };

  const handleQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const created = await api.uploadPdfFile(file);
      await loadWorkspaceData();
      setActiveDocId(created.id);
      showToast(
        `Cataloged "${created.original_name}" (${created.page_count} pages).`,
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'PDF upload rejected.',
        'error'
      );
    }
  };

  const handleToggleRemoteAi = async (enabled: boolean) => {
    const updated = await api.updateSettings(enabled);
    setSettings(updated);
  };

  const handleResetWorkspace = async (reseedDemo: boolean) => {
    await api.resetWorkspace(reseedDemo);
    setEvidenceFocus(null);
    await loadWorkspaceData();
  };

  const cleanDocTitle = (raw: string) =>
    raw.replace(/^\[Demo\]\s*/i, '').replace(/\.pdf$/i, '').replace(/_/g, ' ');

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F1E9] text-[#1F201C]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="h-14 px-5 lg:px-8 border-b border-[#242520]/20 bg-[#F4F1E9] flex items-center justify-between gap-4 shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#workspace"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('workspace');
          }}
          className="font-editorial text-2xl font-normal tracking-tight text-[#1F201C] whitespace-nowrap"
        >
          DocuLens
        </a>

        {/* Zone 2: 5 clean text navigation links */}
        <nav
          aria-label="Primary Workspace Navigation"
          className="hidden md:flex items-center gap-7 text-xs text-[#4A4942]"
        >
          {(
            [
              ['workspace', 'Reading Room'],
              ['library', 'Catalog'],
              ['tables', 'Tables'],
              ['compare', 'Collation'],
              ['settings', 'Colophon'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`py-1 transition-colors whitespace-nowrap cursor-pointer border-b ${
                activeTab === key
                  ? 'text-[#1F201C] border-[#B84B2F] font-semibold'
                  : 'border-transparent hover:text-[#1F201C]'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-3 shrink-0">
          <input
            ref={quickUploadInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleQuickUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => setMobileEvidenceOpen((v) => !v)}
            className="px-2.5 py-1.5 text-xs font-medium text-[#1F201C] border border-[#242520]/30 rounded-sm lg:hidden inline-flex items-center gap-1 whitespace-nowrap"
          >
            <PanelRightOpen className="w-3.5 h-3.5" />
            <span>Folio</span>
          </button>
          <button
            type="button"
            onClick={() => quickUploadInputRef.current?.click()}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#1F201C] hover:bg-[#B84B2F] rounded-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>Add a PDF</span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation Strip */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden flex items-center justify-around border-b border-[#D5CFC2] bg-[#ECE7DC] px-2 py-2 text-xs"
      >
        {(
          [
            ['workspace', 'Reading Room'],
            ['library', 'Catalog'],
            ['tables', 'Tables'],
            ['compare', 'Collation'],
            ['settings', 'Colophon'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`px-2 py-0.5 whitespace-nowrap ${
              activeTab === key
                ? 'text-[#B84B2F] font-semibold underline underline-offset-4'
                : 'text-[#4A4942]'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Editorial Status Ribbon */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`px-6 py-2 text-xs border-b flex items-center justify-between gap-3 ${
            toast.type === 'error'
              ? 'bg-[#9E2A2B] text-white border-[#9E2A2B]'
              : toast.type === 'success'
              ? 'bg-[#1E5631] text-white border-[#1E5631]'
              : 'bg-[#1F201C] text-[#F4F1E9] border-[#1F201C]'
          }`}
        >
          <span className="font-editorial italic text-sm">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="opacity-80 hover:opacity-100"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3-Column Research Desk Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Column: Archival Desk Shelf (Desktop) */}
        <aside
          aria-label="Desk Shelf & Active Manuscripts"
          className="hidden lg:flex lg:w-64 xl:w-72 flex-col border-r border-[#D5CFC2] bg-[#ECE7DC]/70 shrink-0 justify-between"
        >
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="flex items-baseline justify-between border-b border-[#242520]/20 pb-2.5">
              <span className="font-editorial italic text-sm text-[#1F201C]">
                On the Desk ({selectedDocIds.length}/{documents.length})
              </span>
              {documents.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedDocIds.length === documents.length) {
                      setSelectedDocIds([]);
                    } else {
                      setSelectedDocIds(documents.map((d) => d.id));
                    }
                  }}
                  className="text-[11px] text-[#B84B2F] hover:underline cursor-pointer"
                >
                  {selectedDocIds.length === documents.length
                    ? 'Clear all'
                    : 'Select all'}
                </button>
              )}
            </div>

            {documents.length === 0 ? (
              <div className="py-6 space-y-3 text-xs text-[#6E6C63]">
                <p className="font-editorial italic text-sm text-[#4A4942]">
                  No manuscripts on the shelf yet.
                </p>
                <p className="leading-relaxed">
                  Use &ldquo;Add a PDF&rdquo; above to place your first document on the reading desk.
                </p>
              </div>
            ) : (
              <ol className="divide-y divide-[#D5CFC2]">
                {documents.map((doc, idx) => {
                  const isChecked = selectedDocIds.includes(doc.id);
                  const isFocusedDoc =
                    (evidenceFocus?.documentId || activeDocId) === doc.id;

                  return (
                    <li key={doc.id} className="py-3.5 first:pt-0">
                      <div className="flex items-baseline gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectDoc(doc.id)}
                          aria-label={`Include ${doc.original_name} in inquiry scope`}
                          className="h-3.5 w-3.5 accent-[#B84B2F] cursor-pointer shrink-0 translate-y-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-1 text-[10px] text-[#6E6C63]">
                            <span className="font-mono-tabular">
                              No. 0{idx + 1}
                            </span>
                            <span className="font-editorial italic">
                              {doc.page_count} pp.
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveDocId(doc.id);
                              setEvidenceFocus({
                                documentId: doc.id,
                                documentName: doc.original_name,
                                pageNumber: 1,
                                sectionPath: 'Folio Page 1',
                                quote: `Inspecting ${cleanDocTitle(doc.original_name)} (${doc.page_count} pages).`,
                              });
                            }}
                            className={`mt-0.5 font-editorial text-[15px] text-left leading-snug block w-full cursor-pointer transition-colors ${
                              isFocusedDoc
                                ? 'text-[#B84B2F] font-medium'
                                : 'text-[#1F201C] hover:text-[#B84B2F]'
                            }`}
                          >
                            {cleanDocTitle(doc.original_name)}
                          </button>

                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#6E6C63]">
                            <span>{doc.chunk_count || 0} passages</span>
                            <span aria-hidden="true">·</span>
                            <span>{doc.table_count || 0} tables</span>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* Quiet Colophon Footer in Left Rail */}
          <div className="px-5 py-3.5 border-t border-[#D5CFC2] text-[11px] text-[#6E6C63] flex items-center justify-between">
            <span className="font-editorial italic">
              {settings?.remote_ai_enabled
                ? 'Mode: Hybrid Remote'
                : 'Mode: Local Desk'}
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="text-[#1F201C] hover:text-[#B84B2F] underline cursor-pointer"
            >
              Configure
            </button>
          </div>
        </aside>

        {/* Center Column: Open Paper Editorial Workspace */}
        <main className="flex-1 overflow-y-auto min-w-0">
          {activeTab === 'workspace' && (
            <WorkspaceView
              documents={documents}
              selectedDocIds={selectedDocIds}
              settings={settings}
              onInspectEvidence={handleInspectEvidence}
              onToggleRemoteAi={handleToggleRemoteAi}
              onTriggerUpload={() => quickUploadInputRef.current?.click()}
              onNavigateToLibrary={() => setActiveTab('library')}
            />
          )}

          {activeTab === 'library' && (
            <LibraryView
              documents={documents}
              selectedDocIds={selectedDocIds}
              onToggleSelectDoc={handleToggleSelectDoc}
              onRefreshDocuments={loadWorkspaceData}
              onOpenDocumentInWorkspace={handleOpenDocumentInWorkspace}
              onNotify={showToast}
            />
          )}

          {activeTab === 'tables' && (
            <TablesView
              documents={documents}
              onInspectEvidence={handleInspectEvidence}
            />
          )}

          {activeTab === 'compare' && (
            <CompareView
              documents={documents}
              onInspectEvidence={handleInspectEvidence}
              onNotify={showToast}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              onToggleRemoteAi={handleToggleRemoteAi}
              onResetWorkspace={handleResetWorkspace}
              onNotify={showToast}
            />
          )}
        </main>

        {/* Right Column: Tactile Printed Folio Reader (Desktop) */}
        <div className="hidden lg:block lg:w-96 xl:w-[440px] shrink-0">
          <EvidencePanel
            focus={evidenceFocus}
            activeDocumentId={activeDocId}
          />
        </div>
      </div>

      {/* Mobile Folio Sheet Drawer */}
      {mobileEvidenceOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Source Folio Sheet"
          className="fixed inset-0 z-50 lg:hidden bg-black/40 flex flex-col justify-end"
        >
          <div className="h-[84vh] w-full bg-[#E6E0D4] border-t border-[#CEC7B8] shadow-xl overflow-hidden flex flex-col">
            <EvidencePanel
              focus={evidenceFocus}
              activeDocumentId={activeDocId}
              onCloseMobile={() => setMobileEvidenceOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
