/**
 * PhysAI Paper Assistant - Background Service Worker
 * Handles IndexedDB operations, LLM API calls, embedding generation
 */

// Database configuration
const DB_NAME = 'PhysAI_PaperDB';
const DB_VERSION = 1;
const STORE_PAPERS = 'papers';
const STORE_SETTINGS = 'settings';

// Global database reference
let db = null;
let dbInitPromise = null;

/**
 * Initialize IndexedDB
 */
async function initDB() {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;
  
  dbInitPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB open error:', request.error);
      reject(request.error);
    };
    request.onsuccess = () => {
      db = request.result;
      console.log('PhysAI: Database opened successfully');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      console.log('PhysAI: Database upgrade needed');

      // Papers store with indexes
      if (!database.objectStoreNames.contains(STORE_PAPERS)) {
        const paperStore = database.createObjectStore(STORE_PAPERS, { keyPath: 'id', autoIncrement: true });
        paperStore.createIndex('title', 'title', { unique: false });
        paperStore.createIndex('authors', 'authors', { unique: false });
        paperStore.createIndex('dateAdded', 'dateAdded', { unique: false });
      }

      // Settings store
      if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
        database.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
  });
  
  return dbInitPromise;
}

/**
 * Ensure database is initialized before any operation
 */
async function ensureDB() {
  if (!db) {
    await initDB();
  }
  if (!db) {
    throw new Error('Database not initialized');
  }
}

/**
 * Get all papers from IndexedDB
 */
async function getAllPapers() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PAPERS], 'readonly');
    const store = transaction.objectStore(STORE_PAPERS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Add a new paper to IndexedDB
 */
async function addPaper(paper) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PAPERS], 'readwrite');
    const store = transaction.objectStore(STORE_PAPERS);
    const request = store.add({
      ...paper,
      dateAdded: new Date().toISOString()
    });

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update a paper in IndexedDB
 */
async function updatePaper(paper) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PAPERS], 'readwrite');
    const store = transaction.objectStore(STORE_PAPERS);
    const request = store.put(paper);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a paper from IndexedDB
 */
async function deletePaper(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PAPERS], 'readwrite');
    const store = transaction.objectStore(STORE_PAPERS);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get setting from IndexedDB
 */
async function getSetting(key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_SETTINGS], 'readonly');
    const store = transaction.objectStore(STORE_SETTINGS);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save setting to IndexedDB
 */
async function saveSetting(key, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_SETTINGS], 'readwrite');
    const store = transaction.objectStore(STORE_SETTINGS);
    const request = store.put({ key, value });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1, vec2) {
  if (vec1.length !== vec2.length) return 0;
  
  const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
  const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
  
  if (mag1 === 0 || mag2 === 0) return 0;
  return dotProduct / (mag1 * mag2);
}

/**
 * Find similar papers based on embedding
 */
async function findSimilarPapers(embedding, threshold = 0.7, limit = 5) {
  const papers = await getAllPapers();
  
  const similarities = papers
    .filter(p => p.embedding)
    .map(paper => ({
      ...paper,
      similarity: cosineSimilarity(embedding, paper.embedding)
    }))
    .filter(p => p.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  
  return similarities;
}

/**
 * Call LLM API with given prompt
 */
async function callLLM(prompt, systemPrompt = '') {
  const settings = await getAllSettings();
  
  const provider = settings.llmProvider || 'openai';
  const apiKey = settings.apiKey;
  const model = settings.chatModel || 'gpt-4o';
  
  if (!apiKey) {
    throw new Error('API key not configured. Please set up in Settings.');
  }

  let response;
  
  switch (provider) {
    case 'openai':
      response = await callOpenAI(apiKey, model, prompt, systemPrompt);
      break;
    case 'gemini':
      response = await callGemini(apiKey, model, prompt, systemPrompt);
      break;
    case 'grok':
      response = await callGrok(apiKey, model, prompt, systemPrompt);
      break;
    case 'claude':
      response = await callClaude(apiKey, model, prompt, systemPrompt);
      break;
    case 'minimax':
      response = await callMinimax(apiKey, model, prompt, systemPrompt);
      break;
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
  
  return response;
}

/**
 * OpenAI API call
 */
async function callOpenAI(apiKey, model, prompt, systemPrompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Google Gemini API call
 */
async function callGemini(apiKey, model, prompt, systemPrompt) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4000
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Gemini API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

/**
 * xAI Grok API call
 */
async function callGrok(apiKey, model, prompt, systemPrompt) {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Grok API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Anthropic Claude API call
 */
async function callClaude(apiKey, model, prompt, systemPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 4000,
      messages: [
        ...(systemPrompt ? [{ role: 'system', text: systemPrompt }] : []),
        { role: 'user', text: prompt }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Claude API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

/**
 * MiniMax API call
 * MiniMax API: https://platform.minimaxi.com
 */
async function callMinimax(apiKey, model, prompt, systemPrompt) {
  const response = await fetch('https://api.minimaxi.chat/v1/text/chatcompletion_pro', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`MiniMax API error: ${error.base_resp?.status_msg || error.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Generate embedding using configured provider
 */
async function generateEmbedding(text) {
  const settings = await getAllSettings();
  
  const provider = settings.embeddingProvider || 'openai';
  const apiKey = settings.apiKey;
  const model = settings.embeddingModel || 'text-embedding-3-small';
  
  if (!apiKey) {
    throw new Error('API key not configured');
  }

  switch (provider) {
    case 'openai':
      return await generateOpenAIEmbedding(apiKey, model, text);
    case 'gemini':
      return await generateGeminiEmbedding(apiKey, text);
    case 'minimax':
      return await generateMinimaxEmbedding(apiKey, model, text);
    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }
}

/**
 * OpenAI Embedding generation
 */
async function generateOpenAIEmbedding(apiKey, model, text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      input: text
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI Embedding error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Gemini Embedding generation
 */
async function generateGeminiEmbedding(apiKey, text) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      content: { parts: [{ text }] }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Gemini Embedding error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

/**
 * MiniMax Embedding generation
 * API: https://platform.minimaxi.com/document/Guides/Computing/Embedding
 */
async function generateMinimaxEmbedding(apiKey, model, text) {
  const response = await fetch('https://api.minimaxi.chat/v1/text/embedding', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      input: text
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`MiniMax Embedding error: ${error.base_resp?.status_msg || error.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Get all settings
 */
async function getAllSettings() {
  const transaction = db.transaction([STORE_SETTINGS], 'readonly');
  const store = transaction.objectStore(STORE_SETTINGS);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const settings = {};
      request.result.forEach(item => {
        settings[item.key] = item.value;
      });
      resolve(settings);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Extract text from PDF using pdf.js
 */
async function extractPDFText(pdfData) {
  // This will be handled in content script with pdf.js
  // Returns extracted text from the PDF
  return pdfData;
}

/**
 * Generate paper summary using LLM
 */
async function generatePaperSummary(paperText) {
  const systemPrompt = `You are an expert physicist. Summarize the following physics research paper in strict JSON format only. Do not add any extra text or explanation.`;
  
  const prompt = `{
  "title": "extracted or inferred title",
  "authors": "list",
  "year": "year",
  "background": "前人工作与研究背景（2-4句）",
  "views": "本文主要观点、理论框架或实验方法",
  "innovation": "核心创新点与贡献（突出新颖性）",
  "errors_and_deficiencies": "可能的误差、不足、假设局限或争议点（客观指出）",
  "main_conclusions": "主要结果与结论（量化优先）"
}

Paper full text: ${paperText}`;

  const result = await callLLM(prompt, systemPrompt);
  
  try {
    // Try to parse JSON from the response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(result);
  } catch (e) {
    console.error('Failed to parse summary JSON:', e);
    return { error: 'Failed to parse summary', raw: result };
  }
}

/**
 * Generate LaTeX content using LLM
 */
async function generateLaTeX(referencePapers, userRequest) {
  const referenceSummaries = referencePapers.map(p => 
    JSON.stringify(p.summary, null, 2)
  ).join('\n\n');

  const systemPrompt = `You are a senior physics researcher writing for PRL / PRX / Nature Physics. 
Write the paper strictly following this structure and LaTeX template:

\documentclass[aps,prl,reprint,superscriptaddress]{revtex4-2}
\usepackage{amsmath,amssymb,graphicx}

\title{...}
\begin{abstract}...\end{abstract}
\section{Introduction}
\section{Theory / Experimental Setup}
\section{Results}
\section{Discussion}
\section{Conclusion}

Requirements:
- 严格模仿用户选中的参考论文的用词、语法、句式和学术语气（参考论文摘要已提供）。
- 使用精确物理术语，避免口语化。
- 所有公式用KaTeX兼容格式。
- 输出**完整可直接粘贴到Overleaf**的LaTeX代码（不要加任何解释）。`;

  const prompt = `参考论文风格摘要：
${referenceSummaries}

Current user request / draft: ${userRequest}`;

  return await callLLM(prompt, systemPrompt);
}

/**
 * Generate Gemini prompt for figure generation
 */
function generateGeminiFigurePrompt(description) {
  return `Here is the ready-to-use prompt for Google Gemini nanobanana2pro:

"Generate a high-resolution, publication-quality scientific figure for a physics paper in PRL style: ${description}。必须包含清晰的英文轴标签、图例、刻度、标题。使用期刊友好配色（黑白或色盲友好），高对比度，矢量风格优先，所有文字在打印尺寸下清晰可读。不要添加任何多余元素或水印。输出仅为图片，无文字说明。"`;
}

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      // Ensure database is ready before any operation
      await ensureDB();
      
      switch (message.type) {
        case 'GET_ALL_PAPERS':
          sendResponse({ success: true, data: await getAllPapers() });
          break;
          
        case 'ADD_PAPER':
          sendResponse({ success: true, data: await addPaper(message.data) });
          break;
          
        case 'UPDATE_PAPER':
          sendResponse({ success: true, data: await updatePaper(message.data) });
          break;
          
        case 'DELETE_PAPER':
          await deletePaper(message.id);
          sendResponse({ success: true });
          break;
          
        case 'FIND_SIMILAR_PAPERS':
          const similar = await findSimilarPapers(
            message.embedding,
            message.threshold || 0.7,
            message.limit || 5
          );
          sendResponse({ success: true, data: similar });
          break;
          
        case 'GET_SETTINGS':
          sendResponse({ success: true, data: await getAllSettings() });
          break;
          
        case 'SAVE_SETTING':
          await saveSetting(message.key, message.value);
          sendResponse({ success: true });
          break;
          
        case 'GENERATE_EMBEDDING':
          sendResponse({ success: true, data: await generateEmbedding(message.text) });
          break;
          
        case 'CALL_LLM':
          sendResponse({ success: true, data: await callLLM(message.prompt, message.systemPrompt) });
          break;
          
        case 'SUMMARIZE_PAPER':
          sendResponse({ success: true, data: await generatePaperSummary(message.text) });
          break;
          
        case 'GENERATE_LATEX':
          sendResponse({ success: true, data: await generateLaTeX(message.referencePapers, message.userRequest) });
          break;
          
        case 'GENERATE_FIGURE_PROMPT':
          sendResponse({ success: true, data: generateGeminiFigurePrompt(message.description) });
          break;
          
        case 'GET_PDF_BLOB':
          const papers = await getAllPapers();
          const paper = papers.find(p => p.id === message.id);
          sendResponse({ success: true, data: paper?.pdfBlob || null });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('PhysAI: Message handler error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  return true; // Keep message channel open for async response
});

// Initialize database on service worker start
initDB().then(() => {
  console.log('PhysAI Paper Assistant: Database initialized');
}).catch(err => {
  console.error('PhysAI Paper Assistant: Database initialization failed', err);
});
