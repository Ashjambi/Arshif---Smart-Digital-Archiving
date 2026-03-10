
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold, FunctionDeclaration } from "@google/genai";
import { ArchiveStatus, ISOMetadata, DocumentType, FileRecord } from "../types";
import { getFileFromDB } from "../src/services/storageService";

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

export const APP_VERSION = "1.2.0";

const getSystemInstruction = (archiveContext: string) => `أنت مساعد ذكي ومحترف لأرشفة الملفات وتحليلها.
      أنت تعمل حالياً بالإصدار رقم ${APP_VERSION} من النظام. إذا سألك المستخدم عن إصدارك الحالي، أجب بهذا الرقم.
      
      تعليمات صارمة جداً:
      1. اعتمد على "TOTAL_FILES_COUNT" و "CURRENT_DATE" في بداية السياق للإجابة على الأسئلة الكمية والزمنية.
      2. عند سؤال المستخدم عن ملفات "اليوم" أو الملفات "المضافة حديثاً"، قارن بين "CURRENT_DATE" و "تاريخ الأرشفة" المذكور لكل ملف.
      3. كن موجزاً ومباشراً جداً، ولكن احترافياً في صياغتك.
      4. **الملخص التنفيذي (Executive Summary):** عند طلب معلومات عن ملف أو مجموعة ملفات، ابدأ دائماً بتقديم "ملخص تنفيذي" دقيق ومباشر يوضح جوهر الموضوع قبل سرد التفاصيل.
      5. **الربط والتحليل الذكي (أولوية قصوى)**: 
         - ابحث عن الروابط بين الملفات باستخدام "رقم القيد/الإشارة" و "المراجع المرتبطة".
         - إذا سألك المستخدم عن خطاب معين، ابحث عن الخطابات الأخرى التي تذكره في "المراجع المرتبطة" أو التي تحمل نفس "رقم القيد" أو التي تتناول نفس "الموضوع".
         - اربط بين "الوارد" و "الصادر" إذا كان أحدهما رداً على الآخر.
      6. انتبه جيداً لـ "الموقع" (صاحب الصلاحية) و "رقم الوارد" و "المشفوعات".
      7. **ممنوع الهلوسة منعاً باتاً (CRITICAL)**: 
         - لا تخترع أو تفترض وجود ملفات أو روابط أو خطابات غير موجودة في السياق المرسل لك.
         - إذا سألك المستخدم عن خطاب أو ملف أو أرسل لك رقماً غير موجود في قائمة الملفات المرفقة، يجب أن تعتذر فوراً وتقول: "عذراً، لا يوجد في الأرشيف الحالي أي ملف يطابق طلبك."
         - إذا سألك المستخدم سؤالاً عاماً خارج نطاق الأرشيف (مثل الطقس، معلومات عامة، إلخ)، اعتذر بلباقة وقل: "عذراً، أنا مساعد ذكي مخصص حصرياً للبحث وتحليل ملفات الأرشيف، ولا يمكنني الإجابة على أسئلة عامة خارج هذا النطاق."
         - لا تقم بتأليف بيانات أو أرقام قيود أو تواريخ من عندك أبداً.
         - لا تستخدم معلوماتك العامة أو تبحث خارج السياق المرفق.
         - التزم حصرياً بالمعلومات الموجودة في قسم "السياق" أدناه.
      8. إذا سأل المستخدم عن موضوع معين، اذكر الملفات المرتبطة به حتى لو لم تكن هي النتيجة المباشرة الوحيدة، ووضح طبيعة الارتباط.
      9. إذا وجدت ملفاً واحداً يطابق طلب المستخدم أو كنت تتحدث عن ملف محدد، أضف وسم [[DOWNLOAD:ID]] تلقائياً في نهاية ردك لتمكين المستخدم من تحميله فوراً. استبدل ID بمعرف الملف الحقيقي الموجود في السياق.
      10. إذا كان ملخص الملف يحتوي على خطأ تقني، أشر إليه باختصار ولا تذكر تفاصيل الخطأ التقني.
      
      السياق (الأرشيف المتاح لك للبحث فيه حصراً):
      ${archiveContext}`;

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

const retryOperation = async <T>(operation: () => Promise<T>, retries = 2, delay = 1000): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    const errorMsg = error.message || "";
    const isRateLimit = errorMsg.includes("429") || errorMsg.includes("quota");
    
    if (retries <= 0) throw error;
    
    // If it's a rate limit, wait longer, otherwise retry quickly
    const actualDelay = isRateLimit ? delay * 3 : delay;
    console.log(`Retrying operation... Attempts left: ${retries}. Delay: ${actualDelay}ms`);
    
    await new Promise(resolve => setTimeout(resolve, actualDelay));
    return retryOperation(operation, retries - 1, actualDelay * 1.5);
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
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY غير موجود. يرجى تحديد مفتاح API.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Use Flash as primary for speed, Pro as fallback for depth if needed
  const models = ["gemini-3-flash-preview", "gemini-3.1-pro-preview"];
  
  const promptText = `
  أنت خبير أرشفة رقمية ومحلل وثائق استراتيجي. قم بإجراء تحليل معمق للملف المرفق "${fileName}" لإنتاج ملخص تنفيذي رفيع المستوى.
  
  المهام المطلوبة:
  1. **العنوان الرسمي**: استخلص المسمى الوثائقي الدقيق (مثلاً: تعميم إداري، قرار وزاري، محضر اجتماع).
  2. **الملخص التنفيذي**: اكتب ملخصاً احترافياً بأسلوب "نقاط القوة والقرار". يجب أن يتضمن:
     - الغرض الأساسي من الوثيقة.
     - القرارات أو التوجيهات الرئيسية.
     - الجهات المعنية والإجراءات المطلوبة.
     - أي تواريخ نهائية أو التزامات قانونية.
  3. **التصنيف**: حدد نوع الوثيقة (خطاب رسمي، تعميم، تقرير فني، إلخ).
  4. **الأطراف**: حدد الجهة المصدرة (المرسل) والجهة الموجه إليها (المستلم).
  5. **صاحب الصلاحية/الموقع**: ابحث بدقة في نهاية الوثيقة (التذييل) عن الشخص الذي وقع الخطاب أو أصدر القرار. استخرج اسمه ومنصبه.
  6. **تحليل الأختام (هام جداً)**:
     - **الختم المربع للجهة المستلمة**: استخرج "وارد خارجي"، "مشفوعات"، و"تاريخ المعاملة".
     - **ختم الجهة المصدرة (جدكو - JEDCO)**: استخرج "رقم المعاملة"، "تاريخ المعاملة"، و"مشفوعات".
  7. **البيانات المرجعية**: استخرج التاريخ ورقم القيد بدقة من الأختام أو من ترويسة الخطاب.
  8. **الوثائق المرتبطة**: ابحث بذكاء في مقدمة الخطاب ومحتواه عن أي إشارات لوثائق سابقة. استخرج أرقام هذه الوثائق أو مواضيعها بدقة.
  9. **التقييم**: حدد درجة الأهمية (عادي، مهم، سري) بناءً على حساسية المحتوى.
  
  يجب أن تكون الإجابة بتنسيق JSON حصراً:
  {
    "title": "العنوان الرسمي",
    "executiveSummary": "الملخص التنفيذي الاحترافي",
    "documentType": "نوع الوثيقة",
    "sender": "الجهة المصدرة",
    "recipient": "الجهة المستلمة",
    "signatory": "الاسم والمنصب للموقع",
    "fullDate": "YYYY-MM-DD",
    "importance": "عادي/مهم/سري",
    "incomingNumber": "رقم القيد/الإشارة",
    "externalInboundNumber": "رقم الوارد الخارجي من الختم",
    "attachments": "المشفوعات المذكورة في الأختام",
    "relatedReferences": ["رقم الخطاب السابق 1", "موضوع الوثيقة المرتبطة 2"]
  }
  `;

  const parts: any[] = isBinary && mimeType 
    ? [{ inlineData: { mimeType, data: contentOrBase64 } }, { text: promptText }]
    : [{ text: promptText }, { text: `المحتوى النصي للوثيقة:\n${contentOrBase64.substring(0, 100000)}` }];

  for (const modelName of models) {
    try {
      const generate = async () => {
        return await ai.models.generateContent({
          model: modelName,
          contents: [{ parts }],
          config: { 
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                executiveSummary: { type: Type.STRING },
                documentType: { type: Type.STRING },
                sender: { type: Type.STRING },
                recipient: { type: Type.STRING },
                signatory: { type: Type.STRING },
                incomingNumber: { type: Type.STRING },
                externalInboundNumber: { type: Type.STRING },
                attachments: { type: Type.STRING },
                fullDate: { type: Type.STRING },
                importance: { type: Type.STRING },
                relatedReferences: { 
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
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
      
      if (!response.candidates || response.candidates.length === 0) {
        continue; // Try next model if possible
      }

      if (!response.text) {
        continue;
      }

      const result = parseGeminiJSON(response.text);
      if (result) {
        return { ...result, status: ArchiveStatus.COMPLETED };
      }
    } catch (error: any) {
      const errorMsg = error.message || "";
      console.warn(`Model ${modelName} failed:`, errorMsg);
      
      // If it's a quota error and we have more models, continue
      if ((errorMsg.includes("429") || errorMsg.includes("quota")) && modelName !== models[models.length - 1]) {
        console.log("Quota exceeded for Pro, falling back to Flash...");
        continue;
      }
      
      // If it's the last model or not a quota error, handle it
      if (modelName === models[models.length - 1]) {
          let userFriendlyError = "⚠️ فشل التحليل الذكي.";
          if (errorMsg.includes("429") || errorMsg.includes("quota")) {
              if (errorMsg.includes("limit: 0")) {
                  userFriendlyError = "⚠️ خطأ في تهيئة المفتاح: يبدو أن صلاحية الوصول (Limit) هي 0. يرجى التأكد من تفعيل 'Generative Language API' في Google Cloud Console وربط حساب دفع نشط.";
              } else {
                  userFriendlyError = "⚠️ انتهت حصة الاستخدام (Quota) أو تم تجاوز عدد الطلبات المسموح به في الدقيقة (Rate Limit). يرجى المحاولة بعد قليل.";
              }
          } else if (errorMsg.includes("Safety")) {
              userFriendlyError = "⚠️ تم حظر المحتوى لأسباب أمنية.";
          }
          
          return {
            title: fileName,
            executiveSummary: userFriendlyError,
            status: ArchiveStatus.ERROR
          };
      }
    }
  }

  return {
    title: fileName,
    executiveSummary: "⚠️ فشل التحليل: لم يتمكن النظام من معالجة الملف باستخدام النماذج المتاحة.",
    status: ArchiveStatus.ERROR
  };
};

const getUserFriendlyErrorMessage = (errorMsg: string): string => {
  if (!errorMsg) return "خطأ غير معروف.";
  
  if (errorMsg.includes('502') || errorMsg.includes('Bad Gateway') || errorMsg.includes('<html>')) {
      return "الخادم مزدحم حالياً (502 Bad Gateway) أو حجم البيانات المرسلة كبير جداً. يرجى المحاولة مرة أخرى بعد قليل.";
  }
  if (errorMsg.includes('503') || errorMsg.includes('UNAVAILABLE')) {
      return "الخدمة غير متاحة مؤقتاً من المصدر. يرجى المحاولة لاحقاً.";
  }
  if (errorMsg.includes('429') || errorMsg.includes('quota')) {
      return "تم تجاوز الحد المسموح به للطلبات (Rate Limit). يرجى الانتظار قليلاً.";
  }
  if (errorMsg.includes('API key expired') || errorMsg.includes('API_KEY_INVALID')) {
      return "مفتاح API غير صالح أو منتهي الصلاحية.";
  }
  
  // Clean up raw JSON/HTML if it slipped through
  let cleanMsg = errorMsg;
  try {
      // If it's a JSON string containing an error, try to parse it
      if (cleanMsg.includes('{"error"')) {
          const match = cleanMsg.match(/{"error".*}/);
          if (match) {
              const parsed = JSON.parse(match[0]);
              if (parsed.error && parsed.error.message) {
                  cleanMsg = parsed.error.message;
              }
          }
      }
  } catch(e) {}

  // Strip HTML tags
  cleanMsg = cleanMsg.replace(/<[^>]*>?/gm, '').trim();
  
  if (cleanMsg.length > 150) {
      cleanMsg = cleanMsg.substring(0, 150) + "...";
  }
  
  return cleanMsg || "خطأ غير معروف في الاتصال بالمحرك.";
};

const readFileFunctionDeclaration: FunctionDeclaration = {
  name: "readFileContent",
  parameters: {
    type: Type.OBJECT,
    description: "Read the full text content of a specific file from the archive by its ID to answer specific questions about its contents.",
    properties: {
      fileId: {
        type: Type.STRING,
        description: "The ID of the file to read, e.g., 'A1B2C3D4E5'. You can find the ID in the file list.",
      }
    },
    required: ["fileId"],
  },
};

const getFileContent = async (fileId: string, files: FileRecord[]): Promise<string> => {
  const file = files.find(f => f.id === fileId || f.isoMetadata?.recordId === fileId);
  if (!file) return "Error: File not found.";
  
  if (file.extractedText) return file.extractedText;
  
  // If we have base64, we can extract text if it's a text file, but for PDF we might need to rely on the summary or extracted text.
  // Since we don't have a full PDF parser here, we'll return the summary and any available text.
  return `File Name: ${file.name}\nSummary: ${file.isoMetadata?.executiveSummary}\nContent: ${file.content || file.extractedText || "Full text not available. Please rely on the summary."}`;
};

export const askAgent = async (query: string, archiveContext: string, chatHistory: {role: string, text: string}[] = [], files: FileRecord[] = [], retries = 2): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) return "خطأ: مفتاح API غير موجود في النظام.";
  
  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = getSystemInstruction(archiveContext);

  const formattedHistory: any[] = [];
  let lastRole = '';
  for (const msg of chatHistory) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    if (role !== lastRole) {
      formattedHistory.push({ role, parts: [{ text: msg.text }] });
      lastRole = role;
    } else {
      // Append to the last message if roles are the same
      formattedHistory[formattedHistory.length - 1].parts[0].text += '\n\n' + msg.text;
    }
  }

  // Ensure the last message in history is from 'model' so the new 'user' query alternates correctly
  if (formattedHistory.length > 0 && formattedHistory[formattedHistory.length - 1].role === 'user') {
      formattedHistory.push({ role: 'model', parts: [{ text: 'تفضل، كيف يمكنني مساعدتك؟' }] });
  }

  const contents = [
    ...formattedHistory,
    { role: 'user', parts: [{ text: query }] }
  ];

  const tryModel = async (modelName: string): Promise<string> => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.1,
        tools: [{ functionDeclarations: [readFileFunctionDeclaration] }]
      }
    });

    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      if (call.name === 'readFileContent') {
        const fileId = call.args.fileId as string;
        const file = files.find(f => f.id === fileId || f.isoMetadata?.recordId === fileId);
        
        let fileData = file?.base64Data;
        if (file && !fileData) {
            try {
                const dbRecord = await getFileFromDB(file.id);
                if (dbRecord && dbRecord.base64Data) fileData = dbRecord.base64Data;
            } catch (e) {}
        }

        contents.push({ role: 'model', parts: [{ functionCall: call }] });

        if (fileData) {
            contents.push({ role: 'user', parts: [
                { functionResponse: { name: 'readFileContent', response: { status: 'success', message: 'File attached as inline data.' } } },
                { inlineData: { mimeType: file?.type || 'application/pdf', data: fileData } }
            ]});
        } else {
            contents.push({ role: 'user', parts: [
                { functionResponse: { name: 'readFileContent', response: { status: 'error', message: 'File content not found or unavailable.' } } }
            ]});
        }
        
        // Recursive call to let the model answer after reading the file
        return await tryModel(modelName);
      }
    }

    return response.text || "";
  };

  try {
    return await tryModel("gemini-3-flash-preview");
  } catch (e: any) {
    const errorMsg = e.message || String(e);
    
    // If it's a 503, 429, 502, or HTML error (gateway), try to retry
    if ((errorMsg.includes('503') || errorMsg.includes('429') || errorMsg.includes('502') || errorMsg.includes('Bad Gateway') || errorMsg.includes('<html>')) && retries > 0) {
        console.log(`Gemini 3 Flash busy or error (${errorMsg.substring(0, 50)}...), retrying... (${retries} left)`);
        await new Promise(r => setTimeout(r, 2000));
        return askAgent(query, archiveContext, chatHistory, files, retries - 1);
    }
    
    // Fallback to Gemini 2.5 Flash if Gemini 3 is unavailable after retries
    // We broaden the check to include almost any error that might be transient or model-specific
    if (errorMsg.includes('503') || errorMsg.includes('UNAVAILABLE') || errorMsg.includes('502') || errorMsg.includes('Bad Gateway') || errorMsg.includes('<html>') || errorMsg.includes('quota') || errorMsg.includes('Overloaded')) {
        console.log("Gemini 3 Flash unavailable, falling back to Gemini 2.5 Flash");
        try {
            return await tryModel("gemini-2.5-flash-latest");
        } catch (fallbackError: any) {
            return `⚠️ حدث خطأ في محرك الذكاء الاصطناعي (حتى بعد المحاولة البديلة):
السبب: ${getUserFriendlyErrorMessage(fallbackError.message || String(fallbackError))}`;
        }
    }

    console.error("Agent Error Details:", e);
    return `⚠️ حدث خطأ في محرك الذكاء الاصطناعي:
السبب: ${getUserFriendlyErrorMessage(errorMsg)}
الموديل: gemini-3-flash-preview`;
  }
};

export async function* askAgentStream(query: string, archiveContext: string, chatHistory: {role: string, text: string}[] = [], files: FileRecord[] = []) {
  const apiKey = getApiKey();
  if (!apiKey) { yield "⚠️ مفتاح API غير موجود."; return; }
  
  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = getSystemInstruction(archiveContext);

  const formattedHistory: any[] = [];
  let lastRole = '';
  for (const msg of chatHistory) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    if (role !== lastRole) {
      formattedHistory.push({ role, parts: [{ text: msg.text }] });
      lastRole = role;
    } else {
      // Append to the last message if roles are the same
      formattedHistory[formattedHistory.length - 1].parts[0].text += '\n\n' + msg.text;
    }
  }

  // Ensure the last message in history is from 'model' so the new 'user' query alternates correctly
  if (formattedHistory.length > 0 && formattedHistory[formattedHistory.length - 1].role === 'user') {
      formattedHistory.push({ role: 'model', parts: [{ text: 'تفضل، كيف يمكنني مساعدتك؟' }] });
  }

  const contents = [
    ...formattedHistory,
    { role: 'user', parts: [{ text: query }] }
  ];

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.1,
        tools: [{ functionDeclarations: [readFileFunctionDeclaration] }]
      }
    });

    let hasFunctionCall = false;
    for await (const chunk of stream) {
      if (chunk.functionCalls && chunk.functionCalls.length > 0) {
        hasFunctionCall = true;
        const call = chunk.functionCalls[0];
        if (call.name === 'readFileContent') {
          const fileId = call.args.fileId as string;
          const file = files.find(f => f.id === fileId || f.isoMetadata?.recordId === fileId);
          
          let fileData = file?.base64Data;
          if (file && !fileData) {
              try {
                  const dbRecord = await getFileFromDB(file.id);
                  if (dbRecord && dbRecord.base64Data) fileData = dbRecord.base64Data;
              } catch (e) {}
          }

          contents.push({ role: 'model', parts: [{ functionCall: call }] });

          if (fileData) {
              contents.push({ role: 'user', parts: [
                  { functionResponse: { name: 'readFileContent', response: { status: 'success', message: 'File attached as inline data.' } } },
                  { inlineData: { mimeType: file?.type || 'application/pdf', data: fileData } }
              ]});
          } else {
              contents.push({ role: 'user', parts: [
                  { functionResponse: { name: 'readFileContent', response: { status: 'error', message: 'File content not found or unavailable.' } } }
              ]});
          }
          break; // Break the loop to restart
        }
      }
      if (chunk.text) yield chunk.text;
    }

    if (hasFunctionCall) {
       const newStream = await ai.models.generateContentStream({
         model: "gemini-3-flash-preview",
         contents: contents,
         config: {
           systemInstruction: systemInstruction,
           temperature: 0.1,
           tools: [{ functionDeclarations: [readFileFunctionDeclaration] }]
         }
       });
       for await (const chunk of newStream) {
         if (chunk.text) yield chunk.text;
       }
    }
  } catch (e: any) {
    console.error("Stream Agent Error:", e);
    const errorMsg = e.message || String(e);
    yield `⚠️ خطأ في الاتصال بالمحرك: ${getUserFriendlyErrorMessage(errorMsg)}`;
  }
}
