/**
 * PhysAI Paper Assistant - Settings Script
 * Handles all settings page interactions
 */

// Settings keys
const SETTINGS_KEYS = [
  'llmProvider',
  'apiKey',
  'chatModel',
  'embeddingProvider',
  'embeddingModel',
  'similarityThreshold'
];

// Initialize settings page
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await updateStats();
  initializeEventListeners();
});

/**
 * Initialize event listeners
 */
function initializeEventListeners() {
  // Save button
  document.getElementById('saveSettings')?.addEventListener('click', saveSettings);

  // Slider threshold
  document.getElementById('similarityThreshold')?.addEventListener('input', (e) => {
    document.getElementById('thresholdValue').textContent = `${e.target.value}%`;
  });

  // Clear data button
  document.getElementById('clearData')?.addEventListener('click', clearAllData);

  // Export data button
  document.getElementById('exportData')?.addEventListener('click', exportData);

  // Provider change - update model options
  document.getElementById('llmProvider')?.addEventListener('change', updateChatModelOptions);
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });

    if (response.success) {
      const settings = response.data;
      
      // Fill form fields
      SETTINGS_KEYS.forEach(key => {
        const element = document.getElementById(key);
        if (element && settings[key] !== undefined) {
          element.value = settings[key];
        }
      });

      // Update threshold display
      const threshold = settings.similarityThreshold || 70;
      document.getElementById('similarityThreshold').value = threshold;
      document.getElementById('thresholdValue').textContent = `${threshold}%`;
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  const statusEl = document.getElementById('statusMessage');
  
  try {
    // Gather all settings
    const settings = {};
    SETTINGS_KEYS.forEach(key => {
      const element = document.getElementById(key);
      if (element) {
        settings[key] = element.value;
      }
    });

    // Save each setting
    for (const [key, value] of Object.entries(settings)) {
      await chrome.runtime.sendMessage({
        type: 'SAVE_SETTING',
        key: key,
        value: key === 'similarityThreshold' ? parseInt(value) : value
      });
    }

    showStatus('Settings saved successfully!', 'success');
    
    // Update stats after saving
    await updateStats();
    
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Error saving settings: ' + error.message, 'error');
  }
}

/**
 * Update chat model options based on provider
 */
function updateChatModelOptions(e) {
  const provider = e.target.value;
  const modelSelect = document.getElementById('chatModel');
  
  if (!modelSelect) return;
  
  // Clear existing options
  modelSelect.innerHTML = '';
  
  const options = {
    openai: [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
    ],
    gemini: [
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' }
    ],
    grok: [
      { value: 'grok-2', label: 'Grok-2' },
      { value: 'grok-beta', label: 'Grok-Beta' }
    ],
    claude: [
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' }
    ]
  };

  const providerOptions = options[provider] || [];
  providerOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    modelSelect.appendChild(option);
  });
}

/**
 * Update database statistics
 */
async function updateStats() {
  try {
    // Get paper count
    const papersResponse = await chrome.runtime.sendMessage({ type: 'GET_ALL_PAPERS' });
    const paperCount = papersResponse.success ? papersResponse.data.length : 0;
    
    document.getElementById('paperCount').textContent = paperCount;
    
    // Estimate database size (rough estimate based on papers)
    // In a real implementation, you'd use the Storage API
    const estimatedSizeKB = Math.round(paperCount * 50); // ~50KB per paper average
    document.getElementById('dbSize').textContent = `${estimatedSizeKB} KB`;
    
  } catch (error) {
    console.error('Error updating stats:', error);
  }
}

/**
 * Clear all data
 */
async function clearAllData() {
  if (!confirm('Are you sure you want to delete all papers and settings? This action cannot be undone.')) {
    return;
  }

  try {
    // Get all papers
    const papersResponse = await chrome.runtime.sendMessage({ type: 'GET_ALL_PAPERS' });
    
    if (papersResponse.success && papersResponse.data.length > 0) {
      // Delete each paper
      for (const paper of papersResponse.data) {
        await chrome.runtime.sendMessage({
          type: 'DELETE_PAPER',
          id: paper.id
        });
      }
    }

    showStatus('All data cleared successfully!', 'success');
    await updateStats();
    
  } catch (error) {
    console.error('Error clearing data:', error);
    showStatus('Error clearing data: ' + error.message, 'error');
  }
}

/**
 * Export all data as JSON
 */
async function exportData() {
  try {
    // Get all papers
    const papersResponse = await chrome.runtime.sendMessage({ type: 'GET_ALL_PAPERS' });
    const papers = papersResponse.success ? papersResponse.data : [];
    
    // Get settings (excluding API key for security)
    const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const settings = settingsResponse.success ? { ...settingsResponse.data } : {};
    delete settings.apiKey; // Don't export API key
    
    // Create export object
    const exportData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      settings: settings,
      papers: papers.map(p => ({
        title: p.title,
        authors: p.authors,
        summary: p.summary,
        sourceUrl: p.sourceUrl,
        dateAdded: p.dateAdded
        // Note: Not exporting pdfBlob to keep file size manageable
      }))
    };
    
    // Create and download file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `physai-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showStatus('Data exported successfully!', 'success');
    
  } catch (error) {
    console.error('Error exporting data:', error);
    showStatus('Error exporting data: ' + error.message, 'error');
  }
}

/**
 * Show status message
 */
function showStatus(message, type) {
  const statusEl = document.getElementById('statusMessage');
  if (!statusEl) return;
  
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    statusEl.className = 'status-message';
  }, 5000);
}
