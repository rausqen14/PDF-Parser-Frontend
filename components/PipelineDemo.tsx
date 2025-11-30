import React, { useState, useRef, useCallback, useEffect } from 'react';
import { MOCK_PAGES } from '../constants';
import { processPdf, triangulateData } from '../services/pipelineService';
import {
  PageData,
  Language,
  BackendPipelineResponse,
  BackendUIResult,
  DocumentLabel,
  PipelineJobStatus,
  BackendConfig,
  BackendDocGroup,
  LoanData,
} from '../types';
import { Button } from './Button';
import { translations } from '../translations';

interface PipelineDemoProps {
  language: Language;
  config?: BackendConfig | null;
  configLoading?: boolean;
  configError?: string | null;
  onReset?: () => void;
}

const FINAL_FIELDS = ['borrower_name', 'property_address', 'loan_number'] as const;

type AgentStageId =
  | 'DocumentLoaderAgent'
  | 'PageClassifierAgent'
  | 'FieldExtractionAgent'
  | 'NoiseFilterAgent'
  | 'MajorityVoteAgent'
  | 'Pipeline';

const STAGE_LABELS: Record<AgentStageId, Record<Language, string>> = {
  DocumentLoaderAgent: {
    en: 'DocumentLoaderAgent - Parsing PDF & OCR results',
    tr: 'DocumentLoaderAgent - PDF + OCR metni ayristiriliyor',
  },
  PageClassifierAgent: {
    en: 'PageClassifierAgent - Labeling each page',
    tr: 'PageClassifierAgent - Sayfa etiketleri belirleniyor',
  },
  FieldExtractionAgent: {
    en: 'FieldExtractionAgent - Targeted extraction & LLM seeding',
    tr: 'FieldExtractionAgent - Hedefli cikarim ve LLM tohumlama',
  },
  NoiseFilterAgent: {
    en: 'NoiseFilterAgent - Cleaning and validating fields',
    tr: 'NoiseFilterAgent - Alanlar temizleniyor',
  },
  MajorityVoteAgent: {
    en: 'MajorityVoteAgent - Selecting most frequent values',
    tr: 'MajorityVoteAgent - En sik gecen degerler seciliyor',
  },
  Pipeline: {
    en: 'Pipeline - Finalizing results',
    tr: 'Pipeline - Sonuclar tamamlan?yor',
  },
};


const STAGE_ORDER: AgentStageId[] = [
  'DocumentLoaderAgent',
  'PageClassifierAgent',
  'FieldExtractionAgent',
  'NoiseFilterAgent',
  'MajorityVoteAgent',
  'Pipeline',
];

export const PipelineDemo: React.FC<PipelineDemoProps> = ({ language, onReset, config, configLoading, configError }) => {
  const t = translations[language].demo;

  const [activeStep, setActiveStep] = useState(1);
  const [processedPages, setProcessedPages] = useState<PageData[]>([]);
  const [finalResult, setFinalResult] = useState<BackendUIResult | null>(null);
  const [docGroups, setDocGroups] = useState<BackendDocGroup[]>([]);
  const [triangulated, setTriangulated] = useState<LoanData | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [selectedPreview, setSelectedPreview] = useState<PageData | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStageId, setCurrentStageId] = useState<AgentStageId | null>(null);
  const [stageStep, setStageStep] = useState<{ index: number; total: number }>({
    index: 0,
    total: STAGE_ORDER.length,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayLabel = (raw?: string | null) => {
    if (!raw) return undefined;
    const normalized = raw.replace('DocumentLabel.', '').trim();
    const map: Record<string, { en: string; tr: string }> = {
      [DocumentLabel.RATE_NOTE]: { en: 'Rate Note', tr: 'Senet (Rate Note)' },
      [DocumentLabel.CLOSING_DISCLOSURE]: { en: 'Closing Disclosure', tr: 'Kapanış Beyanı (CD)' },
      [DocumentLabel.RIDER]: { en: 'Rider', tr: 'Ek Belge (Rider)' },
      [DocumentLabel.TAX_RECORD]: { en: 'Tax Record', tr: 'Vergi Kaydı' },
      [DocumentLabel.AFFIDAVIT]: { en: 'Signature Affidavit', tr: 'İmza Beyanı' },
      [DocumentLabel.UNKNOWN]: { en: 'Unknown', tr: 'Bilinmeyen' },
    };
    const matched = map[normalized as DocumentLabel];
    if (matched) {
      return language === 'tr' ? matched.tr : matched.en;
    }
    return normalized;
  };

  const parseDecisionEntry = (entry: string) => {
    const classic = entry.match(/^pg(?<page>\d+):(?<value>.*?)(?:\s*\(label=(?<label>[^)]+)\))?/i);
    if (classic?.groups) {
      const { page, value, label } = classic.groups;
      return {
        page: page ? Number(page) : undefined,
        value: (value || '').trim(),
        labelText: displayLabel(label),
        raw: entry,
      };
    }
    const scoreFmt = entry.match(/value=(?<value>.+?)\s*\[score=(?<score>[\d\.]+)/i);
    if (scoreFmt?.groups) {
      return {
        value: (scoreFmt.groups.value || '').trim(),
        labelText: undefined,
        raw: entry,
      };
    }
    return { raw: entry };
  };

  const hydratePagesFromResponse = (data: BackendPipelineResponse): PageData[] => {
    const classificationMap = new Map(data.classifications.map((item) => [item.page_number, item]));
    const extractionMap = new Map(data.extractions.map((item) => [item.page_number, item]));

    return data.pages.map((page) => {
      const classification = classificationMap.get(page.page_number);
      const extraction = extractionMap.get(page.page_number);
      return {
        id: page.page_number,
        rawText: page.text,
        predictedLabel: classification?.label,
        confidence: classification?.confidence,
        extractedFields: extraction
          ? {
              borrower_name: extraction.borrower_name ?? null,
              property_address: extraction.property_address ?? null,
              loan_number: extraction.loan_number ?? null,
            }
          : undefined,
      };
    });
  };

  useEffect(() => {
    if (!isFileUploaded || !processedPages.length) return;
    setTriangulated(triangulateData(processedPages, language, config?.label_weights));
  }, [isFileUploaded, processedPages, language, config]);

  const confidenceLabel = (value: number) => {
    if (value >= 0.85) return t.step4.high;
    if (value >= 0.6) return t.step4.medium;
    return t.step4.none;
  };

  const handleJobStatusUpdate = useCallback((status: PipelineJobStatus) => {
    if (typeof status.progress === 'number') {
      setProgress(Math.max(0, Math.min(100, Math.round(status.progress))));
    }
    if (status.stage) {
      const label = (status.stage.label || undefined) as AgentStageId | undefined;
      if (label) {
        setCurrentStageId(label);
      }
      setStageStep((prev) => {
        const computedIndex =
          typeof status.stage.index === 'number'
            ? status.stage.index
            : label
            ? STAGE_ORDER.indexOf(label) + 1
            : prev.index;
        return {
          index: computedIndex,
          total: status.stage.total || prev.total,
        };
      });
    }
  }, []);

  const startUpload = (file: File) => {
    setIsScanning(true);
    setProgress(0);
    setCurrentStageId(null);
    setStageStep({ index: 0, total: STAGE_ORDER.length });
    setUploadError(null);
    setIsFileUploaded(false);
    setProcessedPages([]);
    setFinalResult(null);
    setDocGroups([]);
    setTriangulated(null);
    setExpandedKeys({});

    processPdf(file, handleJobStatusUpdate)
      .then((response) => {
        const hydratedPages = hydratePagesFromResponse(response);
        setProcessedPages(hydratedPages);
        setDocGroups(response.doc_groups || []);
        setFinalResult(response.ui);
        setTriangulated(triangulateData(hydratedPages, language, config?.label_weights));
        setIsFileUploaded(true);
        setActiveStep(1);
        setProgress(100);
        setCurrentStageId('Pipeline');
        setStageStep({ index: STAGE_ORDER.length, total: STAGE_ORDER.length });
      })
      .catch((error) => {
        setUploadError(error instanceof Error ? error.message : 'Processing failed.');
        setProgress(0);
        setCurrentStageId(null);
        setStageStep({ index: 0, total: STAGE_ORDER.length });
      })
      .finally(() => {
        setIsScanning(false);
      });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      startUpload(event.target.files[0]);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      startUpload(event.dataTransfer.files[0]);
    }
  };

  const previewPages = processedPages.length ? processedPages : MOCK_PAGES;

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderFinalCards = () => {
    if (!finalResult) {
      const fieldKeys = config?.extraction_schema ? Object.keys(config.extraction_schema) : FINAL_FIELDS;
      if (!triangulated) return null;
      return fieldKeys.map((key) => {
        const tri = (triangulated as any)[key];
        if (!tri) return null;
        const isExpanded = expandedKeys[key];
        const decisionEntries = tri.allValues?.map(
          (entry: any) =>
            `${entry.value} ${entry.source ? `(source=${entry.source}${entry.pageId ? ` p${entry.pageId}` : ''})` : ''}`.trim()
        ) || [];
        const translatedKey =
          key === 'borrower_name'
            ? language === 'tr'
              ? 'Borçlu Adı'
              : 'Borrower Name'
            : key === 'property_address'
            ? language === 'tr'
              ? 'Mülk Adresi'
              : 'Property Address'
            : language === 'tr'
            ? 'Kredi Numarası'
            : 'Loan Number';
        const confidenceMap: Record<string, number> = { High: 0.9, Medium: 0.7, None: 0.0 };
        const fieldConf = confidenceMap[tri.confidence] ?? 0.5;

        return (
          <div
            key={key}
            className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md hover:border-black transition-all overflow-hidden group"
          >
            <div className="p-3 md:p-4 relative z-10">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="uppercase tracking-widest text-xs font-black text-gray-400 mb-1">
                    {translatedKey}
                  </h3>
                  <div className="text-lg font-bold text-gray-900 mb-2 break-words">
                    {tri.finalValue || <span className="text-gray-400 italic">{t.step4.notFound}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="bg-black text-white px-2.5 py-1 rounded-lg font-bold shadow-sm border border-black">
                      {t.step4.confidence}: {(fieldConf * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => toggleExpand(key)}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border border-gray-200 hover:bg-black hover:text-white hover:border-black transition-all group"
                >
                  {t.step4.decisionLog}
                  <svg
                    className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="bg-gray-50 border-t border-gray-200 p-6 animate-fade-in">
                {decisionEntries.length ? (
                  <div className="space-y-3">
                    {decisionEntries.map((entry, index) => (
                      <div
                        key={`${entry}-${index}`}
                        className="p-4 rounded-2xl border border-gray-200 bg-white shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                      >
                        <div className="text-sm font-semibold text-gray-900 break-words md:max-w-[60%]">
                          {entry}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">{t.step4.notFound}</p>
                )}
              </div>
            )}
          </div>
        );
      });
    }

    const fieldKeys = config?.extraction_schema ? Object.keys(config.extraction_schema) : FINAL_FIELDS;

    return fieldKeys.map((key) => {
      const value = (finalResult as any)[key] ?? (triangulated as any)?.[key]?.finalValue;
      const isExpanded = expandedKeys[key];
      const decisionEntries = (finalResult.decision_log as any)?.[key] || [];

      const translatedKey =
        key === 'borrower_name'
          ? language === 'tr'
            ? 'Borçlu Adı'
            : 'Borrower Name'
          : key === 'property_address'
          ? language === 'tr'
            ? 'Mülk Adresi'
            : 'Property Address'
          : language === 'tr'
          ? 'Kredi Numarası'
          : 'Loan Number';

      return (
        <div
          key={key}
          className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md hover:border-black transition-all overflow-hidden group"
        >
          <div className="p-3 md:p-4 relative z-10">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="uppercase tracking-widest text-xs font-black text-gray-400 mb-1">
                  {translatedKey}
                </h3>
                <div className="text-lg font-bold text-gray-900 mb-2 break-words">
                  {value || <span className="text-gray-400 italic">{t.step4.notFound}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {(() => {
                    const fieldConfidenceValue =
                      finalResult.field_confidence?.[key] ?? finalResult.confidence ?? 0;
                    return (
                      <span className="bg-black text-white px-2.5 py-1 rounded-lg font-bold shadow-sm border border-black">
                        {t.step4.confidence}: {confidenceLabel(fieldConfidenceValue)} -{" "}
                        {(fieldConfidenceValue * 100).toFixed(0)}%
                      </span>
                    );
                  })()}
                </div>
              </div>

              <button
                onClick={() => toggleExpand(key)}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border border-gray-200 hover:bg-black hover:text-white hover:border-black transition-all group"
              >
                {t.step4.decisionLog}
                <svg
                  className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {isExpanded && (
            <div className="bg-gray-50 border-t border-gray-200 p-6 animate-fade-in">
              {decisionEntries.length ? (
                <div className="space-y-3">
                  {decisionEntries.map((entry, index) => {
                    const parsed = parseDecisionEntry(entry);
                    return (
                      <div
                        key={`${entry}-${index}`}
                        className="p-4 rounded-2xl border border-gray-200 bg-white shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                      >
                        <div className="text-sm font-semibold text-gray-900 break-words md:max-w-[60%]">
                          {parsed.value || parsed.raw}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-widest justify-end">
                          {parsed.labelText && (
                            <span className="px-3 py-1 rounded-full bg-black text-white shadow-sm">
                              {parsed.labelText}
                            </span>
                          )}
                          {typeof parsed.page === 'number' && (
                            <span className="px-3 py-1 rounded-full border border-gray-200 text-gray-600 bg-gray-50">
                              {language === 'tr' ? `Sayfa ${parsed.page}` : `Page ${parsed.page}`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500">{t.step4.notFound}</p>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="space-y-10 animate-fade-in w-full relative">
      {configLoading && (
        <div className="px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-700">
          {language === 'tr' ? 'Yapılandırma yükleniyor...' : 'Loading configuration...'}
        </div>
      )}
      {configError && (
        <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-700">
          {configError}
        </div>
      )}
      {isFileUploaded && (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-0 animate-fade-in">
          <div className="relative px-4 py-3 rounded-lg" style={{
            backgroundImage: `
              linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px'
          }}>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight relative z-10">{t.title}</h1>
          </div>
        </div>
      )}

      {isFileUploaded && (
        <div className="relative mb-1 animate-fade-in w-full">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-100 -translate-y-1/2 z-0"></div>
          <div className="relative z-10 flex justify-between w-full">
            {[t.steps.input, t.steps.classification, t.steps.extraction, t.steps.triangulation].map(
              (label, index) => {
                const stepId = index + 1;
                return (
                  <div
                    key={label}
                    className="flex flex-col items-center cursor-pointer group flex-1"
                    onClick={() => setActiveStep(stepId)}
                  >
                    <div
                      className={`w-12 h-12 flex items-center justify-center rounded-full border-4 transition-all duration-300 shadow-sm relative z-10 ${
                        activeStep >= stepId
                          ? 'bg-black border-black text-white shadow-lg scale-110'
                          : 'bg-white border-gray-100 text-gray-300'
                      }`}
                    >
                      <span className="font-bold text-xs">{stepId}</span>
                    </div>
                    <span
                      className={`mt-3 text-xs font-black uppercase tracking-widest transition-colors duration-300 text-center px-1 ${
                        activeStep >= stepId ? 'text-black' : 'text-gray-300'
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </div>
      )}

      <div
        className={`bg-white rounded-3xl shadow-xl shadow-gray-100 border border-gray-200 transition-all relative overflow-hidden flex flex-col w-[calc(100vw-8rem)] max-w-none left-1/2 -translate-x-1/2 ${
          !isFileUploaded ? 'items-center justify-center p-6 md:p-8 lg:p-10 min-h-[600px]' : activeStep === 4 ? 'px-6 md:px-8 lg:px-10 pt-6 md:pt-8 lg:pt-10 pb-4 md:pb-6' : 'p-6 md:p-8 lg:p-10 min-h-[600px]'
        }`}
      >
        {activeStep === 1 && (
          <div className={`space-y-8 animate-fade-in flex-1 flex flex-col ${!isFileUploaded ? 'w-full h-full' : ''}`}>
            {!isFileUploaded && !isScanning && (
              <div className="flex-1 flex flex-col items-center justify-center py-10 w-full">
                <div
                  className="w-full max-w-2xl border-2 border-dashed border-gray-200 rounded-3xl p-16 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-gray-50 hover:border-black hover:scale-[1.01] transition-all duration-300 group"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".pdf"
                    onChange={handleFileChange}
                  />
                  <div className="w-24 h-24 bg-gray-50 text-gray-400 group-hover:bg-black group-hover:text-white rounded-3xl flex items-center justify-center mb-8 transition-colors duration-300 shadow-sm">
                    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </div>
                  <h4 className="text-2xl font-bold text-gray-900 mb-3">{t.step1.dragDrop}</h4>
                  <p className="text-gray-500 text-lg">{t.step1.orClick}</p>
                  <p className="text-xs text-gray-300 mt-8 uppercase tracking-widest font-bold">{t.step1.supported}</p>
                </div>
                {uploadError && (
                  <p className="text-sm text-red-600 font-semibold mt-6">
                    {uploadError}
                  </p>
                )}
              </div>
            )}

            {isScanning && (
              <div className="flex-1 flex flex-col items-center justify-center text-center w-full">
                <div className="w-full max-w-md">
                  <div className="w-full bg-gray-100 rounded-full h-3 mb-6 overflow-hidden">
                    <div className="bg-black h-3 rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                  </div>
                  <p className="text-gray-900 font-bold text-lg animate-pulse">
                    {currentStageId ? STAGE_LABELS[currentStageId]?.[language] || t.step1.analyzing : t.step1.analyzing}
                  </p>
                  {currentStageId && (
                    <p className="text-xs uppercase tracking-widest text-gray-500 mt-1">
                      {Math.max(1, stageStep.index)}/{stageStep.total}
                    </p>
                  )}
                  <p className="text-gray-400 mt-2 font-mono">{progress}%</p>
                </div>
              </div>
            )}

            {isFileUploaded && (
              <>
                {selectedPreview ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">{t.step1.title}</h3>
                        <p className="text-gray-500">{t.step3.page} {selectedPreview.id}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-black font-bold bg-gray-100 px-4 py-2 rounded-full border border-gray-200">
                          {selectedPreview.id} / {previewPages.length}
                        </span>
                        <Button variant="secondary" onClick={() => setSelectedPreview(null)}>
                          {t.buttons.prev}
                        </Button>
                      </div>
                    </div>
                    
                    <div className="bg-white border border-gray-200 rounded-2xl p-8 md:p-10 lg:p-12">
                      <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
                        <div>
                          <span className="font-mono text-xs font-bold bg-gray-100 border border-gray-200 px-3 py-1.5 rounded text-gray-900">
                            {t.step3.page} {selectedPreview.id}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              const currentIndex = previewPages.findIndex(p => p.id === selectedPreview.id);
                              if (currentIndex > 0) {
                                setSelectedPreview(previewPages[currentIndex - 1]);
                              }
                            }}
                            disabled={previewPages.findIndex(p => p.id === selectedPreview.id) === 0}
                            className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-black transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-sm"
                          >
                            {language === 'tr' ? '← Önceki' : '← Previous'}
                          </button>
                          <button
                            onClick={() => {
                              const currentIndex = previewPages.findIndex(p => p.id === selectedPreview.id);
                              if (currentIndex < previewPages.length - 1) {
                                setSelectedPreview(previewPages[currentIndex + 1]);
                              }
                            }}
                            disabled={previewPages.findIndex(p => p.id === selectedPreview.id) === previewPages.length - 1}
                            className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-black transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-sm"
                          >
                            {language === 'tr' ? 'Sonraki →' : 'Next →'}
                          </button>
                        </div>
                      </div>
                      <div className="overflow-auto max-h-[60vh] relative rounded-lg p-4" style={{
                        backgroundImage: `
                          linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px),
                          linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)
                        `,
                        backgroundSize: '20px 20px',
                        backgroundColor: '#fafafa'
                      }}>
                        <pre className="text-sm text-gray-900 font-mono whitespace-pre-wrap leading-relaxed break-words relative z-10">
                          {selectedPreview.rawText}
                        </pre>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-6">
                      {previewPages.map((page) => (
                        <button
                          key={page.id}
                          className="text-left border border-gray-200 rounded-2xl p-6 hover:shadow-lg hover:border-gray-300 transition-all bg-gray-50/50 flex flex-col h-72 group relative"
                          onClick={() => setSelectedPreview(page)}
                        >
                          <div className="flex justify-between items-center mb-4 border-b border-gray-200 pb-3">
                            <span className="font-mono text-xs font-bold bg-white border border-gray-200 px-2 py-1 rounded text-gray-900">
                              {t.step3.page} {page.id}
                            </span>
                            <span className="text-xs text-gray-900 uppercase font-black tracking-wider">{t.step1.source}</span>
                          </div>
                          <div className="flex-1 overflow-hidden relative">
                            <pre className="text-xs text-gray-900 font-mono whitespace-pre-wrap leading-relaxed h-full overflow-hidden transition-opacity">
                              {page.rawText}
                            </pre>
                            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-gray-50 to-transparent"></div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {activeStep === 2 && processedPages.length > 0 && (
          <div className="space-y-8 animate-fade-in">
            {docGroups.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {docGroups.map((group) => (
                  <div key={group.group_id} className="border border-gray-200 rounded-2xl p-4 bg-white shadow-sm">
                    <div className="text-xs uppercase tracking-widest text-gray-400 font-black mb-1">{t.step2.predicted}</div>
                    <div className="text-lg font-bold text-gray-900 mb-2">{displayLabel(group.label) || group.label}</div>
                    <div className="text-sm text-gray-600 font-mono">Pages: {group.pages.join(', ')}</div>
                    {typeof group.average_confidence === 'number' && (
                      <div className="text-xs text-gray-500 mt-1">
                        {language === 'tr' ? 'Ortalama güven' : 'Avg confidence'}: {(group.average_confidence * 100).toFixed(0)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
              {processedPages.map((page) => {
                const confidenceValue = page.confidence ?? 0;
                return (
                  <div
                    key={page.id}
                    className="border border-gray-200 rounded-2xl p-6 flex flex-col justify-between bg-white hover:border-black hover:shadow-md transition-all group"
                  >
                    <div className="flex items-center gap-4 mb-5">
                      <div className="w-12 h-12 rounded-xl bg-gray-50 group-hover:bg-black group-hover:text-white transition-colors flex items-center justify-center font-bold text-gray-500 shadow-inner text-sm">
                        {page.id}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-400 font-black uppercase tracking-widest mb-1">{t.step2.predicted}</div>
                        <div className="font-bold text-gray-900 text-sm truncate" title={page.predictedLabel || ''}>
                          {displayLabel(page.predictedLabel) || page.predictedLabel || DocumentLabel.UNKNOWN}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                      <div className="text-right">
                        <div className="text-xs text-gray-400 font-black uppercase tracking-widest">{t.step2.confidence}</div>
                        <div className="font-mono font-bold text-black text-sm">{(confidenceValue * 100).toFixed(0)}%</div>
                      </div>
                      <span className="px-4 py-1.5 rounded-full text-sm font-bold shadow-sm border bg-white text-black border-black">
                        {confidenceValue > 0.9 ? t.step2.high : t.step2.review}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeStep === 3 && (
          <div className="space-y-8 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-6">
              {(isFileUploaded ? processedPages : MOCK_PAGES).map((page) => {
                const orderedFields = {
                  borrower_name: page.extractedFields?.borrower_name,
                  property_address: page.extractedFields?.property_address,
                  loan_number: page.extractedFields?.loan_number,
                };

                return (
                  <div key={page.id} className="border border-gray-200 rounded-2xl overflow-hidden flex flex-col shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 bg-white">
                    <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                      <span className="font-bold text-xs text-gray-500 uppercase tracking-wider truncate pr-2" title={page.predictedLabel}>
                        {displayLabel(page.predictedLabel) || page.predictedLabel}
                      </span>
                      <span className="text-xs font-bold bg-white border border-gray-200 px-2 py-1 rounded shadow-sm text-gray-800">{t.step3.page} {page.id}</span>
                    </div>
                    <div className="p-5 bg-white flex-1">
                      <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap leading-relaxed">
                        {JSON.stringify(orderedFields, null, 2)}
                      </pre>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeStep === 4 && finalResult && (
          <div className="animate-fade-in">
            <div className="space-y-2">
              <h4 className="font-black text-gray-900 uppercase tracking-widest text-xs border-b border-gray-200 pb-4 mb-2">{t.step4.finalRecord}</h4>
              {renderFinalCards()}
            </div>
          </div>
        )}
      </div>

      {isFileUploaded && (
        <div className={`flex ${activeStep === 1 ? 'justify-end' : activeStep === 4 ? 'justify-start' : 'justify-between'} items-center pt-0 animate-fade-in border-t border-gray-100 ${activeStep === 4 ? '-mt-6' : '-mt-4'}`}>
          {activeStep !== 1 && (
            <Button
              variant="secondary"
              onClick={() => setActiveStep(Math.max(1, activeStep - 1))}
              className="px-8 py-4 text-base rounded-2xl border-2 border-gray-200 hover:border-black transition-all duration-300 flex items-center gap-3 group"
            >
              <svg className="w-5 h-5 transition-transform duration-300 group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              {t.buttons.prev}
            </Button>
          )}
          {activeStep !== 4 && (
            <Button
              variant="primary"
              onClick={() => setActiveStep(Math.min(4, activeStep + 1))}
              disabled={!isFileUploaded}
              className="px-10 py-4 text-base rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all duration-300 bg-white text-black border-2 border-black flex items-center gap-3 group hover:bg-black hover:text-white"
            >
              {t.buttons.next}
              <svg className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Button>
          )}
        </div>
      )}

    </div>
  );
};
