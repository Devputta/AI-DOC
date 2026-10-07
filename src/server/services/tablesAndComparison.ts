import {
  ComparisonChange,
  ComparisonChangeType,
  ComparisonRecord,
  DocumentChunk,
  DocumentRecord,
  NumericDelta,
  TableRecord,
} from '../../shared/types.ts';
import { tokenize } from './chunkingAndRetrieval.ts';

/**
 * Mitigates spreadsheet formula injection (CSV Injection / CWE-1236):
 * Any cell beginning with =, +, -, or @ (after optional leading whitespace/control characters)
 * is prefixed with a single quote (') so spreadsheet applications treat it as a literal string.
 */
export function sanitizeCsvCellValue(rawCell: string): string {
  const str = String(rawCell ?? '');
  const trimmedLeading = str.replace(/^[\s\u0000-\u001f]+/, '');
  let safe = str;

  if (/^[=+\-@]/.test(trimmedLeading) || /^[\t\r]/.test(str)) {
    safe = `'${str}`;
  }

  // Standard RFC 4180 escaping
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function exportTableToCsv(table: TableRecord): {
  filename: string;
  csvContent: string;
  mitigatedFormulaCells: number;
} {
  let mitigatedFormulaCells = 0;

  const formatRow = (cells: string[]) =>
    cells
      .map((cell) => {
        const trimmed = String(cell ?? '').replace(/^[\s\u0000-\u001f]+/, '');
        if (/^[=+\-@]/.test(trimmed) || /^[\t\r]/.test(String(cell ?? ''))) {
          mitigatedFormulaCells++;
        }
        return sanitizeCsvCellValue(cell);
      })
      .join(',');

  const lines: string[] = [];
  lines.push(formatRow(table.columns));
  for (const row of table.rows) {
    lines.push(formatRow(row));
  }

  const safeTitle = table.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

  return {
    filename: `${safeTitle || 'extracted_table'}_p${table.page_number}.csv`,
    csvContent: lines.join('\r\n') + '\r\n',
    mitigatedFormulaCells,
  };
}

/**
 * Compares two ready documents by aligning sections and chunks, classifying changes
 * into added, removed, changed, and uncertain, and extracting numeric deltas.
 */
export function compareDocuments(
  comparisonId: string,
  leftDoc: DocumentRecord,
  leftChunks: DocumentChunk[],
  rightDoc: DocumentRecord,
  rightChunks: DocumentChunk[]
): ComparisonRecord {
  const changes: ComparisonChange[] = [];
  const matchedRightIds = new Set<string>();
  let unchangedCount = 0;
  let changeCounter = 1;

  for (const lChunk of leftChunks) {
    const lTokens = new Set(tokenize(lChunk.text));
    const lSectionTokens = new Set(tokenize(lChunk.section_path));

    let bestRight: DocumentChunk | null = null;
    let bestScore = -1;

    for (const rChunk of rightChunks) {
      if (matchedRightIds.has(rChunk.id)) continue;

      const rTokens = new Set(tokenize(rChunk.text));
      const rSectionTokens = new Set(tokenize(rChunk.section_path));

      const textSim = computeJaccard(lTokens, rTokens);
      const sectionSim =
        lChunk.section_path.toLowerCase() === rChunk.section_path.toLowerCase()
          ? 1.0
          : computeJaccard(lSectionTokens, rSectionTokens);

      const combinedScore = textSim * 0.72 + sectionSim * 0.28;
      if (combinedScore > bestScore) {
        bestScore = combinedScore;
        bestRight = rChunk;
      }
    }

    if (bestRight && bestScore >= 0.24) {
      matchedRightIds.add(bestRight.id);

      const exactIdentical =
        lChunk.text.trim() === bestRight.text.trim() &&
        lChunk.section_path.trim() === bestRight.section_path.trim();

      if (exactIdentical) {
        unchangedCount++;
        continue;
      }

      const numericDeltas = extractNumericDeltas(lChunk.text, bestRight.text);
      const isUncertain = bestScore < 0.46 && numericDeltas.length === 0;
      const changeType = isUncertain
        ? ComparisonChangeType.UNCERTAIN
        : ComparisonChangeType.CHANGED;

      const summary = buildChangeSummary(
        lChunk,
        bestRight,
        changeType,
        numericDeltas
      );

      changes.push({
        id: `${comparisonId}-chg-${changeCounter++}`,
        comparison_id: comparisonId,
        type: changeType,
        section_title: bestRight.section_path || lChunk.section_path,
        summary,
        confidence: Number(Math.min(0.98, Math.max(0.35, bestScore + 0.15)).toFixed(2)),
        numeric_deltas: numericDeltas,
        left_evidence: {
          document_id: leftDoc.id,
          document_name: leftDoc.original_name,
          chunk_id: lChunk.id,
          page_number: lChunk.page_start,
          section_path: lChunk.section_path,
          excerpt: lChunk.text,
          bounding_box: lChunk.bounding_box,
        },
        right_evidence: {
          document_id: rightDoc.id,
          document_name: rightDoc.original_name,
          chunk_id: bestRight.id,
          page_number: bestRight.page_start,
          section_path: bestRight.section_path,
          excerpt: bestRight.text,
          bounding_box: bestRight.bounding_box,
        },
      });
    } else {
      // Removed in right document
      changes.push({
        id: `${comparisonId}-chg-${changeCounter++}`,
        comparison_id: comparisonId,
        type: ComparisonChangeType.REMOVED,
        section_title: lChunk.section_path,
        summary: `Section passage "${lChunk.section_path}" (p. ${lChunk.page_start}) is present in ${leftDoc.original_name} but absent in ${rightDoc.original_name}.`,
        confidence: 0.91,
        numeric_deltas: [],
        left_evidence: {
          document_id: leftDoc.id,
          document_name: leftDoc.original_name,
          chunk_id: lChunk.id,
          page_number: lChunk.page_start,
          section_path: lChunk.section_path,
          excerpt: lChunk.text,
          bounding_box: lChunk.bounding_box,
        },
        right_evidence: {
          document_id: rightDoc.id,
          document_name: rightDoc.original_name,
          chunk_id: null,
          page_number: null,
          section_path: null,
          excerpt: null,
          bounding_box: null,
        },
      });
    }
  }

  // Remaining unmatched right chunks are ADDED
  for (const rChunk of rightChunks) {
    if (matchedRightIds.has(rChunk.id)) continue;

    changes.push({
      id: `${comparisonId}-chg-${changeCounter++}`,
      comparison_id: comparisonId,
      type: ComparisonChangeType.ADDED,
      section_title: rChunk.section_path,
      summary: `New passage in "${rChunk.section_path}" (p. ${rChunk.page_start}) added in ${rightDoc.original_name}.`,
      confidence: 0.93,
      numeric_deltas: [],
      left_evidence: {
        document_id: leftDoc.id,
        document_name: leftDoc.original_name,
        chunk_id: null,
        page_number: null,
        section_path: null,
        excerpt: null,
        bounding_box: null,
      },
      right_evidence: {
        document_id: rightDoc.id,
        document_name: rightDoc.original_name,
        chunk_id: rChunk.id,
        page_number: rChunk.page_start,
        section_path: rChunk.section_path,
        excerpt: rChunk.text,
        bounding_box: rChunk.bounding_box,
      },
    });
  }

  const summaryCounts = {
    added: changes.filter((c) => c.type === ComparisonChangeType.ADDED).length,
    removed: changes.filter((c) => c.type === ComparisonChangeType.REMOVED).length,
    changed: changes.filter((c) => c.type === ComparisonChangeType.CHANGED).length,
    uncertain: changes.filter((c) => c.type === ComparisonChangeType.UNCERTAIN).length,
    unchanged: unchangedCount,
  };

  return {
    id: comparisonId,
    left_document_id: leftDoc.id,
    right_document_id: rightDoc.id,
    left_document_name: leftDoc.original_name,
    right_document_name: rightDoc.original_name,
    status: 'ready',
    created_at: new Date().toISOString(),
    summary_counts: summaryCounts,
    changes,
  };
}

function computeJaccard(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function extractNumericDeltas(leftText: string, rightText: string): NumericDelta[] {
  const numRegex =
    /(?:\$\d+(?:,\d{3})*(?:\.\d+)?\s*(?:million|billion|M|B|K)?|\b\d+(?:\.\d+)?\s*(?:%|°C|MW|MWh|kWh|ppm|ng\/L|hours|days|ms)\b)/gi;
  const leftMatches = Array.from(leftText.matchAll(numRegex)).map((m) => m[0].trim());
  const rightMatches = Array.from(rightText.matchAll(numRegex)).map((m) => m[0].trim());

  const deltas: NumericDelta[] = [];
  const maxLen = Math.min(leftMatches.length, rightMatches.length, 4);

  for (let i = 0; i < maxLen; i++) {
    if (leftMatches[i] !== rightMatches[i]) {
      deltas.push({
        label: `Figure #${i + 1}`,
        left_value: leftMatches[i],
        right_value: rightMatches[i],
      });
    }
  }
  return deltas;
}

function buildChangeSummary(
  leftChunk: DocumentChunk,
  rightChunk: DocumentChunk,
  type: ComparisonChangeType,
  deltas: NumericDelta[]
): string {
  if (type === ComparisonChangeType.UNCERTAIN) {
    return `Ambiguous alignment in "${rightChunk.section_path}" (p. ${leftChunk.page_start} vs p. ${rightChunk.page_start}): terminology shifted substantially; inspect both passages to verify equivalence.`;
  }
  if (deltas.length > 0) {
    const deltaDesc = deltas
      .map((d) => `${d.left_value} → ${d.right_value}`)
      .join('; ');
    return `Updated figures in "${rightChunk.section_path}" (${deltaDesc}).`;
  }
  return `Revised wording in "${rightChunk.section_path}" between page ${leftChunk.page_start} and page ${rightChunk.page_start}.`;
}
