// TB Storyboard - Content Script v1.0.0
// This runs on labs.google pages

console.log('[TBS] Content script loaded v1.0.0');

// ==================== Config ====================
const CONFIG = {
  pollInterval: 1000,
  genTimeout: 300000 // 5 minutes
};

// ==================== Utilities ====================
function log(...args) {
  console.log('[TBS]', ...args);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== Message Handler ====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('Received:', message.action);
  
  switch (message.action) {
    case 'START_STORYBOARD':
      runStoryboard(message.data).then(sendResponse);
      return true;
      
    case 'PING':
      sendResponse({ success: true, status: 'ready' });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

// ==================== Main Storyboard Flow ====================
async function runStoryboard(options) {
  const { prompts, images, aspectRatio, outputs, mode } = options;
  
  log('=== Starting Storyboard ===');
  log('Scenes:', prompts.length);
  log('Images:', images.length);
  log('Mode:', mode);
  log('Aspect Ratio:', aspectRatio);
  
  const results = {
    success: false,
    scenesCompleted: 0,
    error: null
  };
  
  try {
    // Step 1: Switch to correct mode
    log('Step 1: Switch to mode:', mode);
    await switchMode(mode);
    await delay(1000);
    
    // Step 2: Upload images (if any)
    if (images.length > 0) {
      log('Step 2: Upload', images.length, 'images');
      for (let i = 0; i < images.length; i++) {
        await uploadImage(images[i], aspectRatio);
        log(`Image ${i + 1}/${images.length} uploaded`);
      }
    }
    
    // Step 3: Generate each scene
    for (let i = 0; i < prompts.length; i++) {
      log(`\n--- Scene ${i + 1}/${prompts.length} ---`);
      
      if (i > 0) {
        // For subsequent scenes, use extend/add scene
        await addNextScene();
      }
      
      // Fill prompt
      await fillPrompt(prompts[i]);
      await delay(500);
      
      // Click generate
      await clickGenerate();
      
      // Wait for generation
      const genResult = await waitForGeneration();
      if (genResult.success) {
        results.scenesCompleted++;
        log(`✅ Scene ${i + 1} complete`);
      } else {
        log(`❌ Scene ${i + 1} failed:`, genResult.error);
      }
    }
    
    // Step 4: Download
    if (results.scenesCompleted > 0) {
      log('Step 4: Download video');
      await downloadVideo();
    }
    
    results.success = results.scenesCompleted > 0;
    log('=== Storyboard Complete ===');
    log(`Completed: ${results.scenesCompleted}/${prompts.length} scenes`);
    
  } catch (error) {
    log('Error:', error.message);
    results.error = error.message;
  }
  
  return results;
}

// ==================== Switch Mode ====================
async function switchMode(targetMode) {
  log('Switching to:', targetMode);
  
  // Find mode dropdown button (bottom of screen)
  const allElements = document.querySelectorAll('div, button, span');
  let modeBtn = null;
  
  for (const el of allElements) {
    const text = (el.innerText || '').trim();
    const rect = el.getBoundingClientRect();
    
    // Mode button is at bottom, shows current mode
    if (rect.top > 600 && rect.width > 100 && rect.width < 300) {
      if (text.includes('Text to Video') || text.includes('Frames to Video') || 
          text.includes('Ingredients to Video') || text.includes('Create Image')) {
        modeBtn = el;
        log('Found mode button:', text);
        break;
      }
    }
  }
  
  if (!modeBtn) {
    log('Mode button not found');
    return { success: false };
  }
  
  // Click to open dropdown
  modeBtn.click();
  await delay(500);
  
  // Find target option
  const options = document.querySelectorAll('div, span');
  for (const opt of options) {
    const text = (opt.innerText || '').trim();
    if (text === targetMode) {
      log('Clicking option:', text);
      opt.click();
      await delay(500);
      return { success: true };
    }
  }
  
  log('Target mode not found in dropdown');
  return { success: false };
}

// ==================== Upload Image ====================
async function uploadImage(image, aspectRatio) {
  log('Uploading image:', image.name);
  
  // Find + button
  const buttons = document.querySelectorAll('button');
  let addBtn = null;
  
  for (const btn of buttons) {
    const text = (btn.innerText || '').trim().toLowerCase();
    if (text === 'add' || text === '+') {
      addBtn = btn;
      break;
    }
  }
  
  if (!addBtn) {
    log('Add button not found');
    return { success: false };
  }
  
  addBtn.click();
  await delay(2000);
  
  // Find file input
  const fileInput = document.querySelector('input[type="file"]');
  if (!fileInput) {
    log('File input not found');
    return { success: false };
  }
  
  // Convert base64 to file
  const response = await fetch(image.base64);
  const blob = await response.blob();
  const file = new File([blob], image.name, { type: image.type });
  
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  
  log('File uploaded, waiting for crop dialog...');
  await delay(8000);
  
  // Click Crop and Save
  await clickCropAndSave(aspectRatio);
  await delay(3000);
  
  return { success: true };
}

// ==================== Click Crop and Save ====================
async function clickCropAndSave(aspectRatio) {
  log('Looking for Crop dialog...');
  
  // Select aspect ratio in crop dialog (combobox)
  const comboboxes = document.querySelectorAll('[role="combobox"], div, button');
  for (const el of comboboxes) {
    const text = (el.innerText || '').toLowerCase();
    if (text.includes('landscape') || text.includes('portrait') || text.includes('square')) {
      log('Found aspect ratio selector:', text);
      el.click();
      await delay(300);
      
      // Select correct ratio
      let target = 'landscape';
      if (aspectRatio === '9:16') target = 'portrait';
      if (aspectRatio === '1:1') target = 'square';
      
      const options = document.querySelectorAll('div, span, li');
      for (const opt of options) {
        if ((opt.innerText || '').toLowerCase().includes(target)) {
          opt.click();
          await delay(300);
          break;
        }
      }
      break;
    }
  }
  
  // Click Crop and Save button
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    const text = (btn.innerText || '').trim();
    if (text === 'Crop and Save' || text.includes('Crop and Save')) {
      log('Clicking Crop and Save');
      btn.click();
      return { success: true };
    }
  }
  
  log('Crop and Save button not found');
  return { success: false };
}

// ==================== Fill Prompt ====================
async function fillPrompt(text) {
  log('Filling prompt:', text.substring(0, 50) + '...');
  
  // Find textarea
  const textareas = document.querySelectorAll('textarea');
  let promptInput = null;
  
  for (const ta of textareas) {
    const rect = ta.getBoundingClientRect();
    if (rect.width > 200 && rect.top > 500) {
      promptInput = ta;
      break;
    }
  }
  
  if (!promptInput) {
    log('Prompt textarea not found');
    return { success: false };
  }
  
  // Use native setter for React
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  nativeSetter.call(promptInput, text);
  promptInput.dispatchEvent(new Event('input', { bubbles: true }));
  
  log('Prompt filled');
  return { success: true };
}

// ==================== Click Generate ====================
async function clickGenerate() {
  log('Looking for Generate button...');
  
  // Wait for button to be enabled
  for (let i = 0; i < 20; i++) {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const html = btn.innerHTML || '';
      if (html.includes('arrow_forward') && !btn.disabled) {
        log('Clicking Generate');
        btn.click();
        return { success: true };
      }
    }
    await delay(500);
  }
  
  log('Generate button not found or disabled');
  return { success: false };
}

// ==================== Wait for Generation ====================
async function waitForGeneration() {
  log('Waiting for generation...');
  
  const startTime = Date.now();
  let lastPercent = -1;
  
  while (Date.now() - startTime < CONFIG.genTimeout) {
    await delay(CONFIG.pollInterval);
    
    // Look for percentage
    const percent = getLoadingPercent();
    if (percent >= 0 && percent !== lastPercent) {
      log('Progress:', percent + '%');
      lastPercent = percent;
    }
    
    // Check if complete (Add to scene button appears)
    const addToScene = findAddToSceneButton();
    if (addToScene && lastPercent > 50) {
      log('Generation complete!');
      return { success: true };
    }
    
    // Check for 100%
    if (percent === 100) {
      await delay(2000);
      return { success: true };
    }
  }
  
  log('Generation timeout');
  return { success: false, error: 'Timeout' };
}

function getLoadingPercent() {
  const text = document.body.innerText;
  const match = text.match(/(\d+)\s*%/);
  if (match) {
    const num = parseInt(match[1]);
    if (num >= 0 && num <= 100) return num;
  }
  return -1;
}

function findAddToSceneButton() {
  const elements = document.querySelectorAll('button, div');
  for (const el of elements) {
    if ((el.innerText || '').toLowerCase().includes('add to scene')) {
      return el;
    }
  }
  return null;
}

// ==================== Add Next Scene ====================
async function addNextScene() {
  log('Adding next scene...');
  
  // Find + button in timeline
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    const text = (btn.innerText || '').trim();
    const rect = btn.getBoundingClientRect();
    
    // + button in timeline area
    if ((text === '+' || text === 'add') && rect.top > 450) {
      log('Clicking add scene button');
      btn.click();
      await delay(1000);
      return { success: true };
    }
  }
  
  log('Add scene button not found');
  return { success: false };
}

// ==================== Download Video ====================
async function downloadVideo() {
  log('Starting download...');
  
  // Find download button in timeline
  const buttons = document.querySelectorAll('button');
  let downloadBtn = null;
  
  for (const btn of buttons) {
    const html = btn.innerHTML || '';
    const rect = btn.getBoundingClientRect();
    
    if (rect.top > 450 && (html.includes('download') || html.includes('file_download'))) {
      downloadBtn = btn;
      break;
    }
  }
  
  if (!downloadBtn) {
    log('Download button not found');
    return { success: false };
  }
  
  downloadBtn.click();
  await delay(500);
  
  // Select quality (1080p)
  const options = document.querySelectorAll('div, span');
  for (const opt of options) {
    const text = (opt.innerText || '').trim();
    if (text.includes('1080') && !text.includes('credit')) {
      log('Selecting 1080p');
      opt.click();
      break;
    }
  }
  
  // Wait for Dismiss
  log('Waiting for download...');
  for (let i = 0; i < 60; i++) {
    const dismissBtns = document.querySelectorAll('button, a, span');
    for (const btn of dismissBtns) {
      if ((btn.innerText || '').trim() === 'Dismiss') {
        log('Clicking Dismiss');
        btn.click();
        return { success: true };
      }
    }
    await delay(1000);
  }
  
  return { success: true };
}

// ==================== Init ====================
log('Content script ready');
chrome.runtime.sendMessage({ action: 'contentReady' });
