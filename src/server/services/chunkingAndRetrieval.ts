import {
  BoundingBox,
  DocumentChunk,
  DocumentElement,
  ElementType,
  SearchResult,
} from '../../shared/types.ts';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'to', 'was', 'were', 'will', 'with', 'what', 'which', 'who',
  'how', 'when', 'where', 'why', 'this', 'these', 'those', 'their',
  'can', 'could', 'would', 'should', 'do', 'does', 'did', 'have', 'had',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.%$-]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.,-]+|[.,-]+$/g, ''))
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

export function buildSectionChunks(
  documentId: string,
  documentName: string,
  elements: DocumentElement[]
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let bufferElements: DocumentElement[] = [];
  let currentSection = 'Document Overview';
  let chunkCounter = 1;

  const flushChunk = () => {
    if (bufferElements.length === 0) return;

    const textParts = bufferElements.map((el) => {
      if (el.type === ElementType.HEADING) {
        return `${el.content}:`;
      }
      return el.content;
    });

    const combinedText = textParts.join(' ').trim();
    if (!combinedText) {
      bufferElements = [];
      return;
    }

    const pageStart = Math.min(...bufferElements.map((e) => e.page_number));
    const pageEnd = Math.max(...bufferElements.map((e) => e.page_number));
    const firstBbox = bufferElements[0].bounding_box;
    const lastBbox = bufferElements[bufferElements.length - 1].bounding_box;

    const mergedBbox: BoundingBox = {
      x: Math.min(...bufferElements.map((e) => e.bounding_box.x)),
      y: firstBbox.y,
      width: Math.max(...bufferElements.map((e) => e.bounding_box.width)),
      height: Math.min(
        85,
        Math.max(12, lastBbox.y + lastBbox.height - firstBbox.y)
      ),
    };

    const sectionPath =
      bufferElements.find((e) => e.section_path)?.section_path || currentSection;

    chunks.push({
      id: `${documentId}-chk-${chunkCounter++}`,
      document_id: documentId,
      document_name: documentName,
      text: combinedText,
      page_start: pageStart,
      page_end: pageEnd,
      element_ids: bufferElements.map((e) => e.id),
      section_path: sectionPath,
      bounding_box: mergedBbox,
      search_text: `${sectionPath} ${combinedText}`.toLowerCase(),
    });

    bufferElements = [];
  };

  for (const el of elements) {
    if (el.type === ElementType.HEADING) {
      flushChunk();
      currentSection = el.content.trim();
      bufferElements.push(el);
      continue;
    }

    // Keep chunks scoped to a single section and reasonable word length
    const currentLen = bufferElements.reduce((acc, item) => acc + item.content.length, 0);
    const pageChanged =
      bufferElements.length > 0 &&
      bufferElements[bufferElements.length - 1].page_number !== el.page_number;

    if (currentLen + el.content.length > 650 || (pageChanged && currentLen > 220)) {
      flushChunk();
    }

    bufferElements.push(el);
  }

  flushChunk();
  return chunks;
}

export function retrieveChunks(
  query: string,
  allChunks: DocumentChunk[],
  documentIds?: string[],
  limit = 6
): SearchResult[] {
  const scopedChunks =
    documentIds && documentIds.length > 0
      ? allChunks.filter((c) => documentIds.includes(c.document_id))
      : allChunks;

  if (scopedChunks.length === 0 || !query.trim()) {
    return [];
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }

  // Compute IDF across scoped corpus
  const N = scopedChunks.length;
  const docFreq = new Map<string, number>();
  const chunkTokensList = scopedChunks.map((c) => tokenize(c.search_text));

  for (const qToken of queryTokens) {
    let df = 0;
    for (const tokens of chunkTokensList) {
      if (tokens.some((t) => t === qToken || t.includes(qToken) || qToken.includes(t))) {
        df++;
      }
    }
    docFreq.set(qToken, df);
  }

  const avgLen =
    chunkTokensList.reduce((sum, arr) => sum + arr.length, 0) / Math.max(1, N);

  const scored: SearchResult[] = [];
  const lowerQuery = query.trim().toLowerCase();

  for (let i = 0; i < scopedChunks.length; i++) {
    const chunk = scopedChunks[i];
    const tokens = chunkTokensList[i];
    if (tokens.length === 0) continue;

    let score = 0;
    let matchedQueryTerms = 0;

    for (const qToken of queryTokens) {
      const exactCount = tokens.filter((t) => t === qToken).length;
      const partialCount =
        exactCount === 0
          ? tokens.filter(
              (t) =>
                (t.length >= 4 && qToken.length >= 4 && (t.startsWith(qToken.slice(0, 4)) || t.includes(qToken)))
            ).length * 0.45
          : 0;

      const tf = exactCount + partialCount;
      if (tf > 0) {
        matchedQueryTerms++;
        const df = docFreq.get(qToken) || 1;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const k1 = 1.5;
        const b = 0.75;
        const normTf =
          (tf * (k1 + 1)) /
          (tf + k1 * (1 - b + b * (tokens.length / Math.max(1, avgLen))));
        score += Math.max(0.25, idf) * normTf;
      }
    }

    // Exact phrase boost
    if (lowerQuery.length >= 4 && chunk.search_text.includes(lowerQuery)) {
      score += 2.5;
    }

    // Section title match boost
    const sectionLower = chunk.section_path.toLowerCase();
    for (const qToken of queryTokens) {
      if (sectionLower.includes(qToken)) {
        score += 0.6;
      }
    }

    // Coverage bonus when multiple query terms appear together
    if (queryTokens.length > 1 && matchedQueryTerms > 1) {
      score *= 1 + (matchedQueryTerms / queryTokens.length) * 0.4;
    }

    if (score > 0.15) {
      scored.push({
        chunk_id: chunk.id,
        document_id: chunk.document_id,
        document_name: chunk.document_name,
        page_start: chunk.page_start,
        page_end: chunk.page_end,
        section_path: chunk.section_path,
        text: chunk.text,
        highlighted_excerpt: buildHighlightedExcerpt(chunk.text, queryTokens),
        score: Number(score.toFixed(3)),
        element_ids: chunk.element_ids,
        bounding_box: chunk.bounding_box,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function buildHighlightedExcerpt(text: string, queryTokens: string[]): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  let bestSentence = sentences[0] || text;
  let maxHits = -1;

  for (const s of sentences) {
    const lower = s.toLowerCase();
    let hits = 0;
    for (const qt of queryTokens) {
      if (lower.includes(qt)) hits++;
    }
    if (hits > maxHits) {
      maxHits = hits;
      bestSentence = s;
    }
  }

  return bestSentence.length > 260
    ? `${bestSentence.slice(0, 257)}...`
    : bestSentence;
}
