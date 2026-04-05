import React, { useState, useEffect } from "react";
import { Search, AlertCircle, Zap, Smartphone } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Types
interface AnalysisResult {
  model: string;
  storage_gb: number | null;
  condition_label: string;
  condition_details: string;
  market_value_perfect: string;
  market_value_current: string;
  price_diff_percent: number;
  verdict: string;
  risk_level: string;
  risk_reasons: string[];
  analysis_steps: string[];
  summary: string;
  search_used?: boolean;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: any;
    };
  }
}

export default function App() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      window.Telegram.WebApp.setHeaderColor('#F1F2F6');
    }
  }, []);

  const handleAnalyze = async () => {
    if (!text.trim() || text.trim().length < 5) {
      setError("Вставьте ссылку или текст");
      return;
    }
    
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Лимит запросов исчерпан. Пожалуйста, подождите 1-2 минуты и попробуйте снова.");
        }
        throw new Error(data.detail || "Ошибка сервера");
      }

      setResult(data);
      
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
      }
    } catch (err: any) {
      setError(err.message);
      if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
      }
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (level: string) => {
    const l = level?.toLowerCase() || "";
    if (l.includes("низкий")) return "text-emerald-500";
    if (l.includes("средний")) return "text-amber-500";
    return "text-rose-500";
  };

  const getRiskBg = (level: string) => {
    const l = level?.toLowerCase() || "";
    if (l.includes("низкий")) return "bg-emerald-50";
    if (l.includes("средний")) return "bg-amber-50";
    return "bg-rose-50";
  };

  return (
    <div className="min-h-screen bg-[#F1F2F6] p-4 font-sans text-[#1C1C1E] selection:bg-indigo-100">
      <header className="mb-6 flex flex-col items-center text-center">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"
        >
          <Smartphone size={24} />
        </motion.div>
        <h1 className="text-xl font-extrabold tracking-tight">iPhone Эксперт</h1>
        <p className="text-xs font-medium text-[#8E8E93]">Оценка Avito за 5 секунд</p>
      </header>

      <main className="mx-auto max-w-md space-y-4">
        {/* Input Section */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="rounded-[24px] bg-white p-4 shadow-sm border border-white"
        >
          <textarea
            className="w-full min-h-[100px] bg-transparent resize-none focus:outline-none text-[15px] leading-relaxed placeholder:text-[#C7C7CC]"
            placeholder="Вставьте ссылку на Avito..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            onClick={handleAnalyze}
            disabled={loading || !text.trim()}
            className="mt-3 w-full rounded-2xl bg-indigo-600 py-4 font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <span>Анализируем...</span>
              </div>
            ) : (
              "ПРОВЕРИТЬ ОБЪЯВЛЕНИЕ"
            )}
          </button>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-600"
            >
              <AlertCircle size={14} /> {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4 pb-10"
            >
              {/* Verdict Card */}
              <div className="rounded-[28px] bg-white p-5 shadow-sm border border-white">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-black">{result.model}</h2>
                    <p className="text-xs font-bold text-[#8E8E93]">{result.storage_gb} ГБ • {result.condition_label}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className={`rounded-xl px-3 py-1 text-[10px] font-black uppercase ${getRiskBg(result.risk_level)} ${getRiskColor(result.risk_level)}`}>
                      {result.risk_level} РИСК
                    </div>
                    {result.search_used === false && (
                      <div className="text-[9px] font-bold text-amber-600 flex items-center gap-0.5">
                        <AlertCircle size={8} /> Без поиска
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-5 rounded-2xl bg-[#1C1C1E] p-4 text-center">
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Вердикт AI</div>
                  <div className="text-xl font-black text-white tracking-tight">{result.verdict}</div>
                </div>

                {/* Price Logic */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4">
                    <div>
                      <div className="text-[10px] font-black uppercase text-emerald-600/70">Рынок (для этого сост.)</div>
                      <div className="text-lg font-black text-emerald-900">{result.market_value_current}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-black uppercase text-emerald-600/70">Отклонение</div>
                      <div className={`text-lg font-black ${result.price_diff_percent > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {result.price_diff_percent > 0 ? '+' : ''}{result.price_diff_percent}%
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#F8F9FB] p-4">
                    <div className="mb-2 text-[10px] font-black uppercase text-[#8E8E93]">Как мы считали:</div>
                    <div className="space-y-1">
                      {result.analysis_steps.map((step, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-medium text-[#1C1C1E]">
                          <div className="h-1 w-1 rounded-full bg-indigo-400" />
                          {step}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Risks */}
                {result.risk_reasons.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-[10px] font-black uppercase text-[#8E8E93] px-1">Факторы риска:</div>
                    <div className="flex flex-wrap gap-2">
                      {result.risk_reasons.map((reason, i) => (
                        <div key={i} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-600 border border-rose-100">
                          ⚠️ {reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="rounded-2xl bg-indigo-600 p-4 text-white shadow-lg shadow-indigo-100">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase opacity-60">
                  <Zap size={10} /> Резюме
                </div>
                <p className="text-sm font-medium leading-relaxed">{result.summary}</p>
                {result.search_used === false && (
                  <p className="mt-2 text-[10px] font-bold text-white/70 italic">
                    * Данные основаны на исторических знаниях, так как поиск в реальном времени временно недоступен.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
