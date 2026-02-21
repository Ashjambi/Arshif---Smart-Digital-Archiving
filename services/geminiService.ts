
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

// Helper to safely access API Key without crashing if process is undefined
const getApiKey = (): string => {
  try {
    // @ts-ignore
    const key = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
    if (!key) {
      console.warn("API Key is missing or empty");
    } else {
      console.log("API Key found (length):", key.length);
    }
    return key;
  } catch (e) {
    console.error("API Key Access Error:", e);
    return "";
  }
};

/**
 * Strict JSON parsing with fallback cleanup
 */
const parseGeminiJSON = (text: string): any => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    try {
      // Remove code blocks
      let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
      // Find JSON object
      const firstBrace = clean.indexOf('{');
      const lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        clean = clean.substring(firstBrace, lastBrace + 1);
        return JSON.parse(clean);
      }
      return null;
    } catch (finalError) {
      console.error("JSON Parse Failed. Raw Text:", text);
      return null;
    }
  }
};

const retryOperation = async <T>(operation: () => Promise<T>, retries = 2, delay = 2000): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryOperation(operation, retries - 1, delay * 2);
  }
};

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export const analyzeSpecificFile = async (
  fileName: string, 
  contentOrBase64: string,
  mimeType?: string,
  isBinary: boolean = false
): Promise<Partial<ISOMetadata>> => {
  try {
    // Note: API key selection should be handled by the caller (UI) to avoid loops
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("API_KEY غير موجود. يرجى تحديد مفتاح API.");
    }

    const ai = new GoogleGenAI({ apiKey });
    // Use Pro model for better reasoning and accuracy
    const model = "gemini-3.1-pro-preview";
    
    const promptText = `
    أنت خبير أرشفة رقمية محترف. قم بتحليل الملف المرفق "${fileName}" بدقة عالية جداً واستخرج البيانات التالية بتنسيق JSON حصراً.
    
    التعليمات:
    1. استخرج العنوان الرسمي للوثيقة بدقة.
    2. اكتب ملخصاً تنفيذياً شاملاً وواضحاً يغطي جميع النقاط الرئيسية في الوثيقة.
    3. حدد نوع الوثيقة بدقة (عقد، فاتورة، خطاب، تقرير، إلخ).
    4. استخرج اسم الجهة المرسلة واسم الجهة المستلمة.
    5. استخرج تاريخ الوثيقة الكامل.
    6. حدد درجة الأهمية (عادي، مهم، سري، سري للغاية) بناءً على محتوى الوثيقة وسياقها.
    7. استخرج رقم القيد أو الرقم الإشاري إن وجد.
    
    تنسيق JSON المطلوب:
    {
      "title": "العنوان الدقيق",
      "executiveSummary": "الملخص التفصيلي",
      "documentType": "نوع الوثيقة",
      "sender": "المرسل",
      "recipient": "المستلم",
      "fullDate": "التاريخ (YYYY-MM-DD)",
      "importance": "عادي/مهم/سري",
      "incomingNumber": "رقم القيد"
    }
    `;

    const parts: any[] = isBinary && mimeType 
      ? [{ inlineData: { mimeType, data: contentOrBase64 } }, { text: promptText }]
      : [{ text: promptText }, { text: `المحتوى النصي للوثيقة:\n${contentOrBase64.substring(0, 100000)}` }];

    const generate = async () => {
      return await ai.models.generateContent({
        model: model,
        contents: [{ parts }],
        config: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              executiveSummary: { type: Type.STRING },
              documentType: { type: Type.STRING },
              sender: { type: Type.STRING },
              recipient: { type: Type.STRING },
              incomingNumber: { type: Type.STRING },
              fullDate: { type: Type.STRING },
              importance: { type: Type.STRING }
            },
            required: ["title", "executiveSummary"]
          },
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ]
        }
      });
    };

    const response = await retryOperation(generate);
    
    // Check for safety blocks
    if (!response.candidates || response.candidates.length === 0) {
      return {
        title: fileName,
        executiveSummary: "فشل التحليل: تم حظر المحتوى لأسباب أمنية (Safety Block).",
        status: ArchiveStatus.IN_PROCESS
      };
    }

    const result = parseGeminiJSON(response.text);
    if (!result) {
      return {
        title: fileName,
        executiveSummary: "فشل التحليل: استجابة غير صالحة من المصدر (Invalid JSON).",
        status: ArchiveStatus.IN_PROCESS
      };
    }
    
    return result;

  } catch (error: any) {
    console.error("Gemini Service Error:", error);
    return {
      title: fileName,
      executiveSummary: `فشل التحليل: ${error.message || "خطأ غير معروف في الاتصال"}.`,
      status: ArchiveStatus.IN_PROCESS
    };
  }
};

export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) return "خطأ: مفتاح API غير موجود.";
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [{ parts: [{ text: `أنت مساعد ذكي لأرشفة الملفات. استخدم السياق التالي للإجابة على سؤال المستخدم بدقة واحترافية.
      
      هام جداً:
      إذا كان المستخدم يطلب ملفاً محدداً أو يسأل عن محتوى ملف معين، ووجدت هذا الملف في السياق، يجب عليك إضافة الوسم التالي في نهاية إجابتك: [[DOWNLOAD:ID]] حيث ID هو معرف الملف من السياق.
      لا تطلب من المستخدم تزويدك بالمعرف، بل استخرجه بنفسك من السياق إذا تطابق الوصف.
      
      السياق:
      ${archiveContext}
      
      سؤال المستخدم: ${query}` }] }]
    });
    return response.text || "لا توجد إجابة.";
  } catch (e) {
    return "عذراً، حدث خطأ في النظام.";
  }
};

export async function* askAgentStream(query: string, archiveContext: string) {
  const apiKey = getApiKey();
  if (!apiKey) { yield "API Key Missing"; return; }
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-3.1-pro-preview",
      contents: [{ parts: [{ text: `You are an intelligent archiving assistant. Use the following context to answer the user's question accurately and professionally in Arabic.\n\nContext:\n${archiveContext}\n\nUser Question: ${query}` }] }]
    });
    for await (const chunk of stream) {
      yield chunk.text;
    }
  } catch (e) {
    yield "Error connecting to agent.";
  }
}
