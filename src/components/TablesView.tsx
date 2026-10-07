import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Download,
} from 'lucide-react';
import { api, EvidenceFocus } from '../lib/api.ts';
import { DocumentRecord, TableRecord } from '../shared/types.ts';

interface TablesViewProps {
  documents: DocumentRecord[];
  onInspectEvidence: (focus: EvidenceFocus) => void;
}

export const TablesView: React.FC<TablesViewProps> = ({
  documents,
  onInspectEvidence,
}) => {
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [filterDocId, setFilterDocId] = useState<string>('all');
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<{
    csvText: string;
    mitigatedCount: number;
    filename: string;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    setLoading(true);
    api
      .listTables(filterDocId === 'all' ? undefined : filterDocId)
      .then((list) => {
        setTables(list);
        if (list.length > 0) {
          setActiveTableId(list[0].id);
        } else {
          setActiveTableId(null);
        }
      })
      .finally(() => setLoading(false));
  }, [filterDocId, documents.length]);

  const activeTable = tables.find((t) => t.id === activeTableId) || tables[0];

  useEffect(() => {
    if (!activeTable) {
      setCsvPreview(null);
      return;
    }
    api
      .fetchTableCsvText(activeTable.id)
      .then((res) => setCsvPreview(res))
      .catch(() => setCsvPreview(null));
  }, [activeTable?.id]);

  const cleanDocTitle = (raw: string) =>
    raw.replace(/^\[Demo\]\s*/i, '').replace(/\.pdf$/i, '').replace(/_/g, ' ');

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-5xl space-y-8">
      {/* Masthead */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pb-4">
          <div>
            <h1 className="font-editorial text-3xl lg:text-4xl font-normal text-[#1F201C] tracking-tight">
              Tables & Figures Ledger
            </h1>
            <p className="text-sm text-[#4A4942] mt-1 font-editorial italic">
              Normalized tabular schedules with source page provenance and formula-safe CSV export
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <label
              htmlFor="table-doc-filter"
              className="text-[#6E6C63] whitespace-nowrap"
            >
              Manuscript:
            </label>
            <select
              id="table-doc-filter"
              value={filterDocId}
              onChange={(e) => setFilterDocId(e.target.value)}
              className="px-2.5 py-1.5 bg-transparent border-b border-[#242520] text-[#1F201C] focus:outline-none focus:border-[#B84B2F]"
            >
              <option value="all">All Cataloged Manuscripts ({documents.length})</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {cleanDocTitle(d.original_name)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="editorial-double-rule" />
      </div>

      {loading ? (
        <p className="font-editorial italic text-base text-[#6E6C63] py-8">
          Inspecting tables…
        </p>
      ) : tables.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <div className="font-editorial text-2xl italic text-[#1F201C]">
            No tables recorded in the selected scope
          </div>
          <p className="text-xs text-[#6E6C63]">
            Select another manuscript above or upload a PDF containing structured schedules.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
          {/* Left Index of Tables */}
          <div className="lg:col-span-4 lg:border-r lg:border-[#D5CFC2] lg:pr-6 space-y-4">
            <div className="text-xs font-semibold text-[#1F201C]">
              Index of Schedules ({tables.length})
            </div>

            <div className="divide-y divide-[#D5CFC2]">
              {tables.map((tbl, idx) => {
                const isSelected = activeTable?.id === tbl.id;
                return (
                  <button
                    key={tbl.id}
                    type="button"
                    onClick={() => {
                      setActiveTableId(tbl.id);
                      onInspectEvidence({
                        documentId: tbl.document_id,
                        documentName: tbl.document_name,
                        pageNumber: tbl.page_number,
                        sectionPath: tbl.title,
                        quote: tbl.columns.join(' | '),
                        boundingBox: tbl.bounding_box,
                      });
                    }}
                    className={`w-full text-left py-3.5 transition-colors cursor-pointer block ${
                      isSelected ? 'text-[#1F201C]' : 'text-[#4A4942] hover:text-[#1F201C]'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2 text-[11px] text-[#6E6C63]">
                      <span className="font-mono-tabular">
                        Schedule 0{idx + 1}
                      </span>
                      <span className="font-editorial italic">
                        p. {tbl.page_number}
                      </span>
                    </div>
                    <div
                      className={`font-editorial text-base leading-snug mt-0.5 ${
                        isSelected
                          ? 'text-[#B84B2F] font-medium'
                          : 'text-[#1F201C]'
                      }`}
                    >
                      {tbl.title}
                    </div>
                    <div className="text-[11px] text-[#6E6C63] mt-1 truncate">
                      {cleanDocTitle(tbl.document_name)} · {tbl.rows.length} rows
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Book-Grade Financial/Scientific Table Sheet */}
          {activeTable && (
            <div className="lg:col-span-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 border-b border-[#242520] pb-3">
                <div>
                  <div className="text-xs text-[#6E6C63] font-editorial italic">
                    {cleanDocTitle(activeTable.document_name)} · Folio Page{' '}
                    {activeTable.page_number}
                  </div>
                  <h2 className="font-editorial text-2xl text-[#1F201C] font-normal mt-0.5">
                    {activeTable.title}
                  </h2>
                </div>

                <div className="flex items-center gap-4 shrink-0 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      onInspectEvidence({
                        documentId: activeTable.document_id,
                        documentName: activeTable.document_name,
                        pageNumber: activeTable.page_number,
                        sectionPath: activeTable.title,
                        quote: activeTable.columns.join(' | '),
                        boundingBox: activeTable.bounding_box,
                      })
                    }
                    className="font-medium text-[#B84B2F] hover:underline inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    <span>Open source · page {activeTable.page_number}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>

                  <a
                    href={`/api/tables/${encodeURIComponent(activeTable.id)}/export.csv`}
                    download
                    className="px-3.5 py-1.5 font-medium text-white bg-[#1F201C] hover:bg-[#B84B2F] rounded-sm transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </a>
                </div>
              </div>

              {/* Classic Book-Ruled Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs border-t-2 border-b-2 border-[#242520]">
                  <thead>
                    <tr className="border-b border-[#242520]">
                      {activeTable.columns.map((col, idx) => (
                        <th
                          key={idx}
                          scope="col"
                          className={`py-2.5 px-3 font-semibold text-[#1F201C] whitespace-nowrap ${
                            idx > 0 ? 'text-right' : 'text-left'
                          }`}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D5CFC2] font-mono-tabular">
                    {activeTable.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="hover:bg-[#E6E0D4]/40 transition-colors"
                      >
                        {row.map((cell, cIdx) => {
                          const isFormulaRisk = /^[=+\-@]/.test(
                            String(cell).trim()
                          );
                          return (
                            <td
                              key={cIdx}
                              className={`py-3 px-3 text-[#1F201C] ${
                                cIdx === 0
                                  ? 'font-sans font-medium text-left'
                                  : 'text-right'
                              }`}
                            >
                              <span>{cell}</span>
                              {isFormulaRisk && (
                                <span
                                  className="ml-1.5 text-[10px] text-[#A35C17] font-editorial italic"
                                  title="Prefixed with single quote in CSV export"
                                >
                                  (escaped)
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Extraction Footnotes */}
              {activeTable.warnings.length > 0 && (
                <div className="border-l-2 border-[#A35C17] pl-3.5 py-1 space-y-1">
                  {activeTable.warnings.map((w, idx) => (
                    <p
                      key={idx}
                      className="text-xs font-editorial italic text-[#4A4942] flex items-center gap-1.5"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-[#A35C17] shrink-0" />
                      <span>Note: {w}</span>
                    </p>
                  ))}
                </div>
              )}

              {/* Sanitized RFC 4180 CSV Transcript */}
              {csvPreview && (
                <div className="pt-4 border-t border-[#D5CFC2] space-y-2">
                  <div className="flex items-baseline justify-between text-xs text-[#6E6C63]">
                    <span className="font-editorial italic">
                      RFC 4180 CSV Transcript ({csvPreview.filename})
                    </span>
                    {csvPreview.mitigatedCount > 0 && (
                      <span className="text-[#1E5631] font-mono-tabular text-[11px]">
                        {csvPreview.mitigatedCount} formula-prefixed{' '}
                        {csvPreview.mitigatedCount === 1 ? 'cell' : 'cells'}{' '}
                        neutralized with leading &apos;
                      </span>
                    )}
                  </div>
                  <pre className="p-4 bg-[#FCFBF7] border border-[#D5CFC2] text-xs font-mono-tabular text-[#1F201C] overflow-x-auto leading-relaxed">
                    {csvPreview.csvText}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
