# Oblivion v2.0 🚫


#update: someone else is making this (amidotdev)
https://x.com/aidenybai/status/1972689770036773055

*project not finished, (instructions.md - instructions-completed.md + current bugs = finished product)

> Desription: Shape the web you use every day - intelligent element removal with memory and AI assistance

A powerful Chrome extension for hiding, modifying, or replacing website elements with AI assistance and persistent memory.

## ✨ Key Features

- 🎯 **Point & Hide**: Click any element to hide it instantly
- 🤖 **AI-Powered**: Natural language commands ("hide the sidebar", "remove ads")
- 💾 **Persistent Memory**: Rules automatically save and reapply
- 🎨 **Theme Customization**: Change fonts, colors, and layout
- 📦 **Site Presets**: Curated rule packs for popular websites
- ⚡ **Zero-Flicker**: Elements hide before they appear
- 🌐 **Local AI**: Run WebLLM models locally (no API key required)

## 🏗️ Architecture

Modular TypeScript architecture with:
- **SelectorEngine**: Stable CSS selector generation
- **RuleEngine**: Hide/blank/replace strategies with ShadowDOM
- **OverlayManager**: Safe element selection with transparent overlay
- **StorageManager**: Compressed per-host storage with sync
- **DOMObserver**: Zero-flicker CSS injection and auto-apply
- **ThemeCapsule**: Isolated theme system
- **NLAgent**: Local/remote AI with WebLLM support
- **PresetManager**: Built-in and custom rule packs

## 🚀 Installation

### For Users
1. Clone and build:
   ```bash
   git clone https://github.com/oblivion-extension/oblivion.git
   cd oblivion
   npm install && npm run build
   ```
2. Load in Chrome at `chrome://extensions/` (Enable Developer mode → Load unpacked)

### For Developers
```bash
npm install
npm run dev          # Development with watch mode
npm run build        # Production build
npm test            # Run tests
npm run lint        # Code linting
```

## 🎮 Usage

1. **Selection Mode**: Click extension icon → "Tweak" or `Ctrl+Shift+S`
2. **Hide Elements**: Hover and click any element
3. **AI Commands**: Use "Ask AI" with natural language
4. **Auto-Save**: Changes persist automatically per website

## ⚙️ Configuration

- **Local AI**: WebLLM models (recommended, no API key needed)
- **Remote AI**: OpenAI API key required
- **Storage**: Auto-sync across Chrome instances with compression
- **Safety**: Interactive element warnings and undo system

## 📊 Performance

- Zero-flicker element hiding
- Efficient stable selector generation
- Batch DOM operations
- Web Worker AI processing
- Automatic memory cleanup

## 🔒 Privacy

- Local-first AI processing
- No tracking or analytics
- Minimal required permissions
- ShadowDOM isolation
- Safe selector validation

## 📄 License

MIT License - see LICENSE file for details.

---

Built with TypeScript, WebLLM, and Chrome Extensions API.
