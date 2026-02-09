// TB Storyboard - Content Script v1.2.0
// Clean implementation following exact flow

console.log('[TBS] Content script loaded v1.2.0');

// ==================== Config ====================
const CONFIG = {
  pollInterval: 1000,
  genTimeout: 300000, // 5 minutes
  shortDelay: 500,
  mediumDelay: 1000,
  longDelay: 3000
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

// ==================== MAIN STORYBOARD FLOW ====================
async function runStoryboard(options) {
  const { prompts, images, aspectRatio, outputs, mode } = options;
  
  log('========================================');
  log('=== TB Storyboard Starting ===');
  log('========================================');
  log('Prompts:', prompts.length);
  log('Images:', images.length);
  log('Mode:', mode);
  log('Aspect Ratio:', aspectRatio);
  log('Outputs:', outputs);
  
  const results = {
    success: false,
    scenesCompleted: 0,
    totalScenes: prompts.length,
    error: null
  };
  
  try {
    // ========================================
    // STEP 1: Clear timeline before starting
    // ========================================
    log('\n--- STEP 1: Clear Timeline ---');
    await clearTimeline();
    await delay(CONFIG.mediumDelay);
    
    // ========================================
    // STEP 2: Switch to correct mode
    // ========================================
    log('\n--- STEP 2: Switch Mode ---');
    log('Target mode:', mode);
    const modeResult = await switchMode(mode);
    if (!modeResult.success) {
      log('WARNING: Could not switch mode, continuing anyway...');
    }
    await delay(CONFIG.mediumDelay);
    
    // ========================================
    // STEP 3: Set Aspect Ratio and Outputs
    // ========================================
    log('\n--- STEP 3: Set Settings ---');
    await setSettings(aspectRatio, outputs);
    await delay(CONFIG.shortDelay);
    
    // ========================================
    // STEP 4: Upload images (if any)
    // ========================================
    if (images.length > 0) {
      log('\n--- STEP 4: Upload Images ---');
      for (let i = 0; i < images.length; i++) {
        log(`Uploading image ${i + 1}/${images.length}...`);
        await uploadImage(images[i], aspectRatio);
        log(`✅ Image ${i + 1} uploaded`);
      }
      await delay(CONFIG.mediumDelay);
    } else {
      log('\n--- STEP 4: No images to upload ---');
    }
    
    // ========================================
    // STEP 5-6: Generate each scene
    // ========================================
    log('\n--- STEP 5-6: Generate Scenes ---');
    
    for (let i = 0; i < prompts.length; i++) {
      log(`\n========== Scene ${i + 1}/${prompts.length} ==========`);
      
      // For scene 2+, need to add/extend from last clip
      if (i > 0) {
        log('Scene > 1: Need to extend from previous');
        
        // Click last clip in timeline
        await clickLastClipInTimeline();
        await delay(CONFIG.shortDelay);
        
        // Move playhead to end
        await movePlayheadToEnd();
        await delay(CONFIG.shortDelay);
        
        // Click + to extend
        await clickExtendButton();
        await delay(CONFIG.mediumDelay);
      }
      
      // Fill prompt
      log('Filling prompt...');
      const promptResult = await fillPrompt(prompts[i]);
      if (!promptResult.success) {
        log('ERROR: Could not fill prompt');
        results.failedScenes.push(i + 1);
        continue;
      }
      await delay(CONFIG.shortDelay);
      
      // Wait for generate button to be enabled
      await waitForGenerateButton();
      
      // Click generate
      log('Clicking generate...');
      const genResult = await clickGenerate();
      if (!genResult.success) {
        log('ERROR: Could not click generate');
        continue;
      }
      
      // Wait for generation to complete
      log('Waiting for generation...');
      const waitResult = await waitForGeneration();
      
      if (waitResult.success) {
        results.scenesCompleted++;
        log(`✅ Scene ${i + 1} complete!`);
      } else {
        log(`❌ Scene ${i + 1} failed: ${waitResult.error}`);
      }
    }
    
    // ========================================
    // STEP 7: Verify clip count
    // ========================================
    log('\n--- STEP 7: Verify Clip Count ---');
    const clipCount = countClipsInTimeline();
    log(`Clips in timeline: ${clipCount}`);
    log(`Expected: ${prompts.length}`);
    
    if (clipCount < prompts.length) {
      log('WARNING: Not all clips generated!');
    }
    
    // ========================================
    // STEP 8-9: Download
    // ========================================
    if (results.scenesCompleted > 0) {
      log('\n--- STEP 8: Download ---');
      await downloadVideo();
    }
    
    results.success = results.scenesCompleted > 0;
    
    log('\n========================================');
    log('=== TB Storyboard Complete ===');
    log(`Scenes completed: ${results.scenesCompleted}/${prompts.length}`);
    log('========================================');
    
  } catch (error) {
    log('ERROR:', error.message);
    results.error = error.message;
  }
  
  return results;
}

// ==================== STEP 1: Clear Timeline ====================
async function clearTimeline() {
  log('Clearing timeline...');
  
  // TODO: ถ้าลูกพี่ต้องการให้ clear ก่อน บอกผมว่าปุ่ม clear อยู่ตรงไหน
  // ตอนนี้จะข้ามไปก่อน ถ้า timeline ว่างอยู่แล้ว
  
  const clipCount = countClipsInTimeline();
  if (clipCount === 0) {
    log('Timeline is empty, no need to clear');
    return { success: true };
  }
  
  log(`Found ${clipCount} clips, need to clear`);
  // TODO: Implement clear logic - ต้องถามลูกพี่ว่าปุ่มอยู่ไหน
  
  return { success: true };
}

// ==================== STEP 2: Switch Mode ====================
async function switchMode(targetMode) {
  log('Looking for mode dropdown...');
  
  // Find mode dropdown button at bottom of screen
  const modeButton = findModeDropdown();
  if (!modeButton) {
    log('Mode dropdown not found');
    return { success: false };
  }
  
  log('Found mode button, clicking...');
  modeButton.click();
  await delay(CONFIG.shortDelay);
  
  // Find and click target option
  const options = document.querySelectorAll('div, span');
  for (const opt of options) {
    const text = (opt.innerText || '').trim();
    const rect = opt.getBoundingClientRect();
    
    if (text === targetMode && rect.width > 50) {
      log('Clicking option:', text);
      opt.click();
      await delay(CONFIG.shortDelay);
      return { success: true };
    }
  }
  
  log('Target mode option not found');
  return { success: false };
}

function findModeDropdown() {
  // Mode dropdown is at bottom, contains current mode text
  const elements = document.querySelectorAll('div, button');
  
  for (const el of elements) {
    const text = (el.innerText || '').trim();
    const rect = el.getBoundingClientRect();
    
    // Bottom of screen, reasonable width
    if (rect.top > 550 && rect.width > 100 && rect.width < 300) {
      if (text.includes('Text to Video') || text.includes('Frames to Video') || 
          text.includes('Ingredients to Video') || text.includes('Create Image')) {
        return el;
      }
    }
  }
  
  return null;
}

// ==================== STEP 3: Set Settings ====================
async function setSettings(aspectRatio, outputs) {
  log('Setting aspect ratio:', aspectRatio);
  log('Setting outputs:', outputs);
  
  // TODO: ถ้าลูกพี่ต้องการให้ตั้งค่า บอกผมว่าปุ่ม settings อยู่ตรงไหน
  // ดูจากรูปน่าจะเป็นปุ่มด้านขวาล่าง (icon tune/settings)
  
  return { success: true };
}

// ==================== STEP 4: Upload Image ====================
async function uploadImage(image, aspectRatio) {
  log('Looking for + button to add image...');
  
  // Find + button
  const addBtn = findAddButton();
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
  
  // Convert base64 to file and upload
  const response = await fetch(image.base64);
  const blob = await response.blob();
  const file = new File([blob], image.name, { type: image.type });
  
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  
  log('File uploaded, waiting for crop dialog...');
  await delay(8000);
  
  // Handle crop dialog
  await handleCropDialog(aspectRatio);
  await delay(CONFIG.longDelay);
  
  return { success: true };
}

function findAddButton() {
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    const text = (btn.innerText || '').trim().toLowerCase();
    const rect = btn.getBoundingClientRect();
    
    // + button near prompt area (bottom)
    if ((text === 'add' || text === '+') && rect.top > 600) {
      return btn;
    }
  }
  return null;
}

async function handleCropDialog(aspectRatio) {
  log('Looking for Crop dialog...');
  
  // Wait for dialog
  await delay(CONFIG.mediumDelay);
  
  // Find aspect ratio combobox and select correct ratio
  // TODO: ถ้าลูกพี่ต้องการให้เลือก aspect ratio ใน crop dialog บอกผม
  
  // Find and click "Crop and Save" button
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

// ==================== STEP 5: Fill Prompt ====================
async function fillPrompt(text) {
  log('Looking for prompt textarea...');
  
  const textareas = document.querySelectorAll('textarea');
  let promptInput = null;
  
  for (const ta of textareas) {
    const rect = ta.getBoundingClientRect();
    // Prompt textarea is at bottom, wide
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
  
  log('Prompt filled:', text.substring(0, 50) + '...');
  return { success: true };
}

// ==================== Wait for Generate Button ====================
async function waitForGenerateButton() {
  log('Waiting for generate button to be enabled...');
  
  for (let i = 0; i < 30; i++) {
    const btn = findGenerateButton();
    if (btn && !btn.disabled) {
      log('Generate button is ready');
      return { success: true };
    }
    await delay(CONFIG.shortDelay);
  }
  
  log('Generate button still disabled');
  return { success: false };
}

function findGenerateButton() {
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    const html = btn.innerHTML || '';
    if (html.includes('arrow_forward')) {
      return btn;
    }
  }
  return null;
}

// ==================== Click Generate ====================
async function clickGenerate() {
  const btn = findGenerateButton();
  if (!btn) {
    log('Generate button not found');
    return { success: false };
  }
  
  if (btn.disabled) {
    log('Generate button is disabled');
    return { success: false };
  }
  
  log('Clicking generate button');
  btn.click();
  return { success: true };
}

// ==================== Wait for Generation ====================
async function waitForGeneration() {
  log('Waiting for generation to complete...');
  
  const startTime = Date.now();
  let lastPercent = -1;
  
  // Count Add to scene buttons before
  const initialCount = countAddToSceneButtons();
  log('Initial Add to scene count:', initialCount);
  
  while (Date.now() - startTime < CONFIG.genTimeout) {
    await delay(CONFIG.pollInterval);
    
    // Check percentage
    const percent = getLoadingPercent();
    if (percent >= 0 && percent !== lastPercent) {
      log('Progress:', percent + '%');
      lastPercent = percent;
    }
    
    // Check if Add to scene count increased (new clip completed)
    const currentCount = countAddToSceneButtons();
    if (currentCount > initialCount) {
      log('New Add to scene button appeared!');
      await delay(CONFIG.mediumDelay);
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

function countAddToSceneButtons() {
  let count = 0;
  const elements = document.querySelectorAll('button, div');
  for (const el of elements) {
    const text = (el.innerText || '').toLowerCase();
    if (text === 'add to scene') count++;
  }
  return count;
}

// ==================== Click Last Clip ====================
async function clickLastClipInTimeline() {
  log('Clicking last clip in timeline...');
  
  // TODO: ถ้าลูกพี่ต้องการให้คลิกคลิปสุดท้าย บอกผมว่า element อยู่ตรงไหน
  // น่าจะเป็น thumbnail ใน timeline area (bottom)
  
  return { success: true };
}

// ==================== Move Playhead to End ====================
async function movePlayheadToEnd() {
  log('Moving playhead to end...');
  
  // TODO: ถ้าลูกพี่ต้องการให้เลื่อน playhead บอกผมว่าทำยังไง
  
  return { success: true };
}

// ==================== Click Extend Button ====================
async function clickExtendButton() {
  log('Looking for + (extend) button...');
  
  // Find + button in timeline area
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    const text = (btn.innerText || '').trim();
    const rect = btn.getBoundingClientRect();
    
    // + button in timeline area (y > 450)
    if ((text === '+' || text === 'add') && rect.top > 450 && rect.top < 600) {
      log('Found extend button, clicking...');
      btn.click();
      return { success: true };
    }
  }
  
  log('Extend button not found');
  return { success: false };
}

// ==================== Count Clips in Timeline ====================
function countClipsInTimeline() {
  // Count thumbnails/clips in timeline
  // TODO: ถ้าลูกพี่ต้องการให้นับคลิป บอกผมว่า element อยู่ตรงไหน
  
  // For now, use Add to scene count as proxy
  return countAddToSceneButtons();
}

// ==================== STEP 8: Download ====================
async function downloadVideo() {
  log('Starting download process...');
  
  // Find download button in timeline area (bottom right)
  const buttons = document.querySelectorAll('button');
  let downloadBtn = null;
  
  for (const btn of buttons) {
    const html = btn.innerHTML || '';
    const rect = btn.getBoundingClientRect();
    
    // Download button at bottom right
    if (rect.top > 450 && rect.left > 800) {
      if (html.includes('download') || html.includes('file_download') || html.includes('save_alt')) {
        downloadBtn = btn;
        break;
      }
    }
  }
  
  if (!downloadBtn) {
    log('Download button not found');
    return { success: false };
  }
  
  log('Clicking download button...');
  downloadBtn.click();
  await delay(CONFIG.mediumDelay);
  
  // Wait for render and Download popup
  log('Waiting for render to complete...');
  
  for (let i = 0; i < 120; i++) { // 2 minutes max
    // Look for Download link/button in popup (top right)
    const elements = document.querySelectorAll('a, button');
    for (const el of elements) {
      const text = (el.innerText || '').trim();
      const rect = el.getBoundingClientRect();
      
      // Download link should be in top-right area
      if (text === 'Download' && rect.top < 200 && rect.left > 600) {
        log('Found Download link, clicking...');
        el.click();
        await delay(CONFIG.mediumDelay);
        
        // Now find and click Dismiss
        await clickDismiss();
        return { success: true };
      }
    }
    
    await delay(CONFIG.pollInterval);
    if (i % 10 === 0) log('Still waiting for render...', i + 's');
  }
  
  log('Render timeout');
  return { success: false };
}

async function clickDismiss() {
  log('Looking for Dismiss button...');
  
  const elements = document.querySelectorAll('a, button, span');
  for (const el of elements) {
    const text = (el.innerText || '').trim();
    if (text === 'Dismiss') {
      log('Clicking Dismiss');
      el.click();
      return { success: true };
    }
  }
  
  log('Dismiss button not found');
  return { success: false };
}

// ==================== Init ====================
log('Content script ready');
chrome.runtime.sendMessage({ action: 'contentReady' });
