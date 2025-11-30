
import React, { useEffect, useState } from 'react';
import { PipelineDemo } from './components/PipelineDemo';
import { translations } from './translations';
import { Language } from './types';
import { fetchConfig } from './services/pipelineService';

const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>('tr');
  const [resetKey, setResetKey] = useState(0);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [config, setConfig] = useState<any>(null);
  const t = translations[language];

  useEffect(() => {
    setConfigLoading(true);
    fetchConfig()
      .then((payload) => setConfig(payload))
      .catch((error) => setConfigError(error instanceof Error ? error.message : 'Config yüklenemedi'))
      .finally(() => setConfigLoading(false));
  }, []);

  return (
    <div className="min-h-screen text-gray-900 font-sans selection:bg-black selection:text-white flex flex-col" style={{
      backgroundImage: `
        linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)
      `,
      backgroundSize: '20px 20px',
      backgroundColor: '#fafafa'
    }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 px-6 py-4 md:px-12 flex items-center justify-between shadow-sm">
        {/* Logo / Title area */}
        <div className="flex items-center gap-4">
           <div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center font-black text-xl shadow-md shadow-gray-300">G</div>
           <div>
             <h1 className="text-lg font-bold tracking-tight text-gray-900 leading-tight">{t.sidebar.title}</h1>
             <p className="text-xs text-gray-500 font-medium">{t.sidebar.subtitle}</p>
           </div>
        </div>

        {/* Middle section - Reset button */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setResetKey(prev => prev + 1)}
            className="px-4 py-2 text-sm font-bold text-gray-700 hover:text-black border border-gray-200 hover:border-black rounded-lg transition-all bg-white hover:bg-gray-50"
          >
            {language === 'tr' ? 'Yeni PDF Yükle' : 'Upload New PDF'}
          </button>
        </div>

        {/* Language Toggle */}
        <div className="bg-gray-100 p-1 rounded-full flex relative cursor-pointer w-48 h-10" onClick={() => setLanguage(language === 'en' ? 'tr' : 'en')}>
           <div 
              className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-full shadow-sm transition-all duration-300 ease-spring ${language === 'en' ? 'left-1' : 'left-[calc(50%+2px)]'}`}
           ></div>
           <button 
             className={`flex-1 relative z-10 text-xs font-bold transition-colors duration-300 ${language === 'en' ? 'text-black' : 'text-gray-500'}`}
           >
             English
           </button>
           <button 
             className={`flex-1 relative z-10 text-xs font-bold transition-colors duration-300 ${language === 'tr' ? 'text-black' : 'text-gray-500'}`}
           >
             Türkçe
           </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[1800px] mx-auto p-4 md:p-6 lg:p-8">
        <PipelineDemo
          key={resetKey}
          language={language}
          config={config}
          configLoading={configLoading}
          configError={configError}
        />
      </main>
    </div>
  );
};

export default App;
