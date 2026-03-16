/**
 * PhysAI Paper Assistant - Content Script
 * Handles paper detection on academic sites and sidebar injection
 */

// Detect if current page is a paper page
const PAPER_DOMAINS = [
  'arxiv.org',
  'aps.org',
  'nature.com',
  'sciencedirect.com',
  'pnas.org',
  'princeton.edu'
];

function isPaperPage() {
  const url = window.location.href;
  return PAPER_DOMAINS.some(domain => url.includes(domain));
}

/**
 * Extract paper metadata from the current page
 */
async function extractPaperMetadata() {
  const url = window.location.href;
  
  // Try to extract metadata based on the site
  let metadata = {
    url: url,
    title: '',
    authors: [],
    abstract: '',
    pdfUrl: ''
  };

  // arXiv
  if (url.includes('arxiv.org')) {
    const titleEl = document.querySelector('h1.title');
    metadata.title = titleEl?.textContent?.trim() || '';
    
    const authorsEl = document.querySelector('.authors');
    if (authorsEl) {
      metadata.authors = authorsEl.textContent.split(',').map(a => a.trim());
    }
    
    const abstractEl = document.querySelector('.abstract');
    metadata.abstract = abstractEl?.textContent?.trim() || '';
    
    // Find PDF link
    const pdfLink = document.querySelector('a[href*=".pdf"]');
    if (pdfLink) {
      metadata.pdfUrl = pdfLink.href;
    }
  }
  
  // APS (Physical Review)
  else if (url.includes('aps.org')) {
    const titleEl = document.querySelector('h1.title');
    metadata.title = titleEl?.textContent?.trim() || '';
    
    const authorsEl = document.querySelector('.authors');
    if (authorsEl) {
      metadata.authors = Array.from(authorsEl.querySelectorAll('.author')).map(a => a.textContent.trim());
    }
    
    const abstractEl = document.querySelector('.abstract');
    metadata.abstract = abstractEl?.textContent?.trim() || '';
    
    const pdfLink = document.querySelector('a[href*=".pdf"]');
    if (pdfLink) {
      metadata.pdfUrl = pdfLink.href;
    }
  }
  
  // Nature
  else if (url.includes('nature.com')) {
    const titleEl = document.querySelector('h1.c-article-title');
    metadata.title = titleEl?.textContent?.trim() || '';
    
    const authorsEl = document.querySelector('.c-article-authors');
    if (authorsEl) {
      metadata.authors = Array.from(authorsEl.querySelectorAll('a')).map(a => a.textContent.trim());
    }
    
    const abstractEl = document.querySelector('.c-article-section__abstract');
    metadata.abstract = abstractEl?.textContent?.trim() || '';
  }
  
  // ScienceDirect
  else if (url.includes('sciencedirect.com')) {
    const titleEl = document.querySelector('h1.title-text');
    metadata.title = titleEl?.textContent?.trim() || '';
    
    const authorsEl = document.querySelector('.author-group');
    if (authorsEl) {
      metadata.authors = Array.from(authorsEl.querySelectorAll('.author')).map(a => a.textContent.trim());
    }
    
    const abstractEl = document.querySelector('.abstracts');
    metadata.abstract = abstractEl?.textContent?.trim() || '';
  }

  return metadata;
}

/**
 * Extract text content from the current page
 */
async function extractPageText() {
  // Try to get abstract first
  const abstractSelectors = [
    '.abstract',
    '[class*="abstract"]',
    '#abstract',
    '[id*="abstract"]'
  ];
  
  for (const selector of abstractSelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim().length > 100) {
      return el.textContent.trim();
    }
  }
  
  // Fallback to body text
  const body = document.body;
  return body?.textContent?.trim() || '';
}

/**
 * Create and inject the sidebar
 */
function createSidebar() {
  // Remove existing sidebar if any
  const existingSidebar = document.getElementById('physai-sidebar');
  if (existingSidebar) {
    existingSidebar.remove();
  }

  const sidebar = document.createElement('div');
  sidebar.id = 'physai-sidebar';
  sidebar.innerHTML = `
    <div class="physai-sidebar-header">
      <div class="physai-logo">
        <span class="physai-icon">⚛️</span>
        <span>PhysAI Assistant</span>
      </div>
      <button class="physai-close-btn" id="physai-close-sidebar">×</button>
    </div>
    <div class="physai-sidebar-content">
      <div class="physai-tabs">
        <button class="physai-tab active" data-tab="reading">📖 Reading</button>
        <button class="physai-tab" data-tab="feed">📥 Feed</button>
        <button class="physai-tab" data-tab="writer">✍️ Writer</button>
      </div>
      
      <div class="physai-tab-content" id="physai-reading-panel">
        <div class="physai-panel-header">
          <h3>Related Papers</h3>
          <button class="physai-btn-small" id="physai-refresh-related">🔄 Refresh</button>
        </div>
        <div class="physai-similar-papers" id="physai-similar-papers">
          <div class="physai-loading">Analyzing current paper...</div>
        </div>
      </div>
      
      <div class="physai-tab-content hidden" id="physai-feed-panel">
        <div class="physai-drop-zone" id="physai-drop-zone">
          <div class="physai-drop-icon">📄</div>
          <p>Drag & Drop PDF here</p>
          <p class="physai-hint">or click to select</p>
          <input type="file" id="physai-file-input" accept=".pdf" hidden>
        </div>
        <div class="physai-feed-status" id="physai-feed-status"></div>
        <div class="physai-feed-progress hidden" id="physai-feed-progress">
          <div class="physai-progress-bar">
            <div class="physai-progress-fill" id="physai-progress-fill"></div>
          </div>
          <p class="physai-progress-text" id="physai-progress-text">Processing...</p>
        </div>
      </div>
      
      <div class="physai-tab-content hidden" id="physai-writer-panel">
        <div class="physai-writer-input">
          <textarea id="physai-writer-text" placeholder="Enter your paper topic or draft..."></textarea>
        </div>
        <div class="physai-writer-options">
          <label>
            <input type="checkbox" id="physai-use-references"> Use selected papers as reference
          </label>
        </div>
        <button class="physai-btn primary" id="physai-generate-latex">Generate LaTeX</button>
        <button class="physai-btn secondary" id="physai-generate-figure">Generate Figure Prompt</button>
        <div class="physai-writer-output hidden" id="physai-writer-output">
          <h4>Generated Output:</h4>
          <pre id="physai-output-content"></pre>
          <div class="physai-output-actions">
            <button class="physai-btn-small" id="physai-copy-latex">📋 Copy</button>
            <button class="physai-btn-small" id="physai-download-latex">⬇️ Download</button>
            <button class="physai-btn-small" id="physai-open-overleaf">🌐 Open Overleaf</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(sidebar);
  
  // Add event listeners
  initializeSidebarEvents();
  
  return sidebar;
}

/**
 * Initialize sidebar event listeners
 */
function initializeSidebarEvents() {
  // Close button
  document.getElementById('physai-close-sidebar')?.addEventListener('click', () => {
    document.getElementById('physai-sidebar')?.classList.remove('open');
  });

  // Tab switching
  document.querySelectorAll('.physai-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab;
      
      // Update tab active state
      document.querySelectorAll('.physai-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      
      // Show corresponding panel
      document.querySelectorAll('.physai-tab-content').forEach(panel => panel.classList.add('hidden'));
      document.getElementById(`physai-${tabName}-panel`)?.classList.remove('hidden');
    });
  });

  // Feed drop zone
  const dropZone = document.getElementById('physai-drop-zone');
  const fileInput = document.getElementById('physai-file-input');
  
  dropZone?.addEventListener('click', () => fileInput?.click());
  
  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  
  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });
  
  dropZone?.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
      await processPDF(files[0]);
    }
  });
  
  fileInput?.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      await processPDF(e.target.files[0]);
    }
  });

  // Writer buttons
  document.getElementById('physai-generate-latex')?.addEventListener('click', generateLaTeXHandler);
  document.getElementById('physai-generate-figure')?.addEventListener('click', generateFigureHandler);
  document.getElementById('physai-copy-latex')?.addEventListener('click', copyLatexHandler);
  document.getElementById('physai-download-latex')?.addEventListener('click', downloadLatexHandler);
  document.getElementById('physai-open-overleaf')?.addEventListener('click', openOverleafHandler);
}

/**
 * Process uploaded PDF
 */
async function processPDF(file) {
  const progressBar = document.getElementById('physai-feed-progress');
  const progressFill = document.getElementById('physai-progress-fill');
  const progressText = document.getElementById('physai-progress-text');
  const statusDiv = document.getElementById('physai-feed-status');
  
  progressBar?.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Reading PDF...';
  
  try {
    // Read PDF as array buffer
    const arrayBuffer = await file.arrayBuffer();
    progressFill.style.width = '20%';
    progressText.textContent = 'Extracting text...';
    
    // Extract text using pdf.js
    const text = await extractTextFromPDF(arrayBuffer);
    progressFill.style.width = '50%';
    progressText.textContent = 'Generating summary...';
    
    // Get metadata
    const metadata = await extractPaperMetadata();
    
    // Generate summary via background script
    const summaryResponse = await chrome.runtime.sendMessage({
      type: 'SUMMARIZE_PAPER',
      text: text
    });
    
    if (!summaryResponse.success) {
      throw new Error(summaryResponse.error);
    }
    
    progressFill.style.width = '70%';
    progressText.textContent = 'Generating embedding...';
    
    // Generate embedding
    const embeddingText = `${metadata.title} ${metadata.abstract} ${JSON.stringify(summaryResponse.data)}`;
    const embeddingResponse = await chrome.runtime.sendMessage({
      type: 'GENERATE_EMBEDDING',
      text: embeddingText
    });
    
    if (!embeddingResponse.success) {
      throw new Error(embeddingResponse.error);
    }
    
    progressFill.style.width = '90%';
    progressText.textContent = 'Saving to database...';
    
    // Save to IndexedDB
    await chrome.runtime.sendMessage({
      type: 'ADD_PAPER',
      data: {
        title: metadata.title || summaryResponse.data.title || 'Untitled',
        authors: metadata.authors || summaryResponse.data.authors || [],
        summary: summaryResponse.data,
        embedding: embeddingResponse.data,
        pdfBlob: arrayBuffer,
        sourceUrl: metadata.url,
        pdfUrl: metadata.pdfUrl
      }
    });
    
    progressFill.style.width = '100%';
    progressText.textContent = 'Complete!';
    
    statusDiv.innerHTML = '<div class="physai-success">✅ Paper saved successfully!</div>';
    
    // Refresh reading panel
    await findRelatedPapers();
    
  } catch (error) {
    console.error('Error processing PDF:', error);
    statusDiv.innerHTML = `<div class="physai-error">❌ Error: ${error.message}</div>`;
  }
  
  setTimeout(() => {
    progressBar?.classList.add('hidden');
  }, 2000);
}

/**
 * Extract text from PDF using pdf.js
 */
async function extractTextFromPDF(arrayBuffer) {
  // Load pdf.js from lib
  if (typeof pdfjsLib === 'undefined') {
    // Try to load from lib folder
    await loadScript(chrome.runtime.getURL('lib/pdf.js/pdf.js'));
  }
  
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.js/pdf.worker.js');
  
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n\n';
  }
  
  return fullText;
}

/**
 * Load external script
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Find related papers based on current page
 */
async function findRelatedPapers() {
  const container = document.getElementById('physai-similar-papers');
  if (!container) return;
  
  container.innerHTML = '<div class="physai-loading">Finding related papers...</div>';
  
  try {
    // Extract page text
    const pageText = await extractPageText();
    const metadata = await extractPaperMetadata();
    
    // Generate embedding
    const embeddingText = `${metadata.title} ${metadata.abstract} ${pageText}`;
    const embeddingResponse = await chrome.runtime.sendMessage({
      type: 'GENERATE_EMBEDDING',
      text: embeddingText
    });
    
    if (!embeddingResponse.success) {
      throw new Error(embeddingResponse.error);
    }
    
    // Find similar papers
    const similarResponse = await chrome.runtime.sendMessage({
      type: 'FIND_SIMILAR_PAPERS',
      embedding: embeddingResponse.data,
      threshold: 0.7,
      limit: 5
    });
    
    if (!similarResponse.success) {
      throw new Error(similarResponse.error);
    }
    
    const papers = similarResponse.data;
    
    if (papers.length === 0) {
      container.innerHTML = '<div class="physai-empty">No related papers found. Try feeding some papers first!</div>';
      return;
    }
    
    // Render papers
    container.innerHTML = papers.map(paper => `
      <div class="physai-paper-card" data-id="${paper.id}">
        <div class="physai-paper-score">${Math.round(paper.similarity * 100)}%</div>
        <div class="physai-paper-title">${paper.title || 'Untitled'}</div>
        <div class="physai-paper-authors">${(paper.authors || []).join(', ')}</div>
        <div class="physai-paper-match-points">
          <strong>Match Points:</strong>
          <ul>
            <li><strong>Background:</strong> ${paper.summary?.background || 'N/A'}</li>
            <li><strong>Views:</strong> ${paper.summary?.views || 'N/A'}</li>
            <li><strong>Innovation:</strong> ${paper.summary?.innovation || 'N/A'}</li>
            <li><strong>Errors/Deficiencies:</strong> ${paper.summary?.errors_and_deficiencies || 'N/A'}</li>
            <li><strong>Conclusions:</strong> ${paper.summary?.main_conclusions || 'N/A'}</li>
          </ul>
        </div>
        <div class="physai-paper-actions">
          <button class="physai-btn-small physai-view-pdf" data-id="${paper.id}">📄 View PDF</button>
          ${paper.pdfUrl ? `<a href="${paper.pdfUrl}" target="_blank" class="physai-btn-small">🔗 Link</a>` : ''}
        </div>
      </div>
    `).join('');
    
    // Add view PDF handlers
    container.querySelectorAll('.physai-view-pdf').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const paperId = parseInt(e.target.dataset.id);
        const response = await chrome.runtime.sendMessage({
          type: 'GET_PDF_BLOB',
          id: paperId
        });
        
        if (response.success && response.data) {
          const blob = new Blob([response.data], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
        }
      });
    });
    
  } catch (error) {
    console.error('Error finding related papers:', error);
    container.innerHTML = `<div class="physai-error">❌ Error: ${error.message}</div>`;
  }
}

/**
 * Generate LaTeX handler
 */
async function generateLaTeXHandler() {
  const textarea = document.getElementById('physai-writer-text');
  const useReferences = document.getElementById('physai-use-references').checked;
  const outputDiv = document.getElementById('physai-writer-output');
  const outputContent = document.getElementById('physai-output-content');
  
  if (!textarea?.value.trim()) {
    alert('Please enter your paper topic or draft');
    return;
  }
  
  outputDiv.classList.remove('hidden');
  outputContent.textContent = 'Generating LaTeX...';
  
  try {
    let referencePapers = [];
    
    if (useReferences) {
      // Get selected papers
      const papersResponse = await chrome.runtime.sendMessage({ type: 'GET_ALL_PAPERS' });
      if (papersResponse.success) {
        referencePapers = papersResponse.data.slice(0, 3);
      }
    }
    
    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_LATEX',
      referencePapers: referencePapers,
      userRequest: textarea.value
    });
    
    if (response.success) {
      outputContent.textContent = response.data;
      window.generatedLatex = response.data;
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    outputContent.textContent = `Error: ${error.message}`;
  }
}

/**
 * Generate figure prompt handler
 */
async function generateFigureHandler() {
  const textarea = document.getElementById('physai-writer-text');
  const outputDiv = document.getElementById('physai-writer-output');
  const outputContent = document.getElementById('physai-output-content');
  
  if (!textarea?.value.trim()) {
    alert('Please describe the figure you want to generate');
    return;
  }
  
  outputDiv.classList.remove('hidden');
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_FIGURE_PROMPT',
      description: textarea.value
    });
    
    if (response.success) {
      outputContent.textContent = response.data;
      window.generatedLatex = response.data;
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    outputContent.textContent = `Error: ${error.message}`;
  }
}

/**
 * Copy LaTeX handler
 */
function copyLatexHandler() {
  const latex = window.generatedLatex;
  if (latex) {
    navigator.clipboard.writeText(latex);
    alert('Copied to clipboard!');
  }
}

/**
 * Download LaTeX handler
 */
function downloadLatexHandler() {
  const latex = window.generatedLatex;
  if (latex) {
    const blob = new Blob([latex], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paper.tex';
    a.click();
    URL.revokeObjectURL(url);
  }
}

/**
 * Open Overleaf handler
 */
function openOverleafHandler() {
  window.open('https://www.overleaf.com/project/new', '_blank');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (isPaperPage()) {
      createSidebar();
      findRelatedPapers();
    }
  });
} else {
  if (isPaperPage()) {
    createSidebar();
    findRelatedPapers();
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_SIDEBAR') {
    const sidebar = document.getElementById('physai-sidebar');
    if (sidebar) {
      sidebar.classList.add('open');
    } else {
      createSidebar();
    }
  }
  
  if (message.type === 'FIND_RELATED') {
    findRelatedPapers();
  }
});
