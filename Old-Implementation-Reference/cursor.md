# Oblivion - Element Remover Pro

## Project Overview

**Element Remover Pro** is a sophisticated Chrome browser extension that allows users to intelligently remove unwanted elements from web pages. The extension combines AI-powered natural language processing with manual element selection to provide a seamless content curation experience.

### Core Philosophy
- **Non-destructive**: Elements are hidden (not deleted) and can be restored
- **Persistent memory**: Changes are remembered per-site and automatically reapplied
- **Multi-modal approach**: AI, manual selection, and preset rules work together
- **Zero-flicker**: Rules apply early and continuously for smooth browsing

## Architecture Overview

The extension follows a clean Manifest V3 architecture with these core components:

```
oblivion/
├── manifest.json              # Extension configuration
├── background.js              # Service worker for Chrome extension
├── content.js                 # Main content script (orchestrator)
├── popup/                     # Extension popup interface
├── options/                   # Settings/configuration page  
├── configs/                   # Configuration management interface
├── ai/                        # OpenAI integration service
├── assets/                    # Styles and static resources
└── content/                   # Modular content script components
```

## Key Components

### 1. Manifest Configuration (`manifest.json`)
- **Permissions**: `activeTab`, `scripting`, `storage`, `<all_urls>`
- **Content Scripts**: Injected on all URLs with CSS and JS
- **Commands**: Keyboard shortcuts (Ctrl+Shift+E, Ctrl+Shift+H)
- **Web Accessible Resources**: AI service for secure injection

### 2. Background Service Worker (`background.js`)
- **Installation handling**: Sets up default settings on first install
- **Command processing**: Handles keyboard shortcuts
- **Content script injection**: Ensures scripts are loaded when needed
- **Storage management**: Handles settings persistence and cleanup
- **Migration support**: Handles version upgrades

### 3. Content Script System (`content.js`)
- **Single orchestrator**: `ElementRemover` class coordinates all functionality
- **Memory system**: Persistent storage of hidden elements per site
- **Selection modes**: Manual clicking with visual feedback
- **Rule application**: CSS selector-based element hiding
- **Toast notifications**: User feedback for actions

### 4. Popup Interface (`popup/`)
**HTML Structure** (`popup.html`):
- Header with site info, status indicator, and **"My Configs" button**
- Three primary action buttons: Clean, Tweak, Ask AI
- AI input panel for natural language queries
- **Memory controls**: "Save Current Config" button with status indicator
- Footer controls for undo/reset operations
- Status messages and mode indicators

**JavaScript Controller** (`popup.js`):
- `ElementRemoverPopup` class manages all UI interactions
- Intuitive config saving with clear visual feedback
- Automatic detection of saved site configurations  
- Message passing with content scripts
- Real-time status updates
- Settings integration

### 5. AI Service (`ai/ai-service.js`)
- **OpenAI Integration**: Uses GPT-4o-mini for intelligent element detection
- **Rate limiting**: 20-second cooldown between requests
- **Fallback patterns**: Robust pattern matching when AI unavailable
- **Selector validation**: Ensures generated selectors are safe and effective
- **Privacy-focused**: Sends page structure, not content

### 6. Options Page (`options/`)
- API key configuration and validation
- Model selection (GPT-4o-mini, GPT-3.5-turbo, GPT-4)
- Enable/disable toggles for AI and fallback systems
- Element limits and safety settings

### 7. Configurations Manager (`configs/`)
- **My Configurations**: Comprehensive view of all saved site configurations
- **Statistics Dashboard**: Overview of total sites, rules, and usage patterns
- **Search & Filter**: Find configurations by site name or rule content
- **Configuration Details**: View individual rules and selectors per site
- **Import/Export**: Backup and share configuration sets
- **Management Tools**: Edit, delete, and organize saved configurations

## Core Functionality

### Four Operation Modes

#### 1. AI Mode ("Ask AI")
```javascript
// User enters natural language query like "hide ads and sidebars"
const response = await chrome.tabs.sendMessage(tabId, {
  action: 'askAI',
  prompt: 'hide trending and suggestions'
});
```

**Process Flow**:
1. User enters natural language description
2. AI service analyzes page structure
3. OpenAI generates CSS selectors with descriptions
4. Elements are hidden and rules are persisted
5. Falls back to pattern matching if AI unavailable

#### 2. Manual Mode ("Tweak")
```javascript
// Enters selection mode with visual feedback
toggleSelectionMode() {
  this.isSelectionMode = !this.isSelectionMode;
  if (this.isSelectionMode) {
    document.body.style.cursor = 'crosshair';
    // Add event listeners for hover/click
  }
}
```

**Process Flow**:
1. Click "Tweak" to enter selection mode
2. Hover over elements to see highlighting
3. Click elements to hide them
4. ESC key exits selection mode
5. Rules are automatically saved

#### 3. Preset Mode ("Clean")
```javascript
// Applies pre-configured site-specific rules
async applyCleanPreset() {
  const preset = this.sitePresets[this.host];
  for (const rule of preset.rules) {
    this.applyRule(rule);
  }
}
```

**Process Flow**:
1. Extension detects current site
2. Applies pre-configured rules for common elements
3. Rules are customized per-site (Twitter, YouTube, Reddit, etc.)

#### 4. Memory Persistence ("Save Current Config")
```javascript
// Saves current state for automatic restoration
async saveCurrentConfig() {
  const rulesToSave = Array.from(this.appliedRules.values());
  await chrome.storage.sync.set({
    [`rules:${this.host}`]: rulesToSave
  });
}
```

**Process Flow**:
1. Hide elements using any combination of methods (AI, Manual, Clean)
2. Click "Save Current Config" to persist the current state
3. Site configuration automatically applies on future visits
4. Visual indicator shows when site has saved configuration

### Memory System

The memory system provides **intuitive, automatic rule persistence** with a simple "save current config" approach.

#### How It Works
1. **Hide elements** using any method (AI, Manual, or Clean presets)
2. **Click "Save Current Config"** to persist the current state
3. **Automatically restored** on future visits to the same site
4. **No toggles or confusion** - just save and it works

#### Rule Storage Format
```javascript
{
  type: 'hide',                    // Action type
  selector: '#sidebar',            // CSS selector
  description: 'Right sidebar',    // Human description
  createdAt: Date.now()           // Timestamp
}
```

#### Storage Strategy
- **Per-site rules**: `rules:${hostname}` in `chrome.storage.sync`
- **Automatic application**: Rules apply immediately on page load
- **Visual feedback**: Clear indication when site has saved configuration
- **Settings**: API keys, preferences in `chrome.storage.local`
- **Automatic cleanup**: Removes old rules when storage limit approached
- **Sync support**: Rules sync across Chrome instances

### Element Selection Strategy

#### Selector Generation
```javascript
generateSelector(element) {
  // Priority: ID > Classes > Tag + nth-child
  if (element.id) return `#${element.id}`;
  if (element.className) return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
  // Fallback to structural selector
  return `${parent.tagName.toLowerCase()} > ${element.tagName.toLowerCase()}:nth-child(${index + 1})`;
}
```

#### Safety Measures
- **Interactive element detection**: Warns when hiding buttons/links
- **Click event blocking**: Prevents accidental activations during selection
- **Visual feedback**: Different highlighting for interactive vs static elements
- **Element validation**: Checks visibility and relevance before hiding

## Technical Implementation Details

### Content Script Architecture

#### Event Management
```javascript
// Bound handlers prevent memory leaks
this.boundHandlers = {
  hover: this.handleHover.bind(this),
  click: this.handleClick.bind(this),
  keydown: this.handleKeydown.bind(this)
};
```

#### Rule Application
```javascript
applyRule(rule) {
  const elements = document.querySelectorAll(rule.selector);
  elements.forEach(element => {
    element.style.setProperty('display', 'none', 'important');
    element.setAttribute('data-erpro-hidden', 'true');
    this.hiddenElements.set(element, rule);
  });
}
```

### AI Integration

#### OpenAI Request Structure
```javascript
{
  model: 'gpt-4o-mini',
  messages: [{
    role: 'system',
    content: 'Expert web element selector...'
  }, {
    role: 'user', 
    content: 'User query + page context'
  }],
  max_tokens: 1000,
  temperature: 0.1
}
```

#### Response Parsing
- Extracts JSON from AI response
- Validates selector syntax
- Tests selectors against current page
- Filters out overly broad matches (>50 elements)

### Pattern Fallback System

```javascript
const patterns = {
  'ads|advertisement|sponsored': {
    selectors: ['*[id*="ad" i]', '*[class*="ad" i]'],
    description: 'Advertisements'
  },
  'sidebar|aside': {
    selectors: ['aside', '[role="complementary"]'],
    description: 'Sidebars'
  }
};
```

## User Interface Design

### Popup Design Principles
- **380px width**: Optimized for extension popup constraints
- **Three-column layout**: Clean/Tweak/Ask AI buttons
- **Memory controls**: Prominent "Save Current Config" with visual status feedback
- **Visual hierarchy**: Primary actions prominent, secondary controls subtle
- **Intuitive state indicators**: Clear distinction between saved vs unsaved configurations
- **Status feedback**: Real-time indicators and messages
- **Keyboard shortcuts**: Power user accessibility

### Styling System
- **CSS Custom Properties**: Consistent color scheme
- **Hover states**: Clear interaction feedback  
- **Animation**: Smooth transitions for state changes
- **Responsive**: Adapts to different popup sizes
- **Dark mode ready**: Color scheme supports theme switching

## Development Workflow

### Local Development
```bash
# 1. Load extension in Chrome
# Go to chrome://extensions/
# Enable Developer mode
# Click "Load unpacked" and select project directory

# 2. Configure API (optional)
# Click extension icon -> Settings
# Enter OpenAI API key from platform.openai.com
# Test connection

# 3. Test functionality
# Navigate to any webpage
# Try AI mode: "hide ads and sidebars"
# Try manual mode: click elements to hide
# Try clean mode: use preset rules
```

### Key Testing Scenarios

#### AI Mode Testing
- Test with and without API key
- Verify fallback to pattern matching
- Test rate limiting (20-second cooldown)
- Check error handling for invalid responses

#### Manual Mode Testing  
- Verify hover highlighting works
- Test click-to-hide functionality
- Check ESC key exits mode
- Ensure interactive elements show warnings

#### Persistence Testing
- Hide elements, refresh page, verify they stay hidden
- Test undo/reset functionality
- Check sync storage limits and cleanup

### File Organization

#### Core Files
- `content.js`: Main orchestrator, handles all content script functionality
- `popup.js`: UI controller, manages popup interactions
- `ai-service.js`: OpenAI integration, selector generation
- `background.js`: Service worker, handles Chrome extension lifecycle

#### Modular Structure
- Single-responsibility classes
- Clear separation of concerns
- Minimal interdependencies
- Comprehensive error handling

## Browser Compatibility

- **Chrome 88+**: Full Manifest V3 support
- **Edge 88+**: Chromium-based compatibility
- **Other Chromium browsers**: With Manifest V3 support

## Permissions Explanation

- `activeTab`: Access current tab for content injection
- `scripting`: Programmatic content script injection
- `storage`: Persist user preferences and rules
- `<all_urls>`: Allow content script on all websites

## Security Considerations

- **Content Security Policy**: Strict CSP prevents code injection
- **API Key Storage**: Stored locally, never transmitted except to OpenAI
- **Selector Validation**: All CSS selectors validated before application
- **Event Isolation**: Extension events don't interfere with page functionality

## Performance Optimizations

- **Lazy loading**: AI service loaded only when needed
- **Efficient selectors**: Optimized CSS selectors for fast matching
- **Memory management**: WeakMap for element tracking
- **Storage limits**: Automatic cleanup of old rules
- **Event delegation**: Minimal event listener overhead

## Future Enhancement Possibilities

- Site-specific presets expansion
- Advanced rule conditions (URL patterns, time-based)
- Import/export rule sets
- Visual rule editor
- Analytics dashboard for rule effectiveness
- Collaborative rule sharing (community presets)

This architecture provides a robust foundation for intelligent web content curation while maintaining simplicity and performance.
