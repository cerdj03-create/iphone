import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIG ---
const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_API_KEY = (process.env.MY_OWN_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim().replace(/^["']|["']$/g, '');
console.log("Using Gemini Model:", GEMINI_MODEL);

// --- JSON SCHEMA ---
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    model: { type: Type.STRING, description: "Модель iPhone" },
    storage_gb: { type: Type.INTEGER, description: "Объем памяти в ГБ" },
    condition_label: { type: Type.STRING, description: "Краткая оценка состояния (напр. Отличное)" },
    condition_details: { type: Type.STRING, description: "Детали состояния" },
    market_value_perfect: { type: Type.STRING, description: "Цена за идеальный б/у аппарат" },
    market_value_current: { type: Type.STRING, description: "Реальная цена этого аппарата" },
    price_diff_percent: { type: Type.NUMBER, description: "Процент выгоды или переплаты" },
    verdict: { type: Type.STRING, description: "Вердикт (БРАТЬ / ТОРГОВАТЬСЯ / ИГНОРИРОВАТЬ)" },
    risk_level: { type: Type.STRING, description: "Уровень риска (Низкий / Средний / Высокий)" },
    risk_reasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Причины рисков" },
    analysis_steps: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Шаги анализа цен" },
    summary: { type: Type.STRING, description: "Итоговое резюме" },
    search_used: { type: Type.BOOLEAN, description: "Был ли использован поиск" }
  },
  required: ["model", "verdict", "market_value_current", "summary"]
};

// --- HELPERS ---
function buildListingPrompt(title: string, description: string, price: number | null, useSearch: boolean): string {
  const safeTitle = title?.trim() || "нет данных";
  const safeDesc = description?.trim() || "нет данных";
  const safePrice = price ? `${price} RUB` : "нет данных";

  return `
Ты — эксперт по рынку iPhone. Проанализируй объявление:
ЗАГОЛОВОК: ${safeTitle}
ЦЕНА: ${safePrice}
ОПИСАНИЕ: ${safeDesc}

${useSearch ? 'ОБЯЗАТЕЛЬНО используй Google Search, чтобы найти текущие цены на Avito для этой модели.' : 'Используй свои знания о рынке.'}
Дай честный вердикт: стоит ли это покупать.
`;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, initialDelay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorStr = JSON.stringify(error);
      const isQuotaError = error.message?.includes("429") || errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED");
      
      if (isQuotaError && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.log(`Rate limit hit, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// ... (extractPrice remains same)

// --- API ROUTES ---
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", model: GEMINI_MODEL });
});

app.post("/api/analyze", async (req, res) => {
  console.log("Starting analysis...");
  try {
    const { text } = req.body;
    if (!text || text.trim().length < 5) {
      return res.status(400).json({ detail: "Текст или ссылка слишком короткие" });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ detail: "GEMINI_API_KEY missing" });
    }

    const trimmedText = text.trim();
    const isUrl = trimmedText.startsWith("http");
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    const runAnalysis = async (useSearch: boolean) => {
      let prompt = "";
      let tools: any[] = [];

      if (isUrl) {
        prompt = `Проанализируй iPhone по ссылке: ${trimmedText}. ${useSearch ? 'Используй поиск для оценки рынка.' : ''} Верни результат в JSON.`;
        tools = [{ urlContext: {} }];
      } else {
        const price = extractPrice(text);
        prompt = buildListingPrompt("Объявление", text, price, useSearch);
      }

      if (useSearch) {
        tools.push({ googleSearch: {} });
      }

      const config: any = { 
        tools,
        responseMimeType: "application/json",
        responseSchema,
        toolConfig: tools.length > 1 ? { includeServerSideToolInvocations: true } : undefined
      };

      const response = await withRetry(() => ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config
      }));

      return JSON.parse(response.text || "{}");
    };

    let result;
    try {
      console.log("Attempting analysis with Search...");
      result = await runAnalysis(true);
      result.search_used = true;
    } catch (e: any) {
      const errorStr = JSON.stringify(e);
      const isQuota = errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED");
      
      if (isQuota) {
        console.log("Search quota exceeded, falling back to basic analysis...");
        result = await runAnalysis(false);
        result.search_used = false;
      } else {
        throw e;
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error("Final Analysis Error:", error);
    const errorStr = JSON.stringify(error);
    if (errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED")) {
      return res.status(429).json({ 
        detail: "Лимит запросов Gemini API временно исчерпан. Пожалуйста, подождите 1-2 минуты и попробуйте снова. Это ограничение бесплатного уровня Google AI Studio." 
      });
    }
    res.status(500).json({ detail: error.message || "Ошибка анализа" });
  }
});

// --- SERVER STARTUP ---
async function start() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    console.log("Starting Vite middleware...");
    const { createServer: createViteServer } = await import("vite");
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

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

start();
export default app;
