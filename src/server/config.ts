import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export interface DocuLensConfig {
  env: string;
  dataDir: string;
  uploadsDir: string;
  processedDir: string;
  dbFilePath: string;
  maxUploadMb: number;
  maxUploadBytes: number;
  maxPages: number;
  parserTimeoutSeconds: number;
  remoteAiEnabledByDefault: boolean;
  geminiApiKeyConfigured: boolean;
  remoteModelName: string;
  parserName: string;
  parserVersion: string;
}

const dataDir = path.resolve(process.cwd(), process.env.DOCULENS_DATA_DIR || './data');
const maxUploadMb = Math.max(1, parseInt(process.env.DOCULENS_MAX_UPLOAD_MB || '25', 10) || 25);
const maxPages = Math.max(1, parseInt(process.env.DOCULENS_MAX_PAGES || '250', 10) || 250);
const parserTimeoutSeconds = Math.max(
  5,
  parseInt(process.env.DOCULENS_PARSER_TIMEOUT_SECONDS || '120', 10) || 120
);

const rawApiKey = process.env.GEMINI_API_KEY || '';
const isConfiguredKey =
  Boolean(rawApiKey) &&
  rawApiKey !== 'MY_GEMINI_API_KEY' &&
  rawApiKey.trim().length > 10;

export const config: DocuLensConfig = {
  env: process.env.DOCULENS_ENV || 'development',
  dataDir,
  uploadsDir: path.join(dataDir, 'uploads'),
  processedDir: path.join(dataDir, 'processed'),
  dbFilePath: path.join(dataDir, 'doculens.json'),
  maxUploadMb,
  maxUploadBytes: maxUploadMb * 1024 * 1024,
  maxPages,
  parserTimeoutSeconds,
  remoteAiEnabledByDefault: process.env.DOCULENS_REMOTE_AI_ENABLED === 'true',
  geminiApiKeyConfigured: isConfiguredKey,
  remoteModelName: 'gemini-3.8-flash',
  parserName: 'OpenDataLoader PDF Adapter',
  parserVersion: '2.1.0-apache2',
};

export function sanitizeFilename(rawName: string): string {
  // Strip any directory traversal components or control chars
  const base = path.basename(rawName.replace(/\\/g, '/'));
  const cleaned = base
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .replace(/\.\.+/g, '.')
    .trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return 'unnamed_document.pdf';
  }
  return cleaned;
}
