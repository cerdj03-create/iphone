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

      // Проверяем, что сервер вернул JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const errorText = await response.text();
        console.error("Non-JSON response:", errorText);
        throw new Error(`Сервер вернул некорректный ответ. Возможно, бэкенд не запущен или произошла ошибка конфигурации Vercel. Статус: ${response.status}`);
      }

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
    <div className="min-h-screen bg-[#09090B] p-4 font-sans text-white selection:bg-indigo-500/30">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] rounded-full bg-purple-600/10 blur-[100px]" />
      </div>

      <header className="relative mb-8 flex flex-col items-center text-center pt-4">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-xl shadow-indigo-500/20"
        >
          <Smartphone size={28} />
        </motion.div>
        <h1 className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
          iPhone Эксперт
        </h1>
        <p className="text-sm font-medium text-white/40 mt-1">Профессиональный анализ объявлений Avito</p>
      </header>

      <main className="relative mx-auto max-w-md space-y-6">
        {/* Input Section */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="rounded-[32px] bg-white/[0.03] backdrop-blur-xl p-5 border border-white/10 shadow-2xl"
        >
          <div className="relative">
            <textarea
              className="w-full min-h-[120px] bg-transparent resize-none focus:outline-none text-[16px] leading-relaxed placeholder:text-white/20 text-white/90"
              placeholder="Вставьте ссылку на Avito или текст объявления..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {!text && (
              <div className="absolute bottom-2 right-2 pointer-events-none opacity-20">
                <Search size={20} />
              </div>
            )}
          </div>
          <button
            onClick={handleAnalyze}
            disabled={loading || !text.trim()}
            className="mt-4 w-full relative group overflow-hidden rounded-2xl bg-indigo-600 py-4.5 font-bold text-white transition-all active:scale-[0.98] disabled:opacity-30"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 opacity-100 group-hover:opacity-90 transition-opacity" />
            <span className="relative flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  <span>АНАЛИЗИРУЕМ...</span>
                </>
              ) : (
                <>
                  <Zap size={18} className="fill-current" />
                  <span>ПРОВЕРИТЬ СЕЙЧАС</span>
                </>
              )}
            </span>
          </button>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 p-4 text-sm font-bold text-rose-400"
            >
              <AlertCircle size={18} /> {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5 pb-20"
            >
              {/* Main Result Card */}
              <div className="rounded-[32px] bg-white/[0.03] backdrop-blur-xl p-6 border border-white/10 shadow-2xl overflow-hidden relative">
                {/* Verdict Badge Background */}
                <div className={`absolute top-0 right-0 w-32 h-32 blur-[60px] opacity-20 ${
                  result.verdict.toLowerCase().includes('брать') ? 'bg-emerald-500' : 
                  result.verdict.toLowerCase().includes('торг') ? 'bg-amber-500' : 'bg-rose-500'
                }`} />

                <div className="relative">
                  <div className="mb-6 flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-black tracking-tight">{result.model}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold text-white/40 uppercase tracking-wider">
                          {result.storage_gb} GB • {result.condition_label}
                        </span>
                      </div>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-tighter border ${
                      result.risk_level.toLowerCase().includes('низкий') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 
                      result.risk_level.toLowerCase().includes('средний') ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 
                      'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    }`}>
                      {result.risk_level} РИСК
                    </div>
                  </div>

                  <div className="mb-8 text-center">
                    <div className="inline-block px-6 py-4 rounded-3xl bg-white/5 border border-white/10 shadow-inner">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-2">Вердикт Эксперта</div>
                      <div className={`text-3xl font-black tracking-tighter ${
                        result.verdict.toLowerCase().includes('брать') ? 'text-emerald-400' : 
                        result.verdict.toLowerCase().includes('торг') ? 'text-amber-400' : 'text-rose-400'
                      }`}>
                        {result.verdict}
                      </div>
                    </div>
                  </div>

                  {/* Price Comparison Grid */}
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="rounded-2xl bg-white/5 p-4 border border-white/5">
                      <div className="text-[10px] font-black uppercase text-white/30 mb-1">Рыночная цена</div>
                      <div className="text-lg font-black text-white/90">{result.market_value_current}</div>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-4 border border-white/5">
                      <div className="text-[10px] font-black uppercase text-white/30 mb-1">Выгода/Переплата</div>
                      <div className={`text-lg font-black ${result.price_diff_percent <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {result.price_diff_percent > 0 ? '+' : ''}{result.price_diff_percent}%
                      </div>
                    </div>
                  </div>

                  {/* Analysis Steps */}
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-white/5 p-5 border border-white/5">
                      <h3 className="text-[10px] font-black uppercase text-white/30 mb-3 tracking-widest">Логика оценки:</h3>
                      <div className="space-y-2">
                        {result.analysis_steps.map((step, i) => (
                          <div key={i} className="flex items-start gap-3 text-sm text-white/70">
                            <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                            <span className="font-medium">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Risks */}
                    {result.risk_reasons.length > 0 && (
                      <div className="rounded-2xl bg-rose-500/5 p-5 border border-rose-500/10">
                        <h3 className="text-[10px] font-black uppercase text-rose-400/50 mb-3 tracking-widest">Факторы риска:</h3>
                        <div className="flex flex-wrap gap-2">
                          {result.risk_reasons.map((reason, i) => (
                            <div key={i} className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-[11px] font-bold text-rose-400 border border-rose-500/20">
                              ⚠️ {reason}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary Card */}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-[28px] bg-gradient-to-br from-indigo-600 to-purple-700 p-6 text-white shadow-2xl shadow-indigo-500/20 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Zap size={80} />
                </div>
                <div className="relative">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-70">
                    <Zap size={12} className="fill-current" /> Итоговое резюме
                  </div>
                  <p className="text-[15px] font-semibold leading-relaxed text-white/90">
                    {result.summary}
                  </p>
                  {result.search_used === false && (
                    <div className="mt-4 pt-4 border-t border-white/10 text-[10px] font-bold text-white/40 italic">
                      * Анализ выполнен на основе базы знаний (поиск временно недоступен)
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
