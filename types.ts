
export enum DocumentLabel {
  CLOSING_DISCLOSURE = "Mortgage - Closing Disclosure - Seller",
  RATE_NOTE = "Lender - Rate Note",
  RIDER = "Title - Rider",
  TAX_RECORD = "Property - Tax Record Information Sheet",
  AFFIDAVIT = "Title - Signature / Name Affidavit (Ack)",
  UNKNOWN = "Unknown"
}

export interface ExtractedData {
  borrower_name?: string | null;
  property_address?: string | null;
  loan_number?: string | null;
  [key: string]: any;
}

export interface PageData {
  id: number;
  rawText: string;
  predictedLabel?: string;
  confidence?: number;
  extractedFields?: ExtractedData;
}

export interface TriangulationResult {
  finalValue: string | null;
  source: string;
  confidence: string;
  allValues: { value: string; source: string; pageId?: number }[];
}

export interface LoanData {
  borrower_name: TriangulationResult;
  property_address: TriangulationResult;
  loan_number: TriangulationResult;
}

export type Language = 'en' | 'tr';

export interface BackendLayoutBlock {
  text: string;
  bbox: [number, number, number, number];
}

export interface BackendPage {
  page_number: number;
  text: string;
  group_id?: string | null;
  layout: BackendLayoutBlock[];
}

export interface BackendClassification {
  page_number: number;
  label: string;
  confidence: number;
  group_id?: string | null;
}

export interface BackendExtraction {
  page_number: number;
  borrower_name?: string | null;
  property_address?: string | null;
  loan_number?: string | null;
  errors?: string[];
}

export interface LoanRecordSummary {
  borrower_name: string | null;
  property_address: string | null;
  loan_number: string | null;
  decision_log: Record<string, string[]>;
  field_confidence?: Record<string, number>;
}

export interface BackendUIResult {
  borrower_name: string | null;
  property_address: string | null;
  loan_number: string | null;
  field_confidence?: Record<string, number>;
  confidence?: number;
  warnings?: string[];
  documents?: Array<{
    label: string;
    pages: string[];
    average_confidence: number;
  }>;
  decision_log: Record<string, string[]>;
}

export interface BackendDocGroup {
  group_id: string;
  label: string;
  pages: number[];
  average_confidence?: number;
}

export interface BackendPipelineResponse {
  pages: BackendPage[];
  classifications: BackendClassification[];
  extractions: BackendExtraction[];
  record: LoanRecordSummary;
  ui: BackendUIResult;
  doc_groups?: BackendDocGroup[];
}

export interface PipelineJobStage {
  label?: string | null;
  index?: number | null;
  total?: number | null;
}

export interface PipelineJobStatus {
  job_id: string;
  filename: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress: number;
  stage: PipelineJobStage;
  created_at: number;
  updated_at: number;
  error?: string | null;
  result?: BackendPipelineResponse;
}

export interface BackendConfig {
  labels: string[];
  extraction_schema: Record<string, string>;
  label_weights: Record<string, number>;
}
