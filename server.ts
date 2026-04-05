import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // --- CONFIG & PROMPTS ---
  const GEMINI_MODEL = (process.env.GEMINI_MODEL || "gemini-3-flash-preview").trim().replace(/^["']|["']$/g, '');
  const GEMINI_API_KEY = (process.env.MY_OWN_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim().replace(/^["']|["']$/g, '');

  function buildListingPrompt(title: string, description: string, price: number | null, useSearch: boolean): string {
    const safeTitle = title?.trim() || "нет данных";
    const safeDesc = description?.trim() || "нет данных";
    const safePrice = price ? `${price} RUB` : "нет данных";

    const searchInstruction = useSearch 
      ? `**ВАЖНО:** Используй Google Search, чтобы найти АКТУАЛЬНЫЕ цены на Avito для этой модели и объема памяти ПРЯМО СЕЙЧАС. Не полагайся на свои старые знания.`
      : `**ВНИМАНИЕ:** Поиск в реальном времени сейчас недоступен. Используй свои знания о рынке iPhone на начало 2024 года, но сделай поправку на то, что сейчас 2026 год (цены должны быть ниже).`;

    return `
Ты — Senior Product Designer, Growth-специалист и эксперт по рынку iPhone.
Твоя задача: проанализировать объявление с Avito и дать честный, жесткий и точный вердикт.

${searchInstruction}

Данные объявления:
ЗАГОЛОВОК: ${safeTitle}
ЦЕНА: ${safePrice}
ОПИСАНИЕ: ${safeDesc}

Алгоритм анализа:
1. Идентификация: Модель, объем памяти.
2. Поиск рынка: ${useSearch ? 'Используй Google Search для поиска "iPhone [модель] [память] avito цена бу". Найди минимальные и средние цены.' : 'Вспомни средние цены на б/у рынке для этой модели.'}
3. Оценка состояния: Ищи скрытые дефекты (замена экрана, не работает Face ID, True Tone, АКБ < 85%, трещины, сколы).
4. Рыночная оценка:
   - market_value_perfect: Реальная цена за ИДЕАЛЬНЫЙ б/у аппарат сегодня.
   - market_value_current: Реальная цена ЭТОГО аппарата с учетом его дефектов и износа.
   - Считай математически: База минус штрафы за каждый дефект.
5. Риски: Оцени продавца и описание. Если описание слишком короткое или подозрительно дешево — это риск.
6. Вердикт: Однозначный совет (БРАТЬ / ТОРГОВАТЬСЯ / ИГНОРИРОВАТЬ).

Тон: Профессиональный, лаконичный, без воды. Только на русском языке.
Верни ТОЛЬКО JSON в формате:
{
  "model": "iPhone 14 Pro",
  "storage_gb": 256,
  "condition_label": "Отличное",
  "condition_details": "Минимальные следы износа",
  "market_value_perfect": "90 000 руб",
  "market_value_current": "82 000 руб",
  "price_diff_percent": -5,
  "verdict": "МОЖНО БРАТЬ",
  "risk_level": "Низкий",
  "risk_reasons": ["Проверенный продавец", "Оригинальные детали"],
  "analysis_steps": ["База: 90к", "-8к за АКБ 88%"],
  "summary": "Хорошее предложение.",
  "search_used": ${useSearch}
}
`;
  }

  // --- UTILS ---
  async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 3000): Promise<T> {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        const errorStr = JSON.stringify(error);
        const isRateLimit = error.message?.includes("429") || error.status === 429 || errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED");
        
        if (isRateLimit && i < maxRetries - 1) {
          const delay = initialDelay * Math.pow(2, i);
          console.log(`Quota/Rate limit hit. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  function extractPrice(text: string): number | null {
    const cleanedText = text.replace(/\s/g, "");
    const nums = cleanedText.match(/\d{4,7}/g);
    if (!nums) return null;
    const validNums = nums.map(Number).filter(n => n > 5000);
    return validNums.length > 0 ? validNums[0] : null;
  }

  function cleanJsonString(text: string): string {
    let cleaned = text.trim();
    if (cleaned.includes("```")) {
      const parts = cleaned.split("```");
      for (const part of parts) {
        if (part.includes("{") && part.includes("}")) {
          cleaned = part.replace(/json/g, "").trim();
          break;
        }
      }
    }
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      return cleaned.substring(start, end + 1);
    }
    return cleaned;
  }

  // --- ENDPOINTS ---
  app.post("/api/analyze", async (req, res) => {
    console.log("Received /api/analyze request:", req.body);
    try {
      const { text } = req.body;
      if (!text || text.trim().length < 5) {
        return res.status(400).json({ detail: "Текст или ссылка слишком короткие" });
      }

      if (!GEMINI_API_KEY || GEMINI_API_KEY === "your_api_key_here") {
        return res.status(500).json({ 
          detail: "GEMINI_API_KEY не настроен. Пожалуйста, добавьте ваш API ключ в панель 'Secrets' (кнопка в верхнем меню AI Studio) с названием GEMINI_API_KEY." 
        });
      }

      const trimmedText = text.trim();
      const isUrl = trimmedText.startsWith("http");
      
      if (isUrl && !trimmedText.toLowerCase().includes("avito.ru")) {
        return res.status(400).json({ detail: "Поддерживаются только ссылки на Avito" });
      }

      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      
      // Normalize model name: remove 'models/' prefix if present, then use it as is
      // unless it's a prohibited one.
      let modelName = GEMINI_MODEL.replace(/^models\//, "").trim();
      if (modelName === "gemini-1.5-flash" || modelName === "gemini-1.5-pro" || modelName === "gemini-pro") {
        modelName = "gemini-3-flash-preview";
      }
      
      console.log(`Final model name for API: ${modelName}`);
      
      if (!GEMINI_API_KEY) {
        throw new Error("API key is missing. Please add MY_OWN_KEY in Secrets.");
      }
      let prompt = "";
      let tools: any[] = [];

      const buildUrlPrompt = (url: string, useSearch: boolean) => {
        const searchInstruction = useSearch 
          ? `**ВАЖНО:** Используй Google Search, чтобы найти АКТУАЛЬНЫЕ цены на Avito для этой модели и объема памяти ПРЯМО СЕЙЧАС. Сравнивай цену из объявления с реальными рыночными данными.`
          : `**ВНИМАНИЕ:** Поиск в реальном времени сейчас недоступен. Используй свои знания о рынке iPhone на начало 2024 года, но сделай поправку на то, что сейчас 2026 год (цены должны быть ниже).`;

        return `
Ты — Senior Product Designer и эксперт по рынку iPhone. 
Проанализируй объявление Avito по этой ссылке: ${url}. 
Изучи описание, характеристики и фотографии. 

${searchInstruction}

Твоя задача: дать честный, жесткий и точный вердикт.
Алгоритм анализа:
1. Идентификация: Модель, объем памяти.
2. Поиск рынка: ${useSearch ? 'Используй Google Search для поиска "iPhone [модель] [память] avito цена бу".' : 'Вспомни средние цены на б/у рынке для этой модели.'}
3. Оценка состояния: Ищи скрытые дефекты.
4. Рыночная оценка:
   - market_value_perfect: Реальная цена за ИДЕАЛЬНЫЙ б/у аппарат сегодня.
   - market_value_current: Реальная цена ЭТОГО аппарата с учетом дефектов.
5. Риски: Оцени продавца и описание.
6. Вердикт: Однозначный совет (БРАТЬ / ТОРГОВАТЬСЯ / ИГНОРИРОВАТЬ).

Тон: Профессиональный, лаконичный. Только на русском языке.
Верни ТОЛЬКО JSON в формате:
{
  "model": "iPhone 14 Pro",
  "storage_gb": 256,
  "condition_label": "Отличное",
  "condition_details": "Минимальные следы износа",
  "market_value_perfect": "90 000 руб",
  "market_value_current": "82 000 руб",
  "price_diff_percent": -5,
  "verdict": "МОЖНО БРАТЬ",
  "risk_level": "Низкий",
  "risk_reasons": ["Проверенный продавец", "Оригинальные детали"],
  "analysis_steps": ["База: 90к", "-8к за АКБ 88%"],
  "summary": "Хорошее предложение.",
  "search_used": ${useSearch}
}
`;
      };

      const runAnalysis = async (useSearch: boolean) => {
        let prompt = "";
        let tools: any[] = [];

        if (isUrl) {
          prompt = buildUrlPrompt(trimmedText, useSearch);
          tools = [{ urlContext: {} }];
        } else {
          const lines = text.split("\n").filter((l: string) => l.trim().length > 0);
          const title = lines.length > 0 ? lines[0] : "Без названия";
          const price = extractPrice(text);
          prompt = buildListingPrompt(title, text, price, useSearch);
        }

        const config: any = {
          tools: [
            ...(tools.length > 0 ? tools : []),
          ],
        };

        if (useSearch) {
          config.tools.push({ googleSearch: {} });
        }

        return await withRetry(() => ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config
        }));
      };

      let response;
      try {
        response = await runAnalysis(true);
      } catch (error: any) {
        const errorStr = JSON.stringify(error);
        const isQuotaError = error.message?.includes("429") || error.status === 429 || errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED");
        
        if (isQuotaError) {
          console.log("Google Search quota hit or general 429. Retrying WITHOUT search...");
          response = await runAnalysis(false);
        } else {
          throw error;
        }
      }

      const rawText = response.text || "";
      const cleaned = cleanJsonString(rawText);
      const parsed = JSON.parse(cleaned);

      const defaults = {
        model: "Неизвестно",
        storage_gb: null,
        condition_label: "Неизвестно",
        condition_details: "Нет данных",
        market_value_perfect: "н/д",
        market_value_current: "н/д",
        price_diff_percent: 0,
        verdict: "НУЖЕН ТЕКСТ",
        risk_level: "Средний",
        risk_reasons: [],
        analysis_steps: [],
        summary: "Ошибка анализа",
        search_used: true,
      };

      const result = { ...defaults, ...parsed };
      res.json(result);
    } catch (error: any) {
      console.error("Error:", error);
      const errorStr = JSON.stringify(error);
      
      if (errorStr.includes("API_KEY_INVALID") || error.message?.includes("API key not valid")) {
        return res.status(401).json({ 
          detail: "Ваш API ключ недействителен. Пожалуйста, проверьте его в панели 'Secrets' в AI Studio. Убедитесь, что ключ скопирован полностью и без лишних пробелов." 
        });
      }

      const isRateLimit = error.message?.includes("429") || error.status === 429 || errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED");
      
      if (isRateLimit) {
        return res.status(429).json({ 
          detail: "Лимит запросов Gemini API исчерпан. Пожалуйста, подождите некоторое время (обычно 1-2 минуты) или проверьте настройки биллинга в Google AI Studio." 
        });
      }
      res.status(500).json({ detail: `Ошибка анализа: ${error.message}` });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ detail: `Внутренняя ошибка сервера: ${err.message || "Неизвестная ошибка"}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
