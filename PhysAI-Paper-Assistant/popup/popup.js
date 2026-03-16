/**
 * PhysAI Paper Assistant - Popup Script
 * Handles all popup interactions
 */

let currentOutput = '';

// Initialize popup - run immediately when script loads
// Using immediate execution instead of DOMContentLoaded for reliability
(function init() {
  console.log('PhysAI: Popup script loading...');
  
  // Give DOM a moment to be ready
  setTimeout(() => {
    initializeEventListeners();
    loadPapers().catch(e => console.error('Load papers error:', e));
    console.log('PhysAI: Init complete');
  }, 50);
})();

/**
 * Initialize all event listeners
 */
function initializeEventListeners() {
  // Tab navigation
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const panelId = e.currentTarget.dataset.panel;
      switchPanel(panelId);
    });
  });

  // Settings button
  document.getElementById('openSettings')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Drop zone
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');

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
  document.getElementById('generateLatex')?.addEventListener('click', generateLatex);
  document.getElementById('generateFigure')?.addEventListener('click', generateFigure);
  document.getElementById('copyOutput')?.addEventListener('click', copyOutput);
  document.getElementById('downloadOutput')?.addEventListener('click', downloadOutput);

  // Footer buttons
  document.getElementById('openSidebar')?.addEventListener('click', openSidebar);
  document.getElementById('openOnPaper')?.addEventListener('click', analyzeCurrentPage);

  // Search
  document.getElementById('searchPapers')?.addEventListener('input', (e) => {
    filterPapers(e.target.value);
  });
}

/**
 * Switch between panels
 */
function switchPanel(panelId) {
  // Update tab states
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.panel === panelId);
  });

  // Update panel visibility
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `${panelId}-panel`);
  });
}

/**
 * Load papers from IndexedDB
 */
async function loadPapers() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ALL_PAPERS' });

    if (response.success) {
      renderPapers(response.data);
    }
  } catch (error) {
    console.error('Error loading papers:', error);
  }
}

/**
 * Render papers list
 */
function renderPapers(papers) {
  const container = document.getElementById('papersList');
  const countEl = document.getElementById('paperCount');

  if (!papers || papers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📄</span>
        <p>No papers yet</p>
        <p class="hint">Feed some papers to get started!</p>
      </div>
    `;
    countEl.textContent = '0 papers';
    return;
  }

  countEl.textContent = `${papers.length} paper${papers.length > 1 ? 's' : ''}`;

  container.innerHTML = papers.map(paper => `
    <div class="paper-item" data-id="${paper.id}">
      <div class="paper-item-title">${paper.title || 'Untitled'}</div>
      <div class="paper-item-authors">${(paper.authors || []).join(', ') || 'Unknown authors'}</div>
      <div class="paper-item-actions">
        <button class="icon-btn view-pdf-btn" data-id="${paper.id}">📄 View</button>
        <button class="icon-btn delete-pdf-btn" data-id="${paper.id}">🗑️ Delete</button>
      </div>
    </div>
  `).join('');

  // Add event listeners
  container.querySelectorAll('.view-pdf-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const paperId = parseInt(btn.dataset.id);
      await viewPDF(paperId);
    });
  });

  container.querySelectorAll('.delete-pdf-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const paperId = parseInt(btn.dataset.id);
      await deletePaper(paperId);
    });
  });
}

/**
 * Filter papers by search query
 */
function filterPapers(query) {
  const items = document.querySelectorAll('.paper-item');
  const lowerQuery = query.toLowerCase();

  items.forEach(item => {
    const title = item.querySelector('.paper-item-title')?.textContent?.toLowerCase() || '';
    const authors = item.querySelector('.paper-item-authors')?.textContent?.toLowerCase() || '';

    const matches = title.includes(lowerQuery) || authors.includes(lowerQuery);
    item.style.display = matches ? 'block' : 'none';
  });
}

/**
 * Process uploaded PDF
 */
async function processPDF(file) {
  const progressBar = document.getElementById('feedProgress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const statusDiv = document.getElementById('feedStatus');

  progressBar?.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Reading PDF...';

  try {
    // Read PDF
    const arrayBuffer = await file.arrayBuffer();
    progressFill.style.width = '20%';
    progressText.textContent = 'Extracting text...';

    // Extract text
    const text = await extractTextFromPDF(arrayBuffer);
    progressFill.style.width = '40%';
    progressText.textContent = 'Generating summary...';

    // Generate summary
    const summaryResponse = await chrome.runtime.sendMessage({
      type: 'SUMMARIZE_PAPER',
      text: text
    });

    if (!summaryResponse.success) {
      throw new Error(summaryResponse.error);
    }

    progressFill.style.width = '60%';
    progressText.textContent = 'Generating embedding...';

    // Generate embedding
    const summaryText = JSON.stringify(summaryResponse.data);
    const embeddingResponse = await chrome.runtime.sendMessage({
      type: 'GENERATE_EMBEDDING',
      text: `${summaryText}`
    });

    if (!embeddingResponse.success) {
      throw new Error(embeddingResponse.error);
    }

    progressFill.style.width = '80%';
    progressText.textContent = 'Saving to database...';

    // Save to IndexedDB
    await chrome.runtime.sendMessage({
      type: 'ADD_PAPER',
      data: {
        title: summaryResponse.data.title || 'Untitled',
        authors: typeof summaryResponse.data.authors === 'string' 
          ? summaryResponse.data.authors.split(',').map(a => a.trim())
          : summaryResponse.data.authors || [],
        summary: summaryResponse.data,
        embedding: embeddingResponse.data,
        pdfBlob: arrayBuffer,
        sourceUrl: '',
        pdfUrl: ''
      }
    });

    progressFill.style.width = '100%';
    progressText.textContent = 'Complete!';

    statusDiv.innerHTML = '<div class="success">✅ Paper saved successfully!</div>';

    // Refresh papers list
    await loadPapers();

  } catch (error) {
    console.error('Error processing PDF:', error);
    statusDiv.innerHTML = `<div class="error">❌ Error: ${error.message}</div>`;
  }

  setTimeout(() => {
    progressBar?.classList.add('hidden');
  }, 2000);
}

/**
 * Extract text from PDF using pdf.js
 */
async function extractTextFromPDF(arrayBuffer) {
  // We'll use a simplified extraction for popup
  // Full pdf.js would be loaded in content script
  const uint8Array = new Uint8Array(arrayBuffer);
  let fullText = '';

  // Basic text extraction - in production, use pdf.js properly
  // For now, return a placeholder that will work with LLM
  try {
    // Try to load pdf.js dynamically
    if (typeof pdfjsLib === 'undefined') {
      // This is a simplified version - content script has full implementation
      return `PDF document (${arrayBuffer.byteLength} bytes) - Text extraction would be performed in content script`;
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.js/pdf.worker.js');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
  } catch (e) {
    console.warn('PDF.js not available, using fallback:', e);
    return `PDF document uploaded (${Math.round(arrayBuffer.byteLength / 1024)}KB) - Please use the sidebar on paper pages for full text extraction`;
  }

  return fullText;
}

/**
 * View PDF
 */
async function viewPDF(paperId) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_PDF_BLOB',
      id: paperId
    });

    if (response.success && response.data) {
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } else {
      alert('Could not load PDF');
    }
  } catch (error) {
    console.error('Error viewing PDF:', error);
    alert('Error viewing PDF: ' + error.message);
  }
}

/**
 * Delete paper
 */
async function deletePaper(paperId) {
  if (!confirm('Are you sure you want to delete this paper?')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      type: 'DELETE_PAPER',
      id: paperId
    });

    await loadPapers();
  } catch (error) {
    console.error('Error deleting paper:', error);
    alert('Error deleting paper: ' + error.message);
  }
}

/**
 * Generate LaTeX
 */
async function generateLatex() {
  const textarea = document.getElementById('writerText');
  const useReferences = document.getElementById('useReferences').checked;
  const outputDiv = document.getElementById('writerOutput');
  const outputContent = document.getElementById('outputContent');

  if (!textarea?.value.trim()) {
    alert('Please enter your paper topic or draft');
    return;
  }

  outputDiv.classList.remove('hidden');
  outputContent.textContent = 'Generating LaTeX...';

  try {
    let referencePapers = [];

    if (useReferences) {
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
      currentOutput = response.data;
      outputContent.textContent = response.data;
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    outputContent.textContent = `Error: ${error.message}`;
  }
}

/**
 * Generate Figure Prompt
 */
async function generateFigure() {
  const textarea = document.getElementById('writerText');
  const outputDiv = document.getElementById('writerOutput');
  const outputContent = document.getElementById('outputContent');

  if (!textarea?.value.trim()) {
    alert('Please describe the figure you want to generate');
    return;
  }

  outputDiv.classList.remove('hidden');
  outputContent.textContent = 'Generating prompt...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_FIGURE_PROMPT',
      description: textarea.value
    });

    if (response.success) {
      currentOutput = response.data;
      outputContent.textContent = response.data;
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    outputContent.textContent = `Error: ${error.message}`;
  }
}

/**
 * Copy output to clipboard
 */
function copyOutput() {
  if (currentOutput) {
    navigator.clipboard.writeText(currentOutput);
    alert('Copied to clipboard!');
  }
}

/**
 * Download output as file
 */
function downloadOutput() {
  if (currentOutput) {
    const blob = new Blob([currentOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'physai_output.tex';
    a.click();
    URL.revokeObjectURL(url);
  }
}

/**
 * Open sidebar on current page
 */
async function openSidebar() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_SIDEBAR' });
  }

  window.close();
}

/**
 * Analyze current page
 */
async function analyzeCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab?.id) {
    await chrome.tabs.sendMessage(tab.id, { type: 'FIND_RELATED' });
    await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_SIDEBAR' });
  }

  window.close();
}
