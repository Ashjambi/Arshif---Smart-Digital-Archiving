
import { GoogleGenAI, Type } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

const extractFirstJSON = (text: string): string => {
  if (!text) return "{}";
  const startIndex = text.indexOf('{');
  if (startIndex === -1) return "{}";
  
  let braceCount = 0;
  let inString = false;
  let isEscaped = false;
  
  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    if (isEscaped) { isEscaped = false; continue; }
    if (char === '\\') { isEscaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') braceCount++;
      else if (char === '}') {
        braceCount--;
        if (braceCount === 0) return text.substring(startIndex, i + 1);
      }
    }
  }
  const lastIndex = text.lastIndexOf('}');
  if (lastIndex > startIndex) return text.substring(startIndex, lastIndex + 1);
  return "{}";
};

async function generateWithRetry(params: any, retries = 3): Promise<any> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    if (retries > 0 && (error.status === 503 || error.status === 429 || error.status === 500)) {
      await new Promise(r => setTimeout(r, 2000));
      return generateWithRetry(params, retries - 1);
    }
    throw error;
  }
}

// Fix Error: Export missing member 'classifyFileContent' used in App.tsx
export const classifyFileContent = async (content: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `صنف نوع الوثيقة بناءً على المحتوى (عقد، مراسلة، فاتورة، تقرير، نموذج، سياسة، أخرى): ${content.substring(0, 1000)}` }] }],
    });
    return response.text?.trim() || "أخرى";
  } catch (error) {
    return "أخرى";
  }
};

export const analyzeSpecificFile = async (
  fileName: string, 
  contentOrBase64: string,
  mimeType?: string,
  isBinary: boolean = false
): Promise<Partial<ISOMetadata>> => {
  const promptText = `
  تحليل وثيقة (ISO 15489): استخرج البيانات بدقة كـ JSON.
  الملف: ${fileName}
  المطلوب: title, description, executiveSummary, documentType (عقد, مراسلة واردة, مراسلة صادرة, فاتورة, تقرير, نموذج, سياسة/إجراء, أخرى), sender, recipient, incomingNumber, outgoingNumber, fullDate (YYYY-MM-DD), importance (عادي, مهم, عالي الأهمية, حرج), confidentiality (عام, داخلي, سري, سري للغاية), entity.
  `;

  const parts: any[] = isBinary && mimeType 
    ? [{ inlineData: { mimeType, data: contentOrBase64 } }, { text: promptText }]
    : [{ text: promptText }, { text: contentOrBase64.substring(0, 30000) }];

  try {
    const response = await generateWithRetry({
      model: "gemini-3-flash-preview",
      contents: [{ parts }],
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(extractFirstJSON(response.text));
  } catch (error) {
    console.error("Analysis Error:", error);
    throw error;
  }
};

export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  try {
    const response = await generateWithRetry({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `سياق الأرشيف:\n${archiveContext.slice(0, 20000)}\n\nالسؤال: ${query}` }] }],
      config: {
        systemInstruction: "أنت مساعد أرشيف PRO. أجب باللغة العربية بناءً على السياق فقط. إذا طلب المستخدم تحميل ملف، أضف [[DOWNLOAD:ID]] في نهاية الرد."
      }
    });
    return response.text || "لا توجد استجابة.";
  } catch (error) {
    console.error("Chat Error:", error);
    return "عذراً، حدث خطأ في معالجة طلبك.";
  }
};

export async function* askAgentStream(query: string, archiveContext: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `السياق:\n${archiveContext.slice(0, 25000)}\n\nالسؤال: ${query}` }] }],
      config: { systemInstruction: "أنت مساعد أرشيف PRO ذكي." }
    });
    for await (const chunk of responseStream) yield chunk.text;
  } catch (error) {
    yield "خطأ في الاتصال بالخادم.";
  }
}
