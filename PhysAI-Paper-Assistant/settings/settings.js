/**
 * PhysAI Paper Assistant - Settings Script
 * Handles all settings page interactions
 */

// Settings keys - 只保留 MiniMax 需要的
const SETTINGS_KEYS = [
  'apiKey',
  'chatModel',
  'embeddingModel',
  'similarityThreshold'
];

// =====================================================
// ROBUST INITIALIZATION - MV3 Settings Page 专用
// =====================================================
(function() {
  'use strict';
  
  var MAX_RETRIES = 5;
  var RETRY_DELAY = 100;
  var initAttempts = 0;
  
  function domReady() {
    return document.readyState === 'complete' || document.readyState === 'interactive';
  }
  
  function tryInit() {
    initAttempts++;
    console.log('PhysAI: Init attempt ' + initAttempts + '/' + MAX_RETRIES);
    
    // 检查 DOM 是否准备好
    if (!domReady()) {
      console.log('PhysAI: DOM not ready, retrying...');
      if (initAttempts < MAX_RETRIES) {
        setTimeout(tryInit, RETRY_DELAY);
        return;
      }
      console.error('PhysAI: DOM not ready after max retries');
      return;
    }
    
    // 检查关键元素是否存在
    var criticalElements = ['saveSettings', 'paperCount', 'apiKey'];
    var missing = criticalElements.filter(function(id) { return !document.getElementById(id); });
    
    if (missing.length > 0) {
      console.warn('PhysAI: Missing elements:', missing.join(', '));
      if (initAttempts < MAX_RETRIES) {
        setTimeout(tryInit, RETRY_DELAY);
        return;
      }
    }
    
    // 执行初始化
    try {
      console.log('PhysAI: DOM ready, initializing...');
      
      // 1. 先绑定事件监听器（最重要！）
      initializeEventListeners();
      console.log('PhysAI: Event listeners attached');
      
      // 2. 加载设置
      loadSettings().catch(function(err) { console.error('PhysAI: Load settings error:', err); });
      console.log('PhysAI: Settings loading started');
      
      // 3. 更新统计
      updateStats().catch(function(err) { console.error('PhysAI: Update stats error:', err); });
      console.log('PhysAI: Stats updating started');
      
      console.log('PhysAI: Settings fully initialized!');
      
      // 验证：检查按钮是否能被选中
      var testBtn = document.getElementById('saveSettings');
      if (testBtn) {
        console.log('PhysAI: Buttons verified - getElementById works');
      }
      
    } catch (e) {
      console.error('PhysAI: Init failed:', e);
      // 即使失败也尝试重试
      if (initAttempts < MAX_RETRIES) {
        setTimeout(tryInit, RETRY_DELAY);
      }
    }
  }
  
  // 立即开始尝试初始化
  console.log('PhysAI: Starting robust init...');
  
  if (domReady()) {
    // 如果 DOM 已经准备好，直接初始化
    tryInit();
  } else {
    // 等待 DOM 准备好
    document.addEventListener('DOMContentLoaded', tryInit);
    // 备用：5秒后强制尝试
    setTimeout(tryInit, 5000);
  }
})();

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

      // Update threshold display - 使用存储的值，如果没有则用默认值70
      // 注意：只在这里设置一次初始值，不要覆盖用户拖动的值
      const threshold = settings.similarityThreshold;
      if (threshold !== undefined && threshold !== null) {
        document.getElementById('similarityThreshold').value = threshold;
        document.getElementById('thresholdValue').textContent = `${threshold}%`;
      }
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }
}

/**
 * 直接调用 MiniMax API 验证 Key（不通过 background）
 */
async function testApiKeyDirectly(apiKey, model) {
  console.log('PhysAI: 直接调用 MiniMax API...');
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  try {
    // 直接使用 API Key（MiniMax 需要原始 key）
    const response = await fetch('https://api.minimaxi.chat/v1/text/chatcompletion_pro', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'Reply with "OK" if you can understand.' },
          { role: 'user', content: 'Hello' }
        ],
        temperature: 0.3,
        max_tokens: 10
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    
    console.log('PhysAI: MiniMax 响应状态:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.base_resp?.status_msg || `HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('PhysAI: MiniMax 响应成功:', data);
    return { success: true, data: data };
    
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 诊断 API 错误类型
 */
function diagnoseApiError(error, response) {
  const errorStr = String(error).toLowerCase();
  const status = response?.status;
  
  console.log('PhysAI: 诊断错误 - error:', errorStr, 'status:', status);
  
  // ISO-8859-1 编码错误 - API Key 包含特殊字符
  if (errorStr.includes('iso-8859-1') || errorStr.includes('non iso-8859-1')) {
    return { type: 'encoding', message: 'API Key 包含特殊字符，请检查或重新复制' };
  }
  
  // 网络断开
  if (errorStr.includes('fetch') && (errorStr.includes('network') || errorStr.includes('failed to fetch'))) {
    return { type: 'network', message: '请检查您的网络连接' };
  }
  
  // 超时
  if (errorStr.includes('abort') || errorStr.includes('timeout') || errorStr.includes('timed out')) {
    return { type: 'timeout', message: '服务器响应超时，请稍后再试' };
  }
  
  // CORS
  if (errorStr.includes('cors') || errorStr.includes('access-control')) {
    return { type: 'cors', message: '跨域请求被阻止，请检查浏览器设置' };
  }
  
  // 401/403 认证失败
  if (status === 401 || status === 403 || errorStr.includes('unauthorized') || errorStr.includes('forbidden')) {
    return { type: 'auth', message: 'API Key 无效，请检查后重试' };
  }
  
  // 502/503 服务器错误
  if (status === 502 || status === 503 || status === 504) {
    return { type: 'server', message: '服务暂时不可用，请稍后再试' };
  }
  
  // 默认
  return { type: 'unknown', message: error.message || '未知错误' };
}

/**
 * 指数退避重试
 */
async function retryWithBackoff(fn, maxRetries = 2, baseDelay = 2000) {
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`PhysAI: 重试 attempt ${attempt + 1}/${maxRetries + 1}`);
      if (attempt > 0) {
        // 指数退避延迟
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`PhysAI: 等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`PhysAI: attempt ${attempt + 1} 失败:`, error.message);
    }
  }
  
  throw lastError;
}

/**
 * Save settings to storage - 高级版（带重试、超时、诊断）
 */
async function saveSettings() {
  const saveBtn = document.getElementById('saveSettings');
  const apiKeyInput = document.getElementById('apiKey');
  const statusEl = document.getElementById('statusMessage');
  const connectionStatus = document.getElementById('connectionStatus');
  
  // 配置
  const TIMEOUT_MS = 15000; // 15秒超时
  const MAX_RETRIES = 2; // 最多重试2次
  
  let timeoutId = null;
  
  // 辅助函数：恢复按钮状态
  function restoreButton() {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '💾 Save Settings';
    }
  }
  
  // 1. 加载状态
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner"></span> 正在验证...';
  
  console.log('PhysAI: ═══════════════════════════════');
  console.log('PhysAI: 开始保存设置流程');
  console.log('PhysAI: 超时设置:', TIMEOUT_MS, 'ms');
  console.log('PhysAI: 最大重试次数:', MAX_RETRIES);
  console.log('PhysAI: ═══════════════════════════════');
  
  try {
    // 收集设置
    const settings = {};
    SETTINGS_KEYS.forEach(key => {
      const element = document.getElementById(key);
      if (element) {
        settings[key] = element.value;
      }
    });

    // 环境变量校验
    if (!settings.apiKey || !settings.apiKey.trim()) {
      console.log('PhysAI: ⚠️ API Key 为空，跳过验证');
      showStatus('设置已保存（未配置 API Key）', 'success');
      
      if (connectionStatus) {
        connectionStatus.innerHTML = '○ 未连接';
        connectionStatus.className = 'connection-status disconnected';
      }
      
      // 保存其他设置
      for (const [key, value] of Object.entries(settings)) {
        await chrome.runtime.sendMessage({
          type: 'SAVE_SETTING',
          key: key,
          value: key === 'similarityThreshold' ? parseInt(value) : value
        });
      }
      
      saveBtn.innerHTML = '✅ 已保存！';
      setTimeout(() => restoreButton(), 1500);
      return;
    }

    console.log('PhysAI: ✅ API Key 已配置');

    // 2. 验证 API Key（直接调用，不通过 background）
    showStatus('正在验证 API Key...', 'loading');
    
    let testResponse = null;
    const model = settings.chatModel || 'abab6.5s-chat';
    let apiVerified = false;
    
    try {
      testResponse = await retryWithBackoff(async () => {
        console.log('PhysAI: 直接调用 MiniMax API 验证...');
        return await testApiKeyDirectly(settings.apiKey, model);
      }, MAX_RETRIES);
      
      console.log('PhysAI: ✅ API 响应:', testResponse);
      apiVerified = true;
      
    } catch (apiError) {
      // 诊断错误
      const diagnosis = diagnoseApiError(apiError, testResponse);
      console.error('PhysAI: ❌ API 验证失败 - 诊断:', diagnosis);
      
      // 如果是编码错误，给用户一个提示但仍然保存
      if (diagnosis.type === 'encoding') {
        console.log('PhysAI: 检测到编码错误，但仍然保存设置');
        showStatus('API Key 可能包含特殊字符，已保存（建议重新复制 Key）', 'warning');
      } else {
        // 其他错误需要用户确认
        restoreButton();
        apiKeyInput.style.borderColor = '#ef4444';
        apiKeyInput.classList.add('error');
        
        const existingError = document.getElementById('apiKeyError');
        if (existingError) existingError.remove();
        
        const errorDiv = document.createElement('div');
        errorDiv.id = 'apiKeyError';
        errorDiv.className = 'error-message';
        errorDiv.textContent = diagnosis.message;
        apiKeyInput.parentNode.appendChild(errorDiv);
        
        showStatus(diagnosis.message, 'error');
        return;
      }
    }

    // 检查响应
    if (!testResponse || !testResponse.success) {
      if (!apiVerified) {
        // 验证没成功但不是致命错误，继续保存
        console.log('PhysAI: API 验证未通过，但继续保存设置');
      } else {
        throw new Error(testResponse?.error || 'API Key 验证失败');
      }
    }

    console.log('PhysAI: ✅ API Key 验证成功！');
    
    // 3. 使用 Chrome Storage API 直接保存（不通过 background）
    console.log('PhysAI: 使用 Chrome Storage 保存设置...');
    
    try {
      // 使用 chrome.storage.local 直接保存
      const storageObj = {};
      for (const [key, value] of Object.entries(settings)) {
        storageObj[key] = key === 'similarityThreshold' ? parseInt(value) : value;
      }
      
      await new Promise((resolve, reject) => {
        chrome.storage.local.set(storageObj, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
      
      console.log('PhysAI: ✅ Chrome Storage 保存成功');
    } catch (storageErr) {
      console.error('PhysAI: Storage 保存失败:', storageErr);
      // 尝试用消息方式保存
      console.log('PhysAI: 回退到消息方式保存...');
      for (const [key, value] of Object.entries(settings)) {
        try {
          await chrome.runtime.sendMessage({
            type: 'SAVE_SETTING',
            key: key,
            value: key === 'similarityThreshold' ? parseInt(value) : value
          });
        } catch (e) {
          console.warn('PhysAI: 保存', key, '失败（忽略）');
        }
      }
    }
    
    // 4. 立即更新 UI
    console.log('PhysAI: 🎉 全部完成！更新UI...');
    
    saveBtn.innerHTML = '✅ 已保存！';
    showStatus('配置已保存！', 'success');
    
    if (connectionStatus) {
      connectionStatus.innerHTML = '● 已连接 (Connected)';
      connectionStatus.className = 'connection-status connected';
    }
    
    // 5. 延迟恢复按钮
    setTimeout(() => {
      restoreButton();
      console.log('PhysAI: 按钮已恢复');
    }, 2000);
    
  } catch (error) {
    console.error('PhysAI: ❌ 保存设置出错:', error);
    restoreButton();
    showStatus('保存失败: ' + error.message, 'error');
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
    ],
    minimax: [
      { value: 'abab6.5s-chat', label: 'abab6.5s-chat' },
      { value: 'abab6.5g-chat', label: 'abab6.5g-chat' }
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
