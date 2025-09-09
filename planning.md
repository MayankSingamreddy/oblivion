Here’s a sharper, simpler product design for your extension—optimized for “just works,” with real memory, minimal clicks, and zero cognitive overhead. I’m opinionated where it helps, and I cut anything that creates friction.

Product vision

Let people shape the feel of the web they use every day—once—then forget it. The extension quietly remembers and reapplies those choices per-site and per-page type, even as pages change (SPAs, lazy loads, A/B variants).

Core principles (non-negotiable)

One-tap, obvious actions. The popup has three big buttons: Clean, Tweak, Ask AI. No jargon, no modes to babysit.

Memory is automatic. Every accepted change is saved to a per-site profile and re-applied instantly on future visits.

Fail gracefully. If AI is off or slow, rules & patterns still get you 90% there. No dead ends or “try again later.”

Non-destructive, reversible. Always hide (not delete). Instant Undo, per-site Reset, and a persistent “Restore temporarily” toggle.

Zero flicker. Rules apply early on navigation and continuously via MutationObserver so SPAs/lazy loads don’t bring clutter back.

The product, reimagined
1) Popup UI (the 5-second mental model)

Header: Site name + tiny status dot

Green: profile active; Gray: no rules yet.

Primary actions (big buttons)

Clean → One-tap preset for the current site (uses site recipe + your memory).

Tweak → Manual “point & hide” with hover highlight.

Ask AI → Natural language: “Hide trending and suggestions.”

Sticky toggle: “Always apply on this site”

Inline chips: Quick switches for common elements the system detects on this site (e.g., Trending, Sidebar, Stories, Recs)

Tap to hide/show; updates memory immediately.

Footer: Undo • Reset (this site) • Settings (gear)

Why this is simpler

No separate “Manual vs AI mode.” They’re actions, not modes.

No preview page. You see live changes on the page with clear highlights and a tiny floating toolbar to commit/undo.

2) On-page micro-toolbar (appears only while editing)

A small draggable pill at bottom-right:

“+ Select” (cursor turns crosshair; hover highlights; click to hide)

“Undo” (last action)

“Done” (commits and hides the toolbar)

ESC exits.

Selections show a soft outline; hidden items briefly show a “ghost” label (“Hidden: Trending”) with an [Unhide] button that fades after 3s. This removes the need for a separate preview screen.

3) Memory engine (the key to “just works”)

Goal: Persist robust, low-breakage rules per site and page type.

Rule object (minimal, resilient)
{
  "when": { "host": "x.com", "pathPattern": "/home" },
  "actions": [
    { "type": "hide", "selector": "[aria-label='Explore'] section[role='region']", "anchor": { "text": "Trending", "role": "region" }, "stability": 0.78 },
    { "type": "hide", "selector": "aside[role='complementary']" }
  ],
  "meta": { "createdAt": 1690000000, "lastSeen": 1690001000, "hits": 124 }
}

How selectors stay stable

Smart Selector Builder: Generate CSS with multiple anchors: role, aria-labels, text content fingerprints, and nth-of-type—not brittle classnames.

Stability score: Track how often a selector matches. If it drops, try sibling/ancestor anchors automatically.

Anchored matching: Prefer role/text/aria anchors over ephemeral classes.

Auto-heal: If a rule fails 3×, attempt a local re-match using stored anchors; if not found, mark “needs review” and don’t spam.

When memory is written

Tapping Clean (accepts suggested rules)

Hiding via Tweak

Approving an Ask AI change

Toggling a chip (e.g., Trending)

Scope of memory

Site profile = host-level defaults

Page patterns = pathPattern (e.g., /home, /watch, /r/*)

Global preferences (optional): generic patterns like “always hide cookie nags” or “dim autoplay videos”

All stored in chrome.storage.sync (if enabled) with size-aware compaction. Local-only fallback is chrome.storage.local.

4) Rule engine (simple and powerful without bloat)

To keep scope tight and intuitive:

hide(selector) – collapse element (display:none !important)

dim(selector, amount=0.2) – reduce visual weight without reflow

mute(selector) – stop animations/autoplay where feasible (remove autoplay, prefers-reduced-motion styles)

style(selector, props) – limited, safe properties (opacity, blur, saturate, backdrop-filter, max-width). No arbitrary CSS to avoid breaking sites.

Non-goals for v1: text rewrite, custom JS injections, layout reflow hacks. Stay focused on “remove/dim distractions.”

Application timing (no flicker)

Early apply: inject critical CSS and minimal script on document_start

Continuous apply: MutationObserver re-applies rules for new nodes

SPA aware: listen to pushState, replaceState, popstate, route changes

5) AI that doesn’t get in your way

AI is optional and never blocks:

Ask AI button accepts a natural query.

AI receives a sanitized structural digest (roles, aria, text fingerprints, tag tree), not raw page text by default (privacy-first).

Returns a list of selectors with descriptions (“Trending rail”, “Right sidebar”).

You approve per item (chips appear instantly).

If AI fails or rate-limited, pattern recipes + heuristic detection kick in:

Ads/Promos: [id*="ad" i], [class*="ad" i], [aria-label*="sponsor" i]…

Sidebars: aside, [role="complementary"]

Trending/Explore: regions with header text ~ “Trending/Explore”

Recs/Up next: common patterns on YouTube/Reddit/Twitter

Everything approved is saved to memory as normal rules.

Hard truth: AI is useful for first-time setup and edge sites, but 80% of value comes from robust presets + your memory. We design for that.

6) Site presets (“Clean”)

Ship with curated presets that map to known page structures. These are just rule bundles you can auto-accept and later toggle:

X / Twitter: Hide Trending, Who to follow, right sidebar modules, “For you” recs if desired.

YouTube: Hide homepage recs, Shorts shelf, “Up next” sidebar on watch pages.

Reddit: Hide sidebars, “Popular communities,” awards, “See more posts.”

News sites: Hide floating share bars, sticky subscribe nags, in-article promos.

Presets are conservative and readable—no brittle classnames, just semantics and roles. They seed your per-site profile on first click of Clean.

7) Settings (no rabbit holes)

Sync: On/Off (chrome sync).

AI: On/Off; model; API key; “never send content on these sites.”

Global quick toggles: “Block cookie nags,” “Reduce motion,” “Dim autoplay.”

Export/Import: Share a site recipe as JSON. (No gallery/marketplace in v1; avoid moderation/support overhead.)

Privacy: Clear site memory; view the exact selectors stored for this site.

How each part should function (developer + UX details)
Manifest & scripts

MV3 with a lightweight service worker (for install, keyboard shortcuts, and routing messages).

Content script (document_start):

Injects critical CSS + rule applier.

Initializes MutationObserver, SPA listeners, and message bus.

Loads site profile rules, applies immediately, watches DOM changes.

Page overlay module (lazy-loaded):

Provides hover highlights, selection, and the micro-toolbar.

Popup:

Requests current tab’s profile snapshot (rules active, chips available).

Triggers actions (Clean/Tweak/Ask AI).

Reflects state (Undo/Reset, “Always apply on this site”).

Selecting elements (Tweak)

Hover draws an outline on the nearest semantic block (role region/section/article/aside).

Mousewheel or keyboard cycles granularity (node ↔ parent ↔ section).

Click hides; a “ghost” toast appears with [Unhide].

Each hide writes a rule with a generated stable selector + anchor data.

ESC cancels; “Done” commits.

Undo/Reset semantics

Undo: last change (per tab session).

Reset (this site): temporarily disable all rules for this host (toggle becomes “Restore”).

Restore: re-enable the host rules.

Reset does not delete memory unless you choose “Clear memory for this site” in Settings.

Keyboard

Cmd/Ctrl+Shift+E: Open popup

Cmd/Ctrl+Shift+H: Quick Hide (enters Tweak immediately)

ESC: Exit edit overlay

Safety rails

Never hide <body>, <html>, or the main content landmark (role="main") unless explicitly confirmed.

Max N elements per action (default 100).

Tag our overlays/toolbar with data-erpro and auto-exclude from selection.

If a rule suddenly matches 1000+ nodes, soft-disable and flag.

Architecture (cleaner than today)
/extension
  manifest.json
  /popup
    popup.html / popup.js / popup.css
  /content
    content.js              // rule apply + observers + messaging
    overlay.js              // selection UI, lazy-loaded
    rules.js                // selector builder, rule DSL
    memory.js               // storage, stability, auto-heal
    spa.js                  // route detection, document_start hooks
  /ai
    ai-service.js           // optional; returns rule candidates with labels
  /options
    options.html / options.js / options.css
  /assets
    styles.css              // outlines, chips, toolbar


Single content entry (content.js) orchestrates; other modules are pure and testable.

No preview subsystem—the page itself is the preview.

Pattern recipes live in /content/rules.js (JSON) and are versioned.