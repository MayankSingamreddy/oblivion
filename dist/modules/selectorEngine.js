export class SelectorEngine {
    constructor() {
        this.volatileClassPatterns = [
            /^[a-z]+-[a-f0-9]{6,}$/i, // Tailwind/CSS-in-JS hashes
            /^css-[a-f0-9]+$/i, // Styled-components
            /^[a-z]+[A-Z][a-zA-Z]*-[0-9]+$/i, // React class hashes
            /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, // UUIDs
            /^[a-z]{2,3}[0-9]{3,}$/i, // Short random strings
            /^[A-Z][a-z]+[0-9]+[A-Z][a-z]+$/i, // Mixed case with numbers
        ];
        this.stableAttributePriority = [
            'data-testid',
            'id',
            'name',
            'aria-label',
            'aria-labelledby',
            'role',
            'data-id',
            'data-cy',
            'data-test',
            'title'
        ];
        this.landmarkTags = new Set([
            'header', 'main', 'nav', 'aside', 'footer', 'section', 'article'
        ]);
        this.maxDepth = 4;
        this.maxSelectorLength = 200;
    }
    generate(element) {
        // Try different strategies in order of stability
        const strategies = [
            () => this.tryUniqueId(element),
            () => this.tryStableAttribute(element),
            () => this.tryLandmarkRole(element),
            () => this.tryStableClass(element),
            () => this.tryRelativeToStableParent(element),
            () => this.trySemanticPath(element),
            () => this.tryFallbackSelector(element)
        ];
        for (const strategy of strategies) {
            const result = strategy();
            if (result && this.validateSelector(result.selector)) {
                result.anchors = this.extractAnchors(element);
                return result;
            }
        }
        // Ultimate fallback
        return {
            selector: this.createFallbackSelector(element),
            confidence: 0.1,
            anchors: this.extractAnchors(element),
            description: 'Basic element selector (low stability)'
        };
    }
    tryUniqueId(element) {
        const id = element.id;
        if (!id || this.isVolatileValue(id))
            return null;
        const selector = `#${CSS.escape(id)}`;
        if (document.querySelectorAll(selector).length === 1) {
            return {
                selector,
                confidence: 0.95,
                anchors: {},
                description: `Element with ID: ${id}`
            };
        }
        return null;
    }
    tryStableAttribute(element) {
        for (const attr of this.stableAttributePriority) {
            const value = element.getAttribute(attr);
            if (!value || this.isVolatileValue(value))
                continue;
            const selector = `[${attr}="${CSS.escape(value)}"]`;
            const matches = document.querySelectorAll(selector);
            if (matches.length === 1) {
                return {
                    selector,
                    confidence: 0.9,
                    anchors: {},
                    description: `Element with ${attr}: ${value}`
                };
            }
            else if (matches.length <= 3) {
                // Try combining with tag name for disambiguation
                const tagSelector = `${element.tagName.toLowerCase()}${selector}`;
                if (document.querySelectorAll(tagSelector).length === 1) {
                    return {
                        selector: tagSelector,
                        confidence: 0.85,
                        anchors: {},
                        description: `${element.tagName} with ${attr}: ${value}`
                    };
                }
            }
        }
        return null;
    }
    tryLandmarkRole(element) {
        const role = element.getAttribute('role');
        const tagName = element.tagName.toLowerCase();
        // Landmark elements are generally stable
        if (this.landmarkTags.has(tagName) ||
            ['navigation', 'banner', 'main', 'complementary', 'contentinfo'].includes(role || '')) {
            let selector = tagName;
            if (role) {
                selector = `[role="${role}"]`;
            }
            const matches = document.querySelectorAll(selector);
            if (matches.length === 1) {
                return {
                    selector,
                    confidence: 0.8,
                    anchors: {},
                    description: `Landmark element: ${role || tagName}`
                };
            }
            else if (matches.length <= 3) {
                // Try adding a stable class or parent context
                const refined = this.refineWithContext(element, selector);
                if (refined)
                    return refined;
            }
        }
        return null;
    }
    tryStableClass(element) {
        const classes = Array.from(element.classList).filter(cls => !this.isVolatileClass(cls) && cls.length >= 3);
        if (classes.length === 0)
            return null;
        // Try single stable class first
        for (const cls of classes) {
            const selector = `.${CSS.escape(cls)}`;
            const matches = document.querySelectorAll(selector);
            if (matches.length === 1) {
                return {
                    selector,
                    confidence: 0.7,
                    anchors: {},
                    description: `Element with class: ${cls}`
                };
            }
        }
        // Try combining stable classes
        if (classes.length >= 2) {
            const combinedSelector = classes.slice(0, 2)
                .map(cls => `.${CSS.escape(cls)}`)
                .join('');
            if (document.querySelectorAll(combinedSelector).length === 1) {
                return {
                    selector: combinedSelector,
                    confidence: 0.65,
                    anchors: {},
                    description: `Element with classes: ${classes.slice(0, 2).join(', ')}`
                };
            }
        }
        return null;
    }
    tryRelativeToStableParent(element) {
        let current = element.parentElement;
        let depth = 0;
        while (current && depth < this.maxDepth) {
            const parentResult = this.tryUniqueId(current) ||
                this.tryStableAttribute(current) ||
                this.tryLandmarkRole(current);
            if (parentResult && parentResult.confidence >= 0.7) {
                const childPath = this.getChildPath(current, element);
                if (childPath.length <= 3) { // Keep path short
                    const selector = `${parentResult.selector} ${childPath}`;
                    if (document.querySelectorAll(selector).length === 1 &&
                        selector.length <= this.maxSelectorLength) {
                        return {
                            selector,
                            confidence: Math.max(0.5, parentResult.confidence - 0.2),
                            anchors: {},
                            description: `Child of ${parentResult.description}`
                        };
                    }
                }
            }
            current = current.parentElement;
            depth++;
        }
        return null;
    }
    trySemanticPath(element) {
        const path = [];
        let current = element;
        let depth = 0;
        while (current && depth < this.maxDepth) {
            const step = this.getSemanticStep(current);
            if (step) {
                path.unshift(step);
            }
            else {
                break; // Stop if we can't make a semantic step
            }
            current = current.parentElement;
            depth++;
        }
        if (path.length >= 2) {
            const selector = path.join(' > ');
            if (document.querySelectorAll(selector).length === 1) {
                return {
                    selector,
                    confidence: 0.6,
                    anchors: {},
                    description: `Semantic path selector`
                };
            }
        }
        return null;
    }
    tryFallbackSelector(element) {
        // Last resort: tag + nth-child, but limited depth
        const path = [];
        let current = element;
        let depth = 0;
        while (current && depth < 3) { // Even shorter for fallback
            const parent = current.parentElement;
            if (!parent)
                break;
            const siblings = Array.from(parent.children);
            const index = siblings.indexOf(current);
            if (index >= 0) {
                path.unshift(`${current.tagName.toLowerCase()}:nth-child(${index + 1})`);
            }
            current = parent;
            depth++;
        }
        if (path.length > 0) {
            const selector = path.join(' > ');
            if (document.querySelectorAll(selector).length === 1) {
                return {
                    selector,
                    confidence: 0.3,
                    anchors: {},
                    description: 'Positional selector (unstable)'
                };
            }
        }
        return null;
    }
    getChildPath(parent, target) {
        const steps = [];
        let current = target;
        while (current && current !== parent && steps.length < 3) {
            const step = this.getSemanticStep(current) ||
                this.getPositionalStep(current);
            if (step) {
                steps.unshift(step);
            }
            current = current.parentElement;
        }
        return steps.join(' > ');
    }
    getSemanticStep(element) {
        const tag = element.tagName.toLowerCase();
        const role = element.getAttribute('role');
        const stableClasses = Array.from(element.classList)
            .filter(cls => !this.isVolatileClass(cls))
            .slice(0, 1); // Only use first stable class
        if (role) {
            return `[role="${role}"]`;
        }
        if (stableClasses.length > 0) {
            return `${tag}.${stableClasses[0]}`;
        }
        if (this.landmarkTags.has(tag)) {
            return tag;
        }
        return null;
    }
    getPositionalStep(element) {
        const parent = element.parentElement;
        if (!parent)
            return element.tagName.toLowerCase();
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(element);
        return `${element.tagName.toLowerCase()}:nth-child(${index + 1})`;
    }
    refineWithContext(element, baseSelector) {
        // Try adding stable parent context
        const parent = element.parentElement;
        if (!parent)
            return null;
        const parentId = parent.id;
        if (parentId && !this.isVolatileValue(parentId)) {
            const refined = `#${CSS.escape(parentId)} > ${baseSelector}`;
            if (document.querySelectorAll(refined).length === 1) {
                return {
                    selector: refined,
                    confidence: 0.75,
                    anchors: {},
                    description: `${baseSelector} in parent #${parentId}`
                };
            }
        }
        return null;
    }
    createFallbackSelector(element) {
        return `${element.tagName.toLowerCase()}[data-oblivion-fallback]`;
    }
    isVolatileClass(className) {
        return this.volatileClassPatterns.some(pattern => pattern.test(className));
    }
    isVolatileValue(value) {
        return this.volatileClassPatterns.some(pattern => pattern.test(value));
    }
    validateSelector(selector) {
        try {
            const elements = document.querySelectorAll(selector);
            return elements.length > 0 && elements.length <= 20; // Not too broad
        }
        catch (error) {
            return false;
        }
    }
    extractAnchors(element) {
        const anchors = {};
        // ID anchor
        if (element.id) {
            anchors.id = element.id;
        }
        // Role anchor
        const role = element.getAttribute('role');
        if (role) {
            anchors.role = role;
        }
        // Aria label anchor
        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) {
            anchors.ariaLabel = ariaLabel;
        }
        // Test ID anchor
        const testId = element.getAttribute('data-testid');
        if (testId) {
            anchors.testId = testId;
        }
        // Text content anchor (limited length)
        const textContent = element.textContent?.trim();
        if (textContent && textContent.length > 0 && textContent.length <= 100) {
            anchors.text = textContent;
        }
        // Stable classes anchor
        const stableClasses = Array.from(element.classList)
            .filter(cls => !this.isVolatileClass(cls))
            .slice(0, 3);
        if (stableClasses.length > 0) {
            anchors.classes = stableClasses;
        }
        // Position anchor
        const parent = element.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children);
            const index = siblings.indexOf(element);
            anchors.position = {
                tagName: element.tagName.toLowerCase(),
                nthChild: index + 1,
                depth: this.getElementDepth(element)
            };
        }
        return anchors;
    }
    getElementDepth(element) {
        let depth = 0;
        let current = element.parentElement;
        while (current && depth < 20) { // Prevent infinite loops
            depth++;
            current = current.parentElement;
        }
        return depth;
    }
    // Utility method to test selector stability over time
    testSelectorStability(selector) {
        return new Promise((resolve) => {
            const initialCount = document.querySelectorAll(selector).length;
            // Test after a short delay to catch dynamic changes
            setTimeout(() => {
                const finalCount = document.querySelectorAll(selector).length;
                const stability = initialCount > 0 && initialCount === finalCount ? 1.0 : 0.0;
                resolve(stability);
            }, 500);
        });
    }
}
//# sourceMappingURL=selectorEngine.js.map