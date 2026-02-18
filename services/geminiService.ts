
import { GoogleGenAI, Type } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

/**
 * Helper to extract the first valid JSON object from a string.
 */
const extractFirstJSON = (text: string): string => {
  if (!text) return "{}";
  const startIndex = text.indexOf('{');
  if (startIndex === -1) return "{}";
  
  let braceCount = 0;
  let inString = false;
  let isEscaped = false;
  
  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    
    if (char === '\\') {
      isEscaped = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return text.substring(startIndex, i + 1);
        }
      }
    }
  }
  // Fallback: try to find the last closing brace
  const lastIndex = text.lastIndexOf('}');
  if (lastIndex > startIndex) {
      return text.substring(startIndex, lastIndex + 1);
  }
  return "{}";
};

/**
 * Helper to retry Gemini API calls on 503/429/500 errors with exponential backoff.
 */
async function generateContentWithRetry(ai: GoogleGenAI, params: any, retries = 3, delay = 2000): Promise<any> {
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    const isOverloaded = error?.status === 503 || error?.code === 503 || error?.message?.includes('503');
    const isRateLimited = error?.status === 429 || error?.code === 429;
    const isInternalError = error?.status === 500 || error?.code === 500; 
    
    if (retries > 0 && (isOverloaded || isRateLimited || isInternalError)) {
      console.warn(`Gemini API Error (${error.status || error.code}), retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateContentWithRetry(ai, params, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const analyzeSpecificFile = async (
  fileName: string, 
  contentOrBase64: string,
  mimeType?: string,
  isBinary: boolean = false
): Promise<Partial<ISOMetadata>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const promptText = `
  أنت خبير أرشفة ومحلل وثائق استراتيجي (ISO 15489).
  مهمتك: تحليل الملف المرفق بدقة واستخراج البيانات الهيكلية، ثم بناء "ملخص تنفيذي" شامل.
  
  اسم الملف: ${fileName}
  
  المطلوب إرجاع JSON فقط بالبنية التالية:
  {
    "title": "عنوان رسمي وواضح للوثيقة",
    "description": "وصف مختصر جداً للغرض",
    "executiveSummary": "ملخص تنفيذي مفصل (3-5 أسطر) يشرح محتوى الوثيقة، الأطراف المعنية، والتواريخ المهمة، والإجراء المطلوب.",
    "documentType": "واحد من: عقد, مراسلة واردة, مراسلة صادرة, فاتورة, تقرير, نموذج, سياسة/إجراء, أخرى",
    "sender": "اسم الجهة المرسلة أو الشخص",
    "recipient": "اسم الجهة المستلمة",
    "incomingNumber": "رقم الإشارة أو الوارد إن وجد",
    "outgoingNumber": "رقم الصادر إن وجد",
    "fullDate": "تاريخ الوثيقة المكتوب (YYYY-MM-DD)",
    "importance": "عادي, مهم, عالي الأهمية, حرج",
    "confidentiality": "عام, داخلي, سري, سري للغاية",
    "entity": "الجهة التابعة لها الوثيقة"
  }
  `;

  const parts: any[] = [];
  
  // Add the file content (either text or binary image/pdf)
  if (isBinary && mimeType && contentOrBase64) {
      parts.push({
          inlineData: {
              mimeType: mimeType,
              data: contentOrBase64
          }
      });
      parts.push({ text: promptText });
  } else {
      parts.push({ text: promptText });
      parts.push({ text: `\n--- محتوى الملف النصي ---\n${contentOrBase64.substring(0, 30000)}\n--- نهاية المحتوى ---` });
  }

  try {
    const response = await generateContentWithRetry(ai, {
      model: "gemini-3-flash-preview", 
      contents: [{ parts: parts }],
      config: {
        systemInstruction: "أنت نظام أرشفة ذكي. استخرج البيانات بدقة عالية.",
        responseMimeType: "application/json"
      }
    });
    
    let text = response.text || "{}";
    text = text.replace(/```json/g, "").replace(/```/g, ""); // Clean markdown
    const jsonString = extractFirstJSON(text);
    const result = JSON.parse(jsonString);
    
    return { 
      ...result, 
      status: ArchiveStatus.ACTIVE, 
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("Deep Analysis error:", error);
    return {
        title: fileName,
        description: "تمت الأرشفة (فشل التحليل الذكي)",
        executiveSummary: "لم يتمكن النظام من قراءة محتوى الملف لاستخراج الملخص. قد يكون الملف محمياً أو غير مدعوم.",
        status: ArchiveStatus.IN_PROCESS
    };
  }
};

// Standard Ask Agent (Non-Streaming) - Used for Telegram/Background
export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const safeContext = archiveContext.slice(0, 30000); // Reduced context limit for speed

    const prompt = `
Context (List of available files):
${safeContext}

User Question: ${query}

INSTRUCTIONS:
1. Answer the user based on the archive context in Arabic.
2. CRITICAL: If the user explicitly asks to "download", "send", "get", or "retrieve" a file (e.g., "send me file X", "أرسل لي الملف"), you MUST find the corresponding 'ID' or 'RecordID' from the context and append this tag to the end of your response: [[DOWNLOAD:the-exact-id-here]]
3. Do not refuse to send files. The system can send them if you provide the tag.
`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3-flash-preview", 
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1, // Lower temperature for stricter command following
        systemInstruction: `You are the Arshif PRO smart assistant. You can retrieve files. Always use [[DOWNLOAD:ID]] when requested.`
      }
    });
    return response.text || "عذراً، لم أستطع تحليل الطلب.";
  } catch (error) {
    console.error("Agent Chat error details:", error);
    return "نواجه مشكلة فنية مؤقتة.";
  }
};

// Streaming Ask Agent - Used for Web UI
export async function* askAgentStream(query: string, archiveContext: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    // Highly optimized context for streaming
    const safeContext = archiveContext.slice(0, 40000); 

    const prompt = `
لديك صلاحية الوصول للأرشيف. جاوب باختصار ودقة.

--- سياق الأرشيف ---
${safeContext}
---

سؤال المستخدم: ${query}
`;

    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview", 
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        temperature: 0.3,
        systemInstruction: `
أنت المساعد الذكي لنظام الأرشفة "أرشيف PRO".
- أجب باللغة العربية.
- إذا طلب المستخدم "تحميل" أو "إرسال" ملف موجود، أضف في نهاية الرد الكود: [[DOWNLOAD:RecordID]]
`
      }
    });

    for await (const chunk of responseStream) {
      yield chunk.text;
    }

  } catch (error) {
    console.error("Stream Error:", error);
    yield " عذراً، حدث خطأ في الاتصال بالخادم.";
  }
}

export const classifyFileContent = analyzeSpecificFile;
