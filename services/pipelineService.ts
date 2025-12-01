
import {
  PageData,
  DocumentLabel,
  LoanData,
  TriangulationResult,
  Language,
  BackendPipelineResponse,
  PipelineJobStatus,
  BackendConfig,
} from '../types';

// Prefer build-time Vite env; fall back to deployed API domain to avoid localhost in prod builds.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || 'https://pdf.hukcep.com';

type StatusCallback = (status: PipelineJobStatus) => void;

export const fetchConfig = async (): Promise<BackendConfig> => {
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/config`);
  if (!response.ok) {
    throw new Error('Config fetch failed');
  }
  return response.json();
};

export const processPdf = async (
  file: File,
  onStatusUpdate?: StatusCallback,
): Promise<BackendPipelineResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/process`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'PDF processing failed');
  }

  const payload = await response.json();
  const jobId = payload.job_id;
  if (!jobId) {
    throw new Error('Job id missing from response');
  }

  return pollJobStatus(jobId, onStatusUpdate);
};

const pollJobStatus = (
  jobId: string,
  onStatusUpdate?: StatusCallback,
  intervalMs = 1000,
): Promise<BackendPipelineResponse> =>
  new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/status/${jobId}`);
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || 'Failed to fetch job status');
        }
        const statusPayload: PipelineJobStatus = await response.json();
        onStatusUpdate?.(statusPayload);

        if (statusPayload.status === 'failed') {
          reject(new Error(statusPayload.error || 'Pipeline job failed'));
          return;
        }

        if (statusPayload.status === 'completed' && statusPayload.result) {
          resolve(statusPayload.result);
          return;
        }

        setTimeout(poll, intervalMs);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Status polling failed'));
      }
    };

    poll();
  });

/**
 * Task 5 Logic: Triangulation Strategy
 * 
 * Logic:
 * 1. Gather all values for a specific field from all documents.
 * 2. Assign a "Trust Score" to each document type based on the field.
 *    - e.g., Rate Note is the source of truth for Loan Terms.
 *    - e.g., Title/Deed is source of truth for Property Address.
 *    - e.g., 1003 or CD is source of truth for Borrower Name spelling.
 * 3. Normalize values (remove punctuation, uppercase).
 * 4. Pick the value with the highest trust score.
 */

const TRUST_SCORES: Record<string, Record<DocumentLabel, number>> = {
  loan_number: {
    [DocumentLabel.RATE_NOTE]: 10,
    [DocumentLabel.CLOSING_DISCLOSURE]: 9,
    [DocumentLabel.RIDER]: 5,
    [DocumentLabel.TAX_RECORD]: 3,
    [DocumentLabel.AFFIDAVIT]: 3,
    [DocumentLabel.UNKNOWN]: 0,
  },
  borrower_name: {
    [DocumentLabel.CLOSING_DISCLOSURE]: 10, // Final official name used for closing
    [DocumentLabel.AFFIDAVIT]: 9, // Specifically about name
    [DocumentLabel.RATE_NOTE]: 8,
    [DocumentLabel.TAX_RECORD]: 4,
    [DocumentLabel.RIDER]: 5,
    [DocumentLabel.UNKNOWN]: 0,
  },
  property_address: {
    [DocumentLabel.RIDER]: 10, // Attached to security instrument, legal desc is key
    [DocumentLabel.RATE_NOTE]: 9,
    [DocumentLabel.CLOSING_DISCLOSURE]: 8,
    [DocumentLabel.TAX_RECORD]: 7, // Sometimes abbreviated
    [DocumentLabel.AFFIDAVIT]: 6,
    [DocumentLabel.UNKNOWN]: 0,
  }
};

const normalize = (val: string) => val.trim().toUpperCase().replace(/[\.,]/g, '');

const resolveLabelKey = (label?: string | DocumentLabel): DocumentLabel => {
  const values = Object.values(DocumentLabel);
  if (label && values.includes(label as DocumentLabel)) {
    return label as DocumentLabel;
  }
  return DocumentLabel.UNKNOWN;
};

const labelToDisplay = (label: DocumentLabel, lang: Language): string => {
  if (lang === 'en') {
      switch (label) {
        case DocumentLabel.RATE_NOTE: return "Rate Note";
        case DocumentLabel.CLOSING_DISCLOSURE: return "Closing Disclosure";
        case DocumentLabel.RIDER: return "Rider";
        case DocumentLabel.TAX_RECORD: return "Tax Record";
        case DocumentLabel.AFFIDAVIT: return "Affidavit";
        default: return "Unknown";
      }
  } else {
      switch (label) {
        case DocumentLabel.RATE_NOTE: return "Senet (Rate Note)";
        case DocumentLabel.CLOSING_DISCLOSURE: return "Kapanış Beyanı (CD)";
        case DocumentLabel.RIDER: return "Ek Belge (Rider)";
        case DocumentLabel.TAX_RECORD: return "Vergi Kaydı";
        case DocumentLabel.AFFIDAVIT: return "İmza Beyanı";
        default: return "Bilinmeyen";
      }
  }
};

export const triangulateData = (pages: PageData[], lang: Language = 'tr', labelWeights?: Record<string, number>): LoanData => {
  const fields: (keyof LoanData)[] = ['borrower_name', 'property_address', 'loan_number'];
  
  const results: any = {};

  fields.forEach(field => {
    // 1. Collect all candidates
    const candidates: { value: string; source: string; score: number, original: string, pageId: number }[] = [];

    pages.forEach(page => {
      if (page.extractedFields && page.extractedFields[field] && page.predictedLabel) {
        const val = page.extractedFields[field];
        if (val) {
           const labelKey = resolveLabelKey(page.predictedLabel);
           candidates.push({
            value: normalize(val),
            original: val,
            source: labelToDisplay(labelKey, lang),
            score: (labelWeights?.[labelKey] ?? TRUST_SCORES[field][labelKey] ?? 1),
            pageId: page.id
          });
        }
      }
    });

    // 2. Sort by Trust Score to find the BEST match
    candidates.sort((a, b) => b.score - a.score);

    // 3. Determine Result
    const bestMatch = candidates[0];

    // 4. Sort by Page ID for the Decision Log display (User Request)
    const sortedByPage = [...candidates].sort((a, b) => a.pageId - b.pageId);

    // Fallback if no match found
    const noSource = lang === 'en' ? "None" : "Yok";

    const result: TriangulationResult = {
      finalValue: bestMatch ? bestMatch.original : null,
      source: bestMatch ? bestMatch.source : noSource,
      confidence: bestMatch ? (bestMatch.score >= 8 ? "High" : "Medium") : "None",
      allValues: sortedByPage.map(c => ({ value: c.original, source: c.source, pageId: c.pageId }))
    };

    results[field] = result;
  });

  return results as LoanData;
};
