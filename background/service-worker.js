// TB Storyboard - Service Worker v1.1.0
console.log('[TBS] Service Worker loaded');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[TBS] Message received:', message.action);
  
  switch (message.action) {
    case 'TEST_API':
      testApi().then(sendResponse);
      return true;
      
    case 'GENERATE_STORYBOARD':
      generateStoryboard(message.data).then(sendResponse);
      return true;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

async function testApi() {
  try {
    const { geminiApiKey } = await chrome.storage.local.get(['geminiApiKey']);
    
    if (!geminiApiKey) {
      return { success: false, error: 'กรุณาใส่ API Key ก่อน' };
    }
    
    const url = `${GEMINI_API_BASE}/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Say hello in Thai' }] }]
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error?.message || `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    return { success: true, message: `API OK! ${text}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function generateStoryboard(data) {
  try {
    const { geminiApiKey } = await chrome.storage.local.get(['geminiApiKey']);
    
    if (!geminiApiKey) {
      return { success: false, error: 'กรุณาใส่ API Key ก่อน' };
    }
    
    const { story, sceneCount, style } = data;
    const url = `${GEMINI_API_BASE}/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    
    const prompt = `You are a professional video storyboard creator for AI video generation.

Story/Concept: "${story}"
Style: ${style}
Number of scenes: ${sceneCount}

Create exactly ${sceneCount} scene descriptions. Each scene should be:
- 15-30 words describing what is VISIBLE
- Focus on: subjects, actions, environment, lighting, camera angles
- Maintain character/style consistency across scenes
- Suitable for AI video generation (Veo/Runway style)

Output format: Return ONLY the scene descriptions, one per line, numbered.
Example:
1. A young woman walks through a misty forest, sunlight filtering through ancient trees, cinematic wide shot
2. Close-up of her face showing wonder as she discovers a glowing crystal, soft ethereal lighting

Now create ${sceneCount} scenes:`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error?.message || `HTTP ${response.status}` };
    }
    
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Parse numbered lines
    const lines = text.split('\n')
      .map(line => line.trim())
      .filter(line => /^\d+\./.test(line))
      .map(line => line.replace(/^\d+\.\s*/, ''));
    
    if (lines.length === 0) {
      return { success: false, error: 'ไม่สามารถ parse prompts ได้' };
    }
    
    return { success: true, prompts: lines };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
