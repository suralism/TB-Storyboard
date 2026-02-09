// TB Storyboard - Popup Script v1.0.0
console.log('[TBS] Popup loaded v1.0.0');

// ==================== DOM Elements ====================
const elements = {
  // Image upload
  img1Box: document.getElementById('img1Box'),
  img2Box: document.getElementById('img2Box'),
  img3Box: document.getElementById('img3Box'),
  img1Preview: document.getElementById('img1Preview'),
  img2Preview: document.getElementById('img2Preview'),
  img3Preview: document.getElementById('img3Preview'),
  img1Label: document.getElementById('img1Label'),
  img2Label: document.getElementById('img2Label'),
  img3Label: document.getElementById('img3Label'),
  imgInput: document.getElementById('imgInput'),
  
  // Story input
  storyInput: document.getElementById('storyInput'),
  
  // Settings
  sceneCount: document.getElementById('sceneCount'),
  aspectRatio: document.getElementById('aspectRatio'),
  videoStyle: document.getElementById('videoStyle'),
  outputs: document.getElementById('outputs'),
  
  // Buttons
  btnGenerate: document.getElementById('btnGenerate'),
  btnStartGen: document.getElementById('btnStartGen'),
  
  // Preview
  promptsPreview: document.getElementById('promptsPreview'),
  promptsList: document.getElementById('promptsList'),
  
  // Progress
  progressSection: document.getElementById('progressSection'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
  
  // Log
  logArea: document.getElementById('logArea'),
  
  // API
  apiKey: document.getElementById('apiKey'),
  btnSaveApi: document.getElementById('btnSaveApi'),
  btnTestApi: document.getElementById('btnTestApi')
};

// ==================== State ====================
let uploadedImages = {
  img1: null,  // { name, type, base64 }
  img2: null,
  img3: null
};
let currentUploadTarget = null;
let generatedPrompts = [];

// ==================== Utilities ====================
function log(message, isError = false) {
  const item = document.createElement('div');
  item.className = 'log-item' + (isError ? ' log-error' : '');
  item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  elements.logArea.appendChild(item);
  elements.logArea.scrollTop = elements.logArea.scrollHeight;
  console.log('[TBS]', message);
}

function logSuccess(message) {
  const item = document.createElement('div');
  item.className = 'log-item log-success';
  item.textContent = `[${new Date().toLocaleTimeString()}] ✅ ${message}`;
  elements.logArea.appendChild(item);
  elements.logArea.scrollTop = elements.logArea.scrollHeight;
}

function updateProgress(percent, text) {
  elements.progressFill.style.width = percent + '%';
  elements.progressText.textContent = text;
}

function countImages() {
  let count = 0;
  if (uploadedImages.img1) count++;
  if (uploadedImages.img2) count++;
  if (uploadedImages.img3) count++;
  return count;
}

function getSelectedMode() {
  const count = countImages();
  if (count === 0) return 'Text to Video';
  if (count === 1) return 'Frames to Video';
  return 'Ingredients to Video';
}

// ==================== Image Upload ====================
function initImageUpload() {
  ['img1', 'img2', 'img3'].forEach((id, index) => {
    const box = elements[`${id}Box`];
    box.addEventListener('click', () => {
      currentUploadTarget = id;
      elements.imgInput.click();
    });
  });
  
  elements.imgInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      uploadedImages[currentUploadTarget] = { 
        name: file.name, 
        type: file.type, 
        base64 
      };
      
      const num = currentUploadTarget.slice(-1);
      elements[`${currentUploadTarget}Preview`].src = base64;
      elements[`${currentUploadTarget}Preview`].style.display = 'block';
      elements[`${currentUploadTarget}Label`].style.display = 'none';
      
      log(`รูปที่ ${num}: ${file.name}`);
      log(`โหมดอัตโนมัติ: ${getSelectedMode()}`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
}

// ==================== API ====================
async function loadApiKey() {
  const { geminiApiKey } = await chrome.storage.local.get(['geminiApiKey']);
  if (geminiApiKey) {
    elements.apiKey.value = geminiApiKey;
  }
}

function initApi() {
  elements.btnSaveApi.addEventListener('click', async () => {
    const key = elements.apiKey.value.trim();
    if (!key) {
      log('กรุณาใส่ API Key', true);
      return;
    }
    await chrome.storage.local.set({ geminiApiKey: key });
    logSuccess('บันทึก API Key แล้ว');
  });
  
  elements.btnTestApi.addEventListener('click', async () => {
    log('กำลังทดสอบ API...');
    const response = await chrome.runtime.sendMessage({ action: 'TEST_API' });
    if (response.success) {
      logSuccess(response.message);
    } else {
      log(response.error, true);
    }
  });
}

// ==================== Generate Storyboard ====================
async function generateStoryboard() {
  const story = elements.storyInput.value.trim();
  const sceneCount = parseInt(elements.sceneCount.value);
  const style = elements.videoStyle.value;
  
  if (!story) {
    log('กรุณาใส่เรื่องราว', true);
    return;
  }
  
  elements.btnGenerate.disabled = true;
  elements.btnGenerate.textContent = '⏳ กำลังสร้าง...';
  log(`สร้าง Storyboard: ${sceneCount} scenes, สไตล์ ${style}`);
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'GENERATE_STORYBOARD',
      data: { story, sceneCount, style }
    });
    
    if (response.success && response.prompts) {
      generatedPrompts = response.prompts;
      displayPrompts(generatedPrompts);
      logSuccess(`สร้าง ${generatedPrompts.length} scene prompts`);
    } else {
      log(response.error || 'ไม่สามารถสร้าง Storyboard ได้', true);
    }
  } catch (err) {
    log(`Error: ${err.message}`, true);
  } finally {
    elements.btnGenerate.disabled = false;
    elements.btnGenerate.textContent = '✨ สร้าง Storyboard';
  }
}

function displayPrompts(prompts) {
  elements.promptsPreview.style.display = 'block';
  elements.promptsList.innerHTML = '';
  
  prompts.forEach((prompt, index) => {
    const div = document.createElement('div');
    div.className = 'prompt-item';
    div.innerHTML = `
      <div class="scene-num">Scene ${index + 1}</div>
      <div>${prompt}</div>
    `;
    elements.promptsList.appendChild(div);
  });
}

// ==================== Start Video Generation ====================
async function startVideoGeneration() {
  if (generatedPrompts.length === 0) {
    log('กรุณาสร้าง Storyboard ก่อน', true);
    return;
  }
  
  // Collect images
  const images = [];
  if (uploadedImages.img1) images.push(uploadedImages.img1);
  if (uploadedImages.img2) images.push(uploadedImages.img2);
  if (uploadedImages.img3) images.push(uploadedImages.img3);
  
  const mode = getSelectedMode();
  log(`เริ่มสร้างวิดีโอ: ${generatedPrompts.length} scenes`);
  log(`โหมด: ${mode} (${images.length} รูป)`);
  
  elements.btnStartGen.disabled = true;
  elements.progressSection.style.display = 'block';
  updateProgress(0, 'กำลังเริ่ม...');
  
  try {
    // Send to content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes('labs.google')) {
      log('กรุณาเปิดหน้า labs.google ก่อน', true);
      return;
    }
    
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'START_STORYBOARD',
      data: {
        prompts: generatedPrompts,
        images: images,
        aspectRatio: elements.aspectRatio.value,
        outputs: parseInt(elements.outputs.value),
        mode: mode
      }
    });
    
    if (response.success) {
      logSuccess('สร้างวิดีโอเสร็จสิ้น!');
      updateProgress(100, 'เสร็จสิ้น!');
    } else {
      log(response.error || 'เกิดข้อผิดพลาด', true);
    }
  } catch (err) {
    log(`Error: ${err.message}`, true);
  } finally {
    elements.btnStartGen.disabled = false;
  }
}

// ==================== Init ====================
function init() {
  initImageUpload();
  initApi();
  loadApiKey();
  
  elements.btnGenerate.addEventListener('click', generateStoryboard);
  elements.btnStartGen.addEventListener('click', startVideoGeneration);
  
  log('TB Storyboard พร้อมใช้งาน');
}

document.addEventListener('DOMContentLoaded', init);
