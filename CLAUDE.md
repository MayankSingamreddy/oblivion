# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Element Remover Pro** is a unified Chrome browser extension that combines natural language element removal with manual element selection. It merges the best features from two separate extensions:

1. **Agentic-Browser-Extension**: AI-powered natural language element detection
2. **Manual-Element-Remover**: Click-to-select element removal

## Architecture

The extension follows a clean, minimal architecture with Manifest V3:

### Core Files

- **manifest.json**: Extension configuration with minimal required permissions
- **popup.html/popup.js/popup.css**: Unified interface with mode switching (AI vs Manual)
- **content.js**: Main content script coordinating both AI and manual modes
- **ai-service.js**: OpenAI integration for intelligent element detection
- **options.html/options.js/options.css**: Settings page for OpenAI API key configuration
- **styles.css**: Element highlighting styles for manual selection mode

### Key Features

1. **Dual Mode Operation**:
   - **AI Mode**: Natural language queries like "hide ads and sidebars" powered by OpenAI
   - **Manual Mode**: Click-to-select element removal with visual feedback

2. **Smart Element Detection**:
   - **AI-Powered**: OpenAI GPT-4o-mini analyzes page structure for intelligent element targeting
   - **Pattern-Based Fallback**: Robust pattern matching for common web elements when AI unavailable
   - **Configurable Settings**: Users can set their OpenAI API key and preferences
   - Visual element selection with hover highlighting
   - Safety checks to prevent overly broad selections

3. **Non-Destructive Approach**:
   - Elements are hidden (display: none) rather than removed from DOM
   - Complete undo/reset functionality with toggle capability
   - Comprehensive history tracking for all operations
   - Toggle reset: first click restores original page, second click re-applies changes

4. **Clean UI**:
   - Mode toggle between AI and Manual modes
   - Settings button for OpenAI API key configuration
   - Preview system for AI mode showing what will be affected
   - Status messages with appropriate styling and error handling

## Code Architecture

### Content Script (`content.js`)
- Single class `ElementRemover` coordinating all functionality
- Async AI-first approach with pattern-based fallback
- **Persistent manual selection mode** - stays active after removing elements
- **Interactive preview overlays** - click to toggle element selection
- **Toggle reset system** - alternates between original and modified states
- Comprehensive history system with state preservation
- Safety validations to prevent removing too many elements

### AI Service (`ai-service.js`)
- OpenAI API integration with GPT-4o-mini
- Intelligent page analysis and CSS selector generation
- Rate limiting (20-second cooldown between requests)
- Robust error handling and response parsing
- Element validation and visibility checks

### Popup Controller (`popup.js`)
- Single class `ElementRemoverPopup` managing the UI
- **Persistent state management** - remembers preview and manual mode states
- **Dynamic UI updates** - shows selection counts, reset state, manual mode indicator  
- Mode switching between AI and manual modes with state preservation
- Settings page integration with OpenAI configuration
- Real-time message passing with content script
- Comprehensive error handling and user feedback
- Content script injection fallback for reliability

### Options Page (`options.js`)
- API key configuration and validation
- Model selection (GPT-4o-mini, GPT-3.5-turbo, GPT-4)
- AI enablement toggles and safety settings
- API key testing functionality

### Key Patterns

#### AI-First Architecture
```javascript
// Try AI detection first
if (window.aiService) {
  try {
    targets = await window.aiService.generateSelectors(prompt);
  } catch (error) {
    // Fall back to pattern matching
    if (settings.enableFallback) {
      targets = this.parseNaturalLanguage(prompt);
    }
  }
}
```

#### OpenAI Integration
```javascript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: systemPrompt }]
  })
});
```

#### Pattern-Based Fallback
```javascript
const patterns = {
  'ads|advertisement|sponsored': {
    selectors: ['[id*="ad" i]', '[class*="ad" i]', ...],
    description: 'Advertisements and sponsored content'
  }
};
```

#### Interactive Preview System
```javascript
// Clickable overlays with visual state feedback
createPreviewOverlay(element, color, description) {
  overlay.addEventListener('click', (e) => {
    this.toggleElementSelection(element);
  });
  // Visual states: selected (full color) vs unselected (dimmed, grayscale)
}
```

#### Persistent Manual Mode
```javascript
handleClick(event) {
  // Remove element but stay in manual selection mode
  elementToRemove.style.display = 'none';
  this.history.push(historyItem);
  // Don't disable manual selection - keep it active
}
```

#### Toggle Reset System
```javascript
handleReset() {
  if (!this.isPageReset) {
    // First reset: restore all elements, save history
    this.savedHistory = [...this.history];
    this.isPageReset = true;
  } else {
    // Second reset: re-apply all changes
    this.history = [...this.savedHistory];
    this.isPageReset = false;
  }
}
```

#### Element Safety Checks
- Visibility validation (width > 0, height > 0, not display:none)
- Count limits (max 100 elements to prevent accidents)
- Preview overlay detection to prevent removal of UI elements

## Development Commands

This is a vanilla JavaScript extension with no build process:

### Setting Up the Extension

1. **Load Extension:**
   - Open Chrome → `chrome://extensions/`
   - Enable "Developer mode" 
   - Click "Load unpacked" → Select this directory

2. **Configure OpenAI (Optional):**
   - Click extension icon → Settings button (⚙️)
   - Enter OpenAI API key from [platform.openai.com](https://platform.openai.com/account/api-keys)
   - Test API key to verify connection
   - Choose AI model (GPT-4o-mini recommended)

3. **Test Functionality:**
   - Navigate to any webpage
   - Click extension icon
   - **AI Mode**: Enter "hide ads" → Preview → Click overlays to toggle → Apply
   - **Manual Mode**: Click "Start Selection" → hover → click elements (stays active)
   - **Reset Toggle**: "Reset Page" ↔ "Restore Changes" 
   - Use Ctrl+Shift+E (Cmd+Shift+E on Mac) as keyboard shortcut
   - Press ESC to exit manual selection mode

### Key Testing Scenarios

1. **AI Mode Testing** (requires API key):
   - "hide ads and banners" - should intelligently find advertising content
   - "remove social media widgets" - should target sharing buttons and social feeds
   - "hide popup overlays" - should find modal dialogs and overlays
   - Test preview mode before applying
   - Verify fallback to pattern matching if AI fails

2. **Manual Mode Testing**:
   - Toggle selection mode (green indicator appears with ESC instruction)
   - Hover over elements (should highlight)
   - Click to remove (should hide element but stay in manual mode)
   - Remove multiple elements consecutively
   - Close popup and reopen (manual mode should persist)  
   - ESC key should exit mode (indicator disappears)

3. **Settings Testing**:
   - Test API key validation in options page
   - Verify AI enablement toggles work correctly
   - Test pattern-based fallback when AI disabled
   - Verify rate limiting (20-second cooldown) works

4. **Preview Interaction Testing**:
   - Enter query → Preview elements highlighted
   - Click highlighted elements to toggle selection (visual feedback)
   - Close popup and reopen (preview state should persist)
   - Apply changes (only selected elements removed)

5. **Reset Toggle Testing**:
   - Remove elements → Click "Reset Page" (restores original, button becomes "Restore Changes")
   - Click "Restore Changes" (re-applies removals, button becomes "Reset Page")
   - Remove new elements → Button stays "Reset Page"

6. **Common Controls**:
   - Undo should restore last change  
   - Reset toggle should work as described above
   - Mode switching should preserve appropriate states

## Improvements Made

### From Original Extensions

1. **Enhanced Architecture**:
   - **Added proper OpenAI integration** with user-configurable API keys
   - **Intelligent AI-first approach** with robust pattern-based fallback  
   - **Streamlined to 2 content scripts** instead of 5+ files from original
   - **Comprehensive settings page** for user customization

2. **Superior Natural Language Processing**:
   - **Real AI understanding** using OpenAI GPT-4o-mini for contextual element detection
   - **Smart fallback system** with improved pattern matching for common elements
   - **Rate limiting and error handling** for stable AI integration
   - **Better safety validations** with element count limits

3. **Revolutionary Manual Mode**:
   - **Persistent selection mode** - stays active after removing elements
   - **Visual state indicator** - green banner with ESC key instruction
   - **Comprehensive state management** - survives popup closing/reopening
   - Added undo functionality (missing from original)
   - Better visual feedback with modern styling

4. **Advanced Interactive Features**:
   - **Clickable preview overlays** - toggle individual element selection
   - **Real-time selection feedback** - visual states (selected vs unselected)
   - **Persistent preview state** - survives popup interactions
   - **Smart selection counts** - "5 of 12 elements selected" display

5. **Intelligent Reset System**:
   - **Toggle functionality** - alternates between original and modified states
   - **Dynamic button text** - "Reset Page" ↔ "Restore Changes"  
   - **State preservation** - remembers what to restore across sessions
   - **Context awareness** - updates based on user actions

6. **Improved UI/UX**:
   - Clean, modern interface design with persistent state indicators
   - Clear mode switching with state preservation
   - Comprehensive error handling and user feedback
   - Real-time status updates and visual feedback

7. **Code Quality**:
   - Single responsibility classes with comprehensive state management
   - Consistent error handling with graceful degradation
   - Proper event listener cleanup and memory management
   - Modern JavaScript patterns with async/await
   - Persistent state architecture across all components

## Browser Compatibility

- Chrome 88+ (Manifest V3 support)
- Edge 88+ (Chromium-based)
- Other Chromium-based browsers with Manifest V3 support

## Permissions

Minimal required permissions:
- `activeTab`: Access to currently active tab only
- `scripting`: Ability to inject content script if needed
- `storage`: For future rule persistence (currently unused)
- `<all_urls>`: Content script injection on web pages

## Extension Loading

After making changes:
1. Go to `chrome://extensions/`
2. Find "Element Remover Pro"
3. Click the refresh/reload button
4. Test on a webpage

No build process required - files load directly.