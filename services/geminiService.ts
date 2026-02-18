
import { GoogleGenAI, Type } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType } from "../types";

/**
 * Helper to extract JSON from model response
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

/**
 * Robust generation with retry logic
 */
async function generateWithRetry(params: any, retries = 3): Promise<any> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent(params);
    return response;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    if (retries > 0 && (error.status === 503 || error.status === 429 || error.status === 500)) {
      await new Promise(r => setTimeout(r, 2000));
      return generateWithRetry(params, retries - 1);
    }
    throw error;
  }
}

export const classifyFileContent = async (content: string): Promise<string> => {
  try {
    const response = await generateWithRetry({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `صنف نوع الوثيقة بناءً على المحتوى (عقد، مراسلة، فاتورة، تقرير، نموذج، سياسة، أخرى). أجب بكلمة واحدة فقط: ${content.substring(0, 1000)}` }] }],
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
  تحليل وثيقة وفق معايير (ISO 15489). استخرج البيانات التالية بدقة كـ JSON فقط:
  1. title: عنوان الوثيقة.
  2. description: وصف مختصر جداً.
  3. executiveSummary: ملخص تنفيذي شامل يشرح المحتوى والأطراف.
  4. documentType: (عقد، مراسلة واردة، مراسلة صادرة، فاتورة، تقرير، نموذج، سياسة/إجراء، أخرى).
  5. sender: الجهة المرسلة.
  6. recipient: الجهة المستلمة.
  7. incomingNumber: رقم الوارد إن وجد.
  8. outgoingNumber: رقم الصادر إن وجد.
  9. fullDate: التاريخ المذكور بالوثيقة (YYYY-MM-DD).
  10. importance: (عادي، مهم، عالي الأهمية، حرج).
  11. confidentiality: (عام، داخلي، سري، سري للغاية).
  12. entity: الجهة التابع لها.
  
  اسم الملف: ${fileName}
  `;

  const parts: any[] = isBinary && mimeType 
    ? [{ inlineData: { mimeType, data: contentOrBase64 } }, { text: promptText }]
    : [{ text: promptText }, { text: `المحتوى:\n${contentOrBase64.substring(0, 30000)}` }];

  try {
    const response = await generateWithRetry({
      model: "gemini-3-flash-preview",
      contents: [{ parts }],
      config: { 
        responseMimeType: "application/json",
        systemInstruction: "أنت خبير أرشفة رقمية ومحلل وثائق قانونية وإدارية."
      }
    });
    const jsonStr = extractFirstJSON(response.text || "{}");
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Analysis Error:", error);
    return {
      title: fileName,
      description: "فشل التحليل التلقائي للملف.",
      executiveSummary: "لم يتمكن النظام من تحليل محتوى هذا الملف بشكل كامل."
    };
  }
};

export const askAgent = async (query: string, archiveContext: string): Promise<string> => {
  try {
    const response = await generateWithRetry({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `سياق الأرشيف الحالي:\n${archiveContext}\n\nسؤال المستخدم: ${query}` }] }],
      config: {
        systemInstruction: `أنت مساعد "أرشيف PRO" الذكي. 
        1. أجب باللغة العربية بأسلوب مهني ومختصر.
        2. استخدم سياق الأرشيف للإجابة على الأسئلة حول الملفات.
        3. إذا طلب المستخدم "تحميل" أو "إرسال" ملف معين موجود في السياق، يجب أن تنهي ردك بالكود التالي: [[DOWNLOAD:RecordID]] حيث RecordID هو معرف السجل أو ID الملف.`
      }
    });
    return response.text || "عذراً، لم أستطع فهم الطلب حالياً.";
  } catch (error) {
    console.error("Chat Agent Error:", error);
    return "عذراً، حدث خطأ أثناء معالجة طلبك الذكي.";
  }
};

export async function* askAgentStream(query: string, archiveContext: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `سياق الأرشيف:\n${archiveContext}\n\nالسؤال: ${query}` }] }],
      config: { 
        systemInstruction: "أنت مساعد أرشيف PRO ذكي. أجب باللغة العربية." 
      }
    });
    for await (const chunk of responseStream) {
      yield chunk.text;
    }
  } catch (error) {
    console.error("Stream Error:", error);
    yield "خطأ في الاتصال بخدمة الذكاء الاصطناعي.";
  }
}
