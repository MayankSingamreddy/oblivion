Below is a master feature list and, for each, the most robust, efficient, and scalable way to implement it **with no server**. I’m assuming your current MV3 layout (service worker + popup + content orchestration), CSS-based non-destructive hiding, per-site rule persistence, AI mode that sends a structural page summary (not full content), and a pattern fallback—then pushing it to a more production-ready design. &#x20;

---

# Master feature set and best-practice implementations

## 1) Manual selection (“point & hide”)

**Goal:** user clicks an element; it’s hidden without triggering the page underneath; rules persist and reapply.

**Implementation**

* **Selection overlay layer:** inject a full-page, fixed overlay (transparent) during “select mode.” Draw highlight boxes using absolutely positioned divs. The overlay captures the click so the page doesn’t receive it (no accidental button presses).
* **Element targeting:** compute the “current target” by `document.elementFromPoint` under the cursor *beneath* the overlay via temporary `pointer-events:none` on the overlay while sampling. Restore `pointer-events:auto` immediately after sampling.
* **Stable selectors:** replace ad-hoc nth-child fallbacks with a proper selector engine that favors stable anchors (id, role/aria, landmark tags, long-lived classes) and truncates depth. Libraries like **css-selector-generator**, **Simmer**, or **unique-selector** are good bases; tune to **blacklist volatile classes** (hashy Tailwind/obfuscated classnames) and **cap depth** to reduce brittleness.
* **Rule schema (hide/blank/replace):**

  ```json
  {
    "id": "uuid",
    "host": "twitter.com",
    "action": "hide|blank|replace",
    "selector": "aside[role='complementary']",
    "strategy": {"preserveLayout": true, "collapseSpace": false},
    "notes": "Right sidebar",
    "createdAt": 1690000000000,
    "version": 2
  }
  ```
* **Persistence:** per-site rules in `chrome.storage.sync` (compressed batches per host). Cache hot rules in memory for the active tab.

**Why this scales:** the overlay prevents event leakage; stable selectors + blacklists minimize rework; storage keyed by host keeps lookups O(1). Your existing selection mode and memory flow map cleanly to this with stronger selector generation.&#x20;

---

## 2) LLM selection (natural-language commands)

**Goal:** “remove the right sidebar,” “hide suggested posts,” etc., with no server.

**Implementation**

* **Local models, zero-setup:** integrate **WebLLM** (WebGPU/WASM) inside the extension. Load a small instruct model on demand; cache weights in IndexedDB; run inference in a **Dedicated Worker** or **Service Worker** so the UI stays responsive, and the model persists across navigations when possible.
* **Prompting strategy:** send a **structural DOM sketch** (tag names, roles, landmarks, counts, bounding boxes, a few representative classes) rather than raw innerText to avoid content/privacy issues and token bloat (this matches how you already send page structure, not content).&#x20;
* **Output format:** the model returns a JSON list of `{selector, intent, confidence}`. Validate selectors client-side, warn/skip if they match > N nodes.
* **Fallback:** if local model not available (no WebGPU), allow the user to paste an API key and use remote inference (OpenAI-style) with the **same contract**. You already have an OpenAI path; keep it as an optional fallback.&#x20;

**Why this scales:** a single NL→selector function with strict output schema; local first; remote optional; deterministic validator.

---

## 3) Element removal strategies

**Goal:** hide without breaking layout, or keep space, or replace.

**Implementation**

* **Strategy pattern:**

  * **hide:** `display:none !important;` + mark with `data-oblivion-hidden="1"`.
  * **blank (preserve space):** `visibility:hidden;` or `color:transparent;` + `pointer-events:none;` preserve height/width.
  * **replace:** inject minimal placeholder within a **ShadowRoot** (theme-friendly badge or “Hidden by Oblivion”) so site CSS doesn’t affect it.
* **Zero-flicker:** pre-inject a `<style id="oblivion-critical">` at `document_start` with the host’s **critical selectors** so they’re hidden before first paint; then refine after DOM settles.

**Why this scales:** predictable behavior per rule; Shadow DOM isolates replacements; document\_start CSS removes flash.

---

## 4) Element addition + page re-design (themes, fonts, colors)

**Goal:** “cute browsing session” → pink background, rounded cards, new font; or add an extra toolbar.

**Implementation**

* **Theme capsule:** attach a single **ShadowRoot host** (e.g., `<oblivion-ui>`) at `document.body` top, containing your own CSS variables and components. Changes never collide with site CSS.
* **Design tokens:** store per-site tokens: `--obv-bg`, `--obv-accent`, `--obv-font`. Inject a `<style data-obv-theme>` that sets site-scoped overrides (background, fonts) via safe selectors (`html`, `body`, landmark regions).
* **Components:** any “added UI” (toolbar, quick toggles) lives inside the ShadowRoot.

**Why this scales:** one Shadow host per page; style scoping; fast token updates.

---

## 5) Memory (rule storage, sync, versioning)

**Goal:** rules persist per site; edits are reversible; storage remains under MV3 quotas.

**Implementation**

* **Keying:** `rules:{hostname}` → array of compact rules. Track `version` per rule for migrations.
* **Compression:** store selectors and notes with simple dictionary compression; batch writes with debounce; limit max rules per host; add LRU cleanup.
* **Import/export:** JSON file of all rules and themes so users can back up/publish presets.
* **UI:** “Save Current Config” remains the primary action (you already do this); auto-save opt-in for power users.&#x20;

**Why this scales:** bounded size; easy migration; shareable configs.

---

## 6) Auto-application (apply rules on every visit)

**Goal:** apply instantly on navigation and keep applying as infinite scroll loads new nodes.

**Implementation**

* **Early apply:** at `document_start`, inject **critical selectors** for the host to avoid flicker.
* **Continuous apply:** set up a single `MutationObserver` filtered to attributes/childList on `document.body`; for each host rule, try a **selector test** against new subtree roots only. To simplify, you can also use a tiny wrapper like **arrive.js** to watch for specific selectors without re-implementing observer plumbing.
* **Frames:** set `all_frames:true`; if remote iframes block injection, expose a warning and allow per-frame toggles when permission can be granted.

**Why this scales:** minimal observers; targeted re-matches; zero-flicker via early CSS.

---

## 7) Proactive generation (suggest fixes without user prompts)

**Goal:** the extension can propose cleanups or auto-apply user’s profile (e.g., always hide “trending”).

**Implementation**

* **Host profiles:** per-host baseline pack (“Twitter minimal,” “YouTube focus mode”). Ship as read-only presets; users can clone/override.
* **Heuristics first:** cheap detectors (role=“complementary”, class contains “ad”, width ratio > 25% for sidebars, sticky headers with `position:sticky`) propose candidates.
* **LLM refinement (local):** for ambiguous pages, ask the local model to map “don’t want distractions” → selectors using the same structural DOM sketch.
* **Consent model:** show a one-click “Apply my profile” toast; never modify silently unless the user enabled “auto-apply.”

**Why this scales:** heuristics are fast; LLM used sparingly; UX remains predictable.

---

## 8) Presets / rule packs

**Goal:** one-click cleanup for popular sites.

**Implementation**

* **Signed presets:** bundle curated JSON packs; display provenance and version.
* **Override chain:** `preset → user rules` (user always wins).
* **Distribution:** built into the extension; optional URL import.

**Why this scales:** reproducible defaults; fewer per-user prompts.

---

## 9) Undo/History & safety

**Goal:** quick rollback; avoid breaking core functionality.

**Implementation**

* **Per-tab undo stack:** last N actions stored in memory; actions are idempotent (hide/blank/replace → unapply).
* **Safety rails:** detect interactive targets (links, buttons, inputs) and warn before hiding; provide “Temporarily show all” hotkey.
* **“Broken page” shield:** if critical selectors (e.g., `main`, `body > header`) are hidden and navigation fails, auto-revert for that host and display a toast.

**Why this scales:** fast recovery reduces support load.

---

## 10) Performance & zero-jank

**Goal:** no noticeable CPU, no reflow storms.

**Implementation**

* **Single style tag per host:** batch rule CSS into one `<style>`; avoid touching inline styles on many nodes when possible.
* **Batch DOM ops:** microtask schedule; coalesce multiple hides into single style text update.
* **Selector sanity:** reject selectors that match > X nodes by default; prompt user to refine.
* **Workers:** do LLM + heavy parsing in Workers/Service Worker.

**Why this scales:** fewer style recalcs; less main-thread work.

---

## 11) Iframe & SPA routing

**Goal:** changes stick across client-side route changes and multi-frame pages.

**Implementation**

* **SPA detection:** listen for `history.pushState`/`popstate`/`hashchange`; re-run matchers on route change.
* **Iframes:** inject content scripts where same-origin allows; for cross-origin, expose a per-frame permission request UI (if/when the user grants host permissions).

**Why this scales:** covers modern app navigations reliably.

---

## 12) Model/runtime selection (no CLI)

**Goal:** zero setup, no “ollama serve.”

**Implementation**

* **Default: local (WebLLM):** lazy-download a \~1–2 GB model on first use; store in IndexedDB; run in Worker; show progress bar.
* **Fallback: remote:** if a user provides an API key (OpenAI-style) use it; otherwise, keep features that don’t require LLM (manual + presets + heuristics) fully functional.
* **Same contract:** NL→selectors JSON stays identical across backends, so the rest of the app doesn’t care.

**Why this scales:** users who can’t or won’t run local still have a smooth path; no server you have to maintain. Your current “AI service” abstraction already points in this direction.&#x20;

---

## 13) Developer experience & structure

**Goal:** maintainable codebase as features grow.

**Implementation**

* **Modules:**

  * `selectorEngine` (stable selector generation + blacklist)
  * `ruleEngine` (apply/unapply/render CSS)
  * `observer` (mutation/arrive wiring)
  * `nlAgent` (local/remote LLM adapter)
  * `themeCapsule` (ShadowRoot + tokens)
  * `storage` (sync/local, compression, migrations)
* **Types:** write in TypeScript end-to-end; share types across popup/content/worker.
* **Manifest V3:** `document_start` for critical CSS; `all_frames:true`; minimal permissions.
* **Testing:** host snapshots (static HTML fixtures) + selector golden tests to prevent regressions.

**Why this scales:** clear seams; easy to swap parts (e.g., different selector library, different model).

---

# Where your current design already aligns

* Content script orchestrator, non-destructive hiding, memory per host, selector validation, and structural (not content) AI context are already in your docs—keep those; just harden selector generation, early CSS, and dynamic re-application. &#x20;

---

## Quick cut list (so you can build in this order)

1. **Manual selection + overlay + stable selectors + storage**
2. **Auto-apply** (document\_start CSS + MutationObserver/arrive)
3. **Rule strategies** (hide/blank/replace + ShadowRoot host)
4. **Theme capsule** (design tokens; fonts/colours)
5. **Local LLM** adapter (WebLLM worker + fallback to API key)
6. **Presets & import/export**
7. **Undo & safety rails**

Ship 1–4 to deliver immediate value without any LLM. Then add 5 for the AI layer with zero setup, and 6–7 to round out ergonomics.

---

If you want, I can turn this into a minimal TS skeleton (selectors module + rule engine + arrive wiring + theme capsule) you can drop into your MV3 repo and iterate from there.
