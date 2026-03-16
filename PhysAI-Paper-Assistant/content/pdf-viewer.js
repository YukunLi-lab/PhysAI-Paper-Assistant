/**
 * PhysAI Paper Assistant - PDF Viewer Content Script
 * Handles PDF viewing on direct PDF URLs
 */

// Check if this is a PDF page
function isPDFPage() {
  return window.location.href.toLowerCase().endsWith('.pdf') || 
         document.contentType === 'application/pdf';
}

// Initialize PDF viewer
async function initPDFViewer() {
  if (!isPDFPage()) return;
  
  console.log('PhysAI: PDF page detected, initializing viewer...');
  
  // The actual PDF viewing is handled by Chrome's built-in PDF viewer
  // We inject the sidebar when the user activates the extension
  // This script just ensures we're ready for any PDF-related interactions
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PDF_TEXT') {
    // Extract text from current PDF page
    extractPDFText().then(text => {
      sendResponse({ success: true, data: text });
    });
    return true; // Keep channel open for async response
  }
});

/**
 * Extract text from PDF using pdf.js
 */
async function extractPDFText() {
  // Check if pdf.js is available
  if (typeof pdfjsLib === 'undefined') {
    console.warn('PhysAI: pdf.js not loaded');
    return '';
  }

  try {
    // Get PDF document from the current page
    // This assumes Chrome's PDF viewer has loaded the document
    const pdfUrl = window.location.href;
    
    // Load the PDF
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    
    // Extract text from each page
    for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
    
    return fullText;
  } catch (error) {
    console.error('PhysAI: Error extracting PDF text:', error);
    return '';
  }
}

// Initialize when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPDFViewer);
} else {
  initPDFViewer();
}
