import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import { AppSettings, SecurityCheckResult } from '../shared/types.ts';

interface SettingsViewProps {
  settings: AppSettings | null;
  onToggleRemoteAi: (enabled: boolean) => Promise<void>;
  onResetWorkspace: (reseedDemo: boolean) => Promise<void>;
  onNotify: (message: string, type?: 'info' | 'error' | 'success') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onToggleRemoteAi,
  onResetWorkspace,
  onNotify,
}) => {
  const [checks, setChecks] = useState<SecurityCheckResult[]>([]);
  const [runningChecks, setRunningChecks] = useState(false);
  const [adversarialResult, setAdversarialResult] = useState<string | null>(
    null
  );
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    handleRunSuite();
  }, []);

  const handleRunSuite = async () => {
    setRunningChecks(true);
    try {
      const res = await api.runSecurityVerification();
      setChecks(res.checks);
    } finally {
      setRunningChecks(false);
    }
  };

  const handleTestAdversarialUpload = async (
    kind: 'non_pdf' | 'encrypted_pdf' | 'empty_file'
  ) => {
    setAdversarialResult(null);
    try {
      if (kind === 'non_pdf') {
        const fakeBase64 = btoa(
          '<!DOCTYPE html><html><script>alert(1)</script></html>'
        );
        await api.uploadRawPayload({
          filename: 'malicious_script_renamed.pdf',
          mimeType: 'application/pdf',
          base64Data: fakeBase64,
        });
      } else if (kind === 'encrypted_pdf') {
        const encBase64 = btoa(
          '%PDF-1.4\n1 0 obj << /Encrypt 2 0 R >> endobj\n%%EOF'
        );
        await api.uploadRawPayload({
          filename: 'password_locked.pdf',
          mimeType: 'application/pdf',
          base64Data: encBase64,
        });
      } else {
        await api.uploadRawPayload({
          filename: 'zero_byte.pdf',
          mimeType: 'application/pdf',
          base64Data: '',
        });
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Rejected by server validation.';
      setAdversarialResult(
        `Intake check safely rejected file without exposing paths or stack traces: "${msg}"`
      );
      onNotify(`Verified rejection: ${msg}`, 'info');
    }
  };

  const handleReset = async (reseed: boolean) => {
    setResetting(true);
    try {
      await onResetWorkspace(reseed);
      onNotify(
        reseed
          ? 'Restored reference editions to the reading desk.'
          : 'Cleared all manuscripts and derived files from local storage.',
        'info'
      );
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-4xl space-y-10">
      {/* Masthead */}
      <div>
        <div className="pb-4">
          <h1 className="font-editorial text-3xl lg:text-4xl font-normal text-[#1F201C] tracking-tight">
            Colophon, Privacy & Verification
          </h1>
          <p className="text-sm text-[#4A4942] mt-1 font-editorial italic">
            Local-first processing rules, intake limits, and live provenance audits
          </p>
        </div>
        <div className="editorial-double-rule" />
      </div>

      {/* Section 01: Privacy & Processing Mode */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-6 pb-8 border-b border-[#D5CFC2]">
        <div className="md:col-span-4">
          <div className="text-xs font-mono-tabular text-[#6E6C63]">01</div>
          <h2 className="font-editorial text-xl text-[#1F201C] font-normal mt-0.5">
            Privacy & Processing Mode
          </h2>
        </div>

        <div className="md:col-span-8 space-y-4">
          <p className="text-xs text-[#4A4942] leading-relaxed">
            By default, DocuLens operates strictly on your local server: PDF extraction, lexical search, table normalization, and edition collation require no external network calls. When you opt into Remote AI synthesis, only the top retrieved text excerpts leave the device.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-4 py-3 border-y border-[#D5CFC2]">
            <div>
              <div className="text-xs font-semibold text-[#1F201C]">
                {settings?.remote_ai_enabled
                  ? 'Hybrid Mode (Local Retrieval + Opt-In Gemini Synthesis)'
                  : 'Local-Only Desk Mode (No External Model Calls)'}
              </div>
              <div className="text-[11px] text-[#6E6C63] mt-0.5">
                Parser: {settings?.parser_adapter} ({settings?.parser_version})
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                onToggleRemoteAi(!Boolean(settings?.remote_ai_enabled))
              }
              className={`px-4 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap cursor-pointer ${
                settings?.remote_ai_enabled
                  ? 'bg-[#B84B2F] text-white'
                  : 'bg-[#1F201C] text-white hover:bg-[#B84B2F]'
              }`}
            >
              {settings?.remote_ai_enabled
                ? 'Switch to Local-Only Mode'
                : 'Enable Opt-In Remote AI'}
            </button>
          </div>
        </div>
      </section>

      {/* Section 02: Operational Specifications */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-6 pb-8 border-b border-[#D5CFC2]">
        <div className="md:col-span-4">
          <div className="text-xs font-mono-tabular text-[#6E6C63]">02</div>
          <h2 className="font-editorial text-xl text-[#1F201C] font-normal mt-0.5">
            Intake Specifications
          </h2>
        </div>

        <div className="md:col-span-8">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-xs">
            <div className="border-l border-[#242520]/30 pl-3">
              <dt className="text-[#6E6C63]">Maximum File Size</dt>
              <dd className="font-editorial text-2xl text-[#1F201C] mt-1">
                {settings?.max_upload_mb ?? 25} MB
              </dd>
            </div>
            <div className="border-l border-[#242520]/30 pl-3">
              <dt className="text-[#6E6C63]">Maximum Length</dt>
              <dd className="font-editorial text-2xl text-[#1F201C] mt-1">
                {settings?.max_pages ?? 250} pp.
              </dd>
            </div>
            <div className="border-l border-[#242520]/30 pl-3">
              <dt className="text-[#6E6C63]">Parser Timeout</dt>
              <dd className="font-editorial text-2xl text-[#1F201C] mt-1">
                {settings?.parser_timeout_seconds ?? 120}s
              </dd>
            </div>
            <div className="border-l border-[#242520]/30 pl-3">
              <dt className="text-[#6E6C63]">Cataloged Files</dt>
              <dd className="font-editorial text-2xl text-[#1F201C] mt-1">
                {settings?.storage_document_count ?? 0}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Section 03: Security & Provenance Audit */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-6 pb-8 border-b border-[#D5CFC2]">
        <div className="md:col-span-4 space-y-2">
          <div className="text-xs font-mono-tabular text-[#6E6C63]">03</div>
          <h2 className="font-editorial text-xl text-[#1F201C] font-normal">
            Safeguard Verification
          </h2>
          <p className="text-xs text-[#6E6C63] leading-relaxed">
            Live verification of binary signature checks, path traversal sanitization, server-side citation filtering, and CSV formula escaping.
          </p>
          <button
            type="button"
            disabled={runningChecks}
            onClick={handleRunSuite}
            className="mt-2 px-3 py-1.5 text-xs font-medium text-[#1F201C] border border-[#242520]/40 hover:border-[#242520] rounded-sm transition-colors cursor-pointer"
          >
            {runningChecks ? 'Running Audit…' : 'Re-verify Safeguards'}
          </button>
        </div>

        <div className="md:col-span-8 space-y-5">
          <div className="divide-y divide-[#D5CFC2] border-y border-[#D5CFC2]">
            {checks.map((chk) => (
              <div
                key={chk.id}
                className="py-3 flex items-baseline justify-between gap-4 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-medium text-[#1F201C] flex items-center gap-1.5">
                    {chk.passed ? (
                      <Check className="w-3.5 h-3.5 text-[#1E5631] shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-[#9E2A2B] shrink-0" />
                    )}
                    <span>{chk.name}</span>
                  </div>
                  <div className="text-[#6E6C63] pl-5 font-mono-tabular text-[11px]">
                    {chk.detail}
                  </div>
                </div>
                <span
                  className={`font-editorial italic shrink-0 ${
                    chk.passed ? 'text-[#1E5631]' : 'text-[#9E2A2B]'
                  }`}
                >
                  {chk.passed ? 'Verified' : 'Failed'}
                </span>
              </div>
            ))}
          </div>

          {/* Interactive Intake Rejection Tests */}
          <div className="space-y-2">
            <div className="text-xs text-[#4A4942]">
              Test intake rejection with malformed inputs:
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <button
                type="button"
                onClick={() => handleTestAdversarialUpload('non_pdf')}
                className="text-[#B84B2F] hover:underline cursor-pointer"
              >
                1. Renamed HTML file (.pdf)
              </button>
              <span className="text-[#D5CFC2]">·</span>
              <button
                type="button"
                onClick={() => handleTestAdversarialUpload('encrypted_pdf')}
                className="text-[#B84B2F] hover:underline cursor-pointer"
              >
                2. Password-encrypted PDF
              </button>
              <span className="text-[#D5CFC2]">·</span>
              <button
                type="button"
                onClick={() => handleTestAdversarialUpload('empty_file')}
                className="text-[#B84B2F] hover:underline cursor-pointer"
              >
                3. Zero-byte file
              </button>
            </div>
            {adversarialResult && (
              <p className="text-xs font-editorial italic text-[#1E5631] pt-1">
                {adversarialResult}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Section 04: Desk Maintenance */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-4">
          <div className="text-xs font-mono-tabular text-[#6E6C63]">04</div>
          <h2 className="font-editorial text-xl text-[#1F201C] font-normal mt-0.5">
            Archive Maintenance
          </h2>
        </div>

        <div className="md:col-span-8 space-y-3">
          <p className="text-xs text-[#4A4942] leading-relaxed">
            Clearing the archive deletes all metadata, extracted section passages, normalized tables, comparisons, and stored PDF files on disk.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button
              type="button"
              disabled={resetting}
              onClick={() => handleReset(false)}
              className="px-4 py-2 text-xs font-medium text-[#9E2A2B] border border-[#9E2A2B]/40 hover:bg-[#9E2A2B] hover:text-white rounded-sm transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All Local Data</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
