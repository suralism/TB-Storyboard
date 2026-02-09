// TB Storyboard - Content Script v1.3.4
// Clean implementation with correct detection

console.log('[TBS] Content script loaded v1.3.4');

// ==================== Config ====================
const CONFIG = {
  pollInterval: 2000,
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
      
      // For scene 2+, need to click + to enter Extend mode
      if (i > 0) {
        log('Scene > 1: Entering Extend mode');
        
        // Click + button next to clip (opens "What should happen next?")
        const extendClicked = await clickExtendButton();
        if (!extendClicked.success) {
          log('ERROR: Could not click extend button');
          continue;
        }
        await delay(CONFIG.mediumDelay);
        
        // Wait for "Extend" tag to appear
        const extendReady = await waitForExtendMode();
        if (!extendReady.success) {
          log('ERROR: Extend mode not activated');
          continue;
        }
      }
      
      // Fill prompt
      log('Filling prompt...');
      const promptResult = await fillPrompt(prompts[i]);
      if (!promptResult.success) {
        log('ERROR: Could not fill prompt');
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
      const waitResult = await waitForGeneration(i + 1);
      
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
  log('=== Clearing Timeline ===');
  
  // Step 1: Find and click Arrange button (icon with 3 squares)
  const buttons = document.querySelectorAll('button');
  let arrangeBtn = null;
  
  log(`Scanning ${buttons.length} buttons for Arrange...`);
  
  for (const btn of buttons) {
    const html = btn.innerHTML || '';
    const r = btn.getBoundingClientRect();
    
    // Log buttons in timeline area for debugging
    if (r.top > 500 && r.left > 700) {
      log(`Button: (${r.left.toFixed(0)}, ${r.top.toFixed(0)}) ${r.width.toFixed(0)}x${r.height.toFixed(0)} dl:${html.includes('download')}`);
    }
    
    // Arrange button is near download button
    // Relaxed conditions: bottom area, reasonable size, not download
    if (r.top > 500 && r.width > 30 && r.width < 80 && r.height > 30) {
      if (!html.includes('download') && !html.includes('save_alt') && !html.includes('file_download')) {
        if (r.left > 700) {
          arrangeBtn = btn;
          log(`>>> Found Arrange button at: ${r.left.toFixed(0)}, ${r.top.toFixed(0)}`);
          break;
        }
      }
    }
  }
  
  if (!arrangeBtn) {
    log('Arrange button not found - timeline may be empty');
    return { success: true };
  }
  
  // Click Arrange button
  arrangeBtn.click();
  await delay(500);
  
  // Step 2: Loop and click all remove buttons
  let removedCount = 0;
  let maxIterations = 20; // Safety limit
  
  while (maxIterations > 0) {
    // Find remove buttons
    let removeBtn = null;
    document.querySelectorAll('button').forEach(btn => {
      const text = (btn.innerText || '').toLowerCase();
      if (text.includes('remove')) {
        removeBtn = btn;
      }
    });
    
    if (removeBtn) {
      log(`Removing clip ${removedCount + 1}...`);
      removeBtn.click();
      await delay(300);
      removedCount++;
    } else {
      break;
    }
    
    maxIterations--;
  }
  
  log(`Removed ${removedCount} clips`);
  
  // Step 3: Click Done button (if exists)
  document.querySelectorAll('button').forEach(btn => {
    const text = (btn.innerText || '').trim();
    if (text === 'Done') {
      log('Clicking Done button');
      btn.click();
    }
  });
  
  await delay(500);
  log('=== Timeline Cleared ===');
  
  return { success: true, removedCount };
}

// ==================== STEP 2: Switch Mode ====================
async function switchMode(targetMode) {
  log('Looking for mode dropdown...');
  
  const modeButton = findModeDropdown();
  if (!modeButton) {
    log('Mode dropdown not found');
    return { success: false };
  }
  
  // Check if already on correct mode
  const currentMode = (modeButton.innerText || '').trim();
  if (currentMode.includes(targetMode)) {
    log('Already on correct mode:', targetMode);
    return { success: true };
  }
  
  log('Current mode:', currentMode);
  log('Switching to:', targetMode);
  modeButton.click();
  await delay(CONFIG.shortDelay);
  
  // Find and click target option
  const options = document.querySelectorAll('div[role="option"], div, span');
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
  // Method 1: Use known class from memory
  const modeBtn = document.querySelector('[class*="sc-fbe1c021-6"]');
  if (modeBtn) {
    const text = (modeBtn.innerText || '').trim();
    if (text.includes('Video') || text.includes('Image')) {
      return modeBtn;
    }
  }
  
  // Method 2: Fallback - find by position and text
  const elements = document.querySelectorAll('div, button');
  
  for (const el of elements) {
    const text = (el.innerText || '').trim();
    const rect = el.getBoundingClientRect();
    
    // Bottom of screen, reasonable width
    if (rect.top > 600 && rect.width > 80 && rect.width < 300) {
      if (text === 'Text to Video' || text === 'Frames to Video' || 
          text === 'Ingredients to Video' || text === 'Create Image') {
        return el;
      }
    }
  }
  
  return null;
}

// ==================== STEP 3: Set Settings ====================
async function setSettings(aspectRatio, outputs) {
  log(`Setting settings: aspect=${aspectRatio}, outputs=${outputs}`);
  
  // Step 1: Find and click the Settings button (tune icon)
  const buttons = document.querySelectorAll('button');
  let settingsBtn = null;
  
  for (const btn of buttons) {
    const text = (btn.innerText || '').toLowerCase();
    const html = btn.innerHTML || '';
    const rect = btn.getBoundingClientRect();
    
    if ((text.includes('tune') || text.includes('settings') || html.includes('tune')) && rect.width > 30 && rect.top > 600) {
      settingsBtn = btn;
      log(`Found settings button at: ${rect.left.toFixed(0)}, ${rect.top.toFixed(0)}`);
      break;
    }
  }
  
  if (!settingsBtn) {
    log('Settings button not found');
    return { success: false };
  }
  
  // Click settings to open popup
  settingsBtn.click();
  await delay(800);
  
  // Set aspect ratio
  if (aspectRatio) {
    let aspectDropdown = null;
    document.querySelectorAll('[class*="sc-4b3fbad9"]').forEach(el => {
      const text = (el.innerText || '').toLowerCase();
      const rect = el.getBoundingClientRect();
      if (text.includes('aspect ratio') && rect.width > 100 && rect.width < 250) {
        aspectDropdown = el;
      }
    });
    
    // Fallback
    if (!aspectDropdown) {
      document.querySelectorAll('button, div').forEach(el => {
        const text = (el.innerText || '').toLowerCase();
        const rect = el.getBoundingClientRect();
        if (text.includes('aspect ratio') && rect.width > 150 && rect.width < 250) {
          aspectDropdown = el;
        }
      });
    }
    
    if (aspectDropdown) {
      log('Found aspect ratio dropdown, clicking...');
      aspectDropdown.click();
      await delay(800);
      
      const targetText = aspectRatio === '9:16' ? 'portrait' : 'landscape';
      log(`Looking for option containing: ${targetText}`);
      
      let found = false;
      const allElements = document.querySelectorAll('div, span, button');
      
      for (const el of allElements) {
        const text = (el.innerText || '').toLowerCase();
        const rect = el.getBoundingClientRect();
        
        if (text.includes(targetText) && !text.includes('aspect ratio') && rect.width > 100 && rect.height > 30 && rect.height < 60 && !found) {
          log(`Clicking option: ${text.slice(0, 30)}`);
          el.click();
          found = true;
          break;
        }
      }
      
      await delay(300);
      if (found) log(`✅ Aspect ratio set to: ${aspectRatio}`);
      else log(`❌ Option ${targetText} not found!`);
    } else {
      log('❌ Aspect ratio dropdown not found!');
    }
  }
  
  // Set outputs
  if (outputs) {
    log(`Setting outputs to: ${outputs}`);
    
    let outputsDropdown = null;
    document.querySelectorAll('[class*="sc-4b3fbad9"]').forEach(el => {
      const text = (el.innerText || '').toLowerCase();
      const rect = el.getBoundingClientRect();
      if (text.includes('outputs per prompt') && rect.width > 100 && rect.width < 150) {
        outputsDropdown = el;
      }
    });
    
    // Fallback
    if (!outputsDropdown) {
      document.querySelectorAll('button, div').forEach(el => {
        const text = (el.innerText || '').toLowerCase();
        const rect = el.getBoundingClientRect();
        if (text.includes('outputs per prompt') && rect.width > 100 && rect.width < 150) {
          outputsDropdown = el;
        }
      });
    }
    
    if (outputsDropdown) {
      log('Found outputs dropdown, clicking...');
      outputsDropdown.click();
      await delay(800);
      
      let found = false;
      const allElements = document.querySelectorAll('div, span, button');
      
      for (const el of allElements) {
        const text = (el.innerText || '').trim();
        const rect = el.getBoundingClientRect();
        
        if (text === String(outputs) && rect.width > 30 && rect.height > 30 && rect.height < 60 && !found) {
          log(`Clicking output option: ${text}`);
          el.click();
          found = true;
          break;
        }
      }
      await delay(300);
      if (found) log(`✅ Outputs set to: ${outputs}`);
      else log(`❌ Output option ${outputs} not found!`);
    } else {
      log('❌ Outputs dropdown not found!');
    }
  }
  
  // Close settings popup
  document.body.click();
  await delay(300);
  
  return { success: true };
}

// ==================== STEP 4: Upload Image ====================
async function uploadImage(image, aspectRatio) {
  log('Looking for + button to add image...');
  
  const addBtn = findAddButton();
  if (!addBtn) {
    log('Add button not found');
    return { success: false };
  }
  
  addBtn.click();
  await delay(2000);
  
  const fileInput = document.querySelector('input[type="file"]');
  if (!fileInput) {
    log('File input not found');
    return { success: false };
  }
  
  const response = await fetch(image.base64);
  const blob = await response.blob();
  const file = new File([blob], image.name, { type: image.type });
  
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  fileInput.files = dataTransfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  
  log('File uploaded, waiting for crop dialog...');
  await delay(8000);
  
  await handleCropDialog(aspectRatio);
  await delay(CONFIG.longDelay);
  
  return { success: true };
}

function findAddButton() {
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    const text = (btn.innerText || '').trim().toLowerCase();
    const rect = btn.getBoundingClientRect();
    
    if ((text === 'add' || text === '+') && rect.top > 500) {
      return btn;
    }
  }
  return null;
}

async function handleCropDialog(aspectRatio) {
  log('Looking for Crop and Save button...');
  
  await delay(CONFIG.mediumDelay);
  
  // Find and click "Crop and Save" button
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    const text = (btn.innerText || '').trim();
    if (text === 'Crop and Save') {
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
  log('Waiting for generate button...');
  
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
// Detection: 
// 1. Duration changes from 0:00 / 0:00 to 0:00 / X:XX
// 2. No "%" text on thumbnail
// 3. + button appears next to clip
async function waitForGeneration(sceneNum) {
  log('Waiting for generation to complete...');
  log('Detection: Duration > 0:00 OR no % on thumbnail');
  
  const startTime = Date.now();
  const initialDuration = getTimelineDuration();
  log('Initial duration:', initialDuration);
  
  while (Date.now() - startTime < CONFIG.genTimeout) {
    await delay(CONFIG.pollInterval);
    
    // Check 1: Is there a percentage showing? (still generating)
    const percent = getLoadingPercent();
    if (percent >= 0) {
      log('Progress:', percent + '%');
      continue; // Still generating
    }
    
    // Check 2: Duration changed (new clip added)
    const currentDuration = getTimelineDuration();
    if (currentDuration > initialDuration) {
      log('Duration increased:', initialDuration, '->', currentDuration);
      await delay(CONFIG.mediumDelay);
      return { success: true };
    }
    
    // Check 3: + button appeared (for first scene)
    if (sceneNum === 1) {
      const plusBtn = findPlusButtonInTimeline();
      if (plusBtn) {
        log('+ button appeared - generation complete');
        await delay(CONFIG.mediumDelay);
        return { success: true };
      }
    }
    
    // If no %, check if clip thumbnail exists without %
    const hasClipWithoutPercent = checkClipWithoutPercent();
    if (hasClipWithoutPercent) {
      log('Clip exists without % - generation complete');
      await delay(CONFIG.mediumDelay);
      return { success: true };
    }
  }
  
  log('Generation timeout');
  return { success: false, error: 'Timeout' };
}

function getLoadingPercent() {
  // Look for "X%" text in timeline area
  const timelineArea = document.querySelector('body');
  const text = timelineArea.innerText;
  
  // Match percentage pattern (but not in time display like 0:00)
  const matches = text.match(/(\d{1,3})%/g);
  if (matches) {
    for (const match of matches) {
      const num = parseInt(match);
      if (num >= 0 && num <= 100) {
        return num;
      }
    }
  }
  return -1;
}

function getTimelineDuration() {
  // Find "0:00 / X:XX" pattern
  const text = document.body.innerText;
  const match = text.match(/(\d+):(\d+)\s*\/\s*(\d+):(\d+)/);
  if (match) {
    const minutes = parseInt(match[3]);
    const seconds = parseInt(match[4]);
    return minutes * 60 + seconds;
  }
  return 0;
}

function findPlusButtonInTimeline() {
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    const text = (btn.innerText || '').trim();
    const rect = btn.getBoundingClientRect();
    
    // + button in timeline area
    if (text === '+' && rect.top > 450 && rect.top < 650) {
      return btn;
    }
  }
  return null;
}

function checkClipWithoutPercent() {
  // Check if there's a clip thumbnail that doesn't have % overlay
  const timelineElements = document.querySelectorAll('div');
  for (const el of timelineElements) {
    const rect = el.getBoundingClientRect();
    // Timeline thumbnail area
    if (rect.top > 450 && rect.top < 650 && rect.width > 50 && rect.height > 30) {
      const text = (el.innerText || '').trim();
      // Has video frames but no percentage
      if (!text.includes('%') && el.querySelector('img, video, canvas')) {
        return true;
      }
    }
  }
  return false;
}

// ==================== Click Last Clip ====================
async function clickLastClipInTimeline() {
  log('Clicking last clip in timeline...');
  
  // Find clip thumbnails in timeline
  const clips = findClipsInTimeline();
  if (clips.length === 0) {
    log('No clips found in timeline');
    return { success: false };
  }
  
  // Click the last one (rightmost)
  const lastClip = clips[clips.length - 1];
  log('Clicking clip at position:', clips.length);
  lastClip.click();
  
  return { success: true };
}

function findClipsInTimeline() {
  const clips = [];
  
  // Method 1: Use known class from memory
  const timeline = document.querySelector('[class*="sc-5367019-1"]');
  if (timeline) {
    const thumbnails = timeline.querySelectorAll('[class*="sc-962285be"]');
    thumbnails.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 30) {
        clips.push({ element: el, left: rect.left });
      }
    });
  }
  
  // Method 2: Fallback - find by position
  if (clips.length === 0) {
    const elements = document.querySelectorAll('div');
    for (const el of elements) {
      const rect = el.getBoundingClientRect();
      if (rect.top > 480 && rect.top < 620 && rect.width > 60 && rect.height > 40) {
        if (el.querySelector('img, video, canvas') || el.style.backgroundImage) {
          clips.push({ element: el, left: rect.left });
        }
      }
    }
  }
  
  // Sort by left position
  clips.sort((a, b) => a.left - b.left);
  return clips.map(c => c.element);
}

// ==================== Press End Key ====================
async function pressEndKey() {
  log('Pressing End key to move playhead...');
  
  // Dispatch End key event
  const event = new KeyboardEvent('keydown', {
    key: 'End',
    code: 'End',
    keyCode: 35,
    which: 35,
    bubbles: true
  });
  document.dispatchEvent(event);
  
  return { success: true };
}

// ==================== Click Extend Button ====================
async function clickExtendButton() {
  log('Looking for + button next to clip...');
  
  // Find + button - it's next to the clip in timeline area
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    const text = (btn.innerText || '').trim();
    const rect = btn.getBoundingClientRect();
    
    // + button in timeline area (between clip and duration display)
    if (text === '+' && rect.top > 450 && rect.top < 650 && rect.left > 500) {
      log('Found + button, clicking...');
      btn.click();
      return { success: true };
    }
  }
  
  log('+ button not found');
  return { success: false };
}

// ==================== Wait for Extend Mode ====================
async function waitForExtendMode() {
  log('Waiting for Extend mode to activate...');
  
  for (let i = 0; i < 20; i++) {
    // Look for "Extend" tag in prompt area
    const elements = document.querySelectorAll('div, span, button');
    for (const el of elements) {
      const text = (el.innerText || '').trim();
      const rect = el.getBoundingClientRect();
      
      // Extend tag is in bottom area (prompt section)
      if (text === 'Extend' && rect.top > 600) {
        log('Extend mode activated!');
        return { success: true };
      }
    }
    
    // Also check for "What happens next?" placeholder
    const textareas = document.querySelectorAll('textarea');
    for (const ta of textareas) {
      const placeholder = ta.placeholder || '';
      if (placeholder.includes('What happens next')) {
        log('Extend mode ready (detected placeholder)');
        return { success: true };
      }
    }
    
    await delay(CONFIG.shortDelay);
  }
  
  log('Extend mode not detected');
  return { success: false };
}

// ==================== Count Clips in Timeline ====================
function countClipsInTimeline() {
  return findClipsInTimeline().length;
}

// ==================== STEP 8: Download ====================
async function downloadVideo() {
  log('Starting download process...');
  
  // Find download button (icon with download arrow) - bottom right
  const downloadBtn = findDownloadButton();
  if (!downloadBtn) {
    log('Download button not found');
    return { success: false };
  }
  
  log('Clicking download button...');
  downloadBtn.click();
  await delay(CONFIG.mediumDelay);
  
  // Wait for render and Download popup (top right)
  log('Waiting for render to complete...');
  
  for (let i = 0; i < 120; i++) {
    // Look for "Download" link in popup
    const downloadLink = findDownloadLink();
    if (downloadLink) {
      log('Found Download link, clicking...');
      downloadLink.click();
      await delay(CONFIG.mediumDelay);
      
      await clickDismiss();
      return { success: true };
    }
    
    await delay(CONFIG.pollInterval);
    if (i % 10 === 0) log('Still waiting for render...', i * 2 + 's');
  }
  
  log('Render timeout');
  return { success: false };
}

function findDownloadButton() {
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    const html = btn.innerHTML || '';
    const rect = btn.getBoundingClientRect();
    
    // Bottom right area
    if (rect.top > 450 && rect.left > 800) {
      if (html.includes('download') || html.includes('file_download') || html.includes('save_alt')) {
        return btn;
      }
    }
  }
  return null;
}

function findDownloadLink() {
  const elements = document.querySelectorAll('a, button');
  for (const el of elements) {
    const text = (el.innerText || '').trim();
    const rect = el.getBoundingClientRect();
    
    // Top right popup area
    if (text === 'Download' && rect.top < 200) {
      return el;
    }
  }
  return null;
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
