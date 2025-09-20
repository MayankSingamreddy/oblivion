// Rule application engine with hide/blank/replace strategies
import { Rule, UndoAction } from '../types/types';

export class RuleEngine {
  private appliedRules = new Map<string, Set<Element>>();
  private undoStack: UndoAction[] = [];
  private criticalStyleTag: HTMLStyleElement | null = null;
  private shadowHosts = new WeakSet<Element>();
  private maxUndoStackSize = 20;

  constructor() {
    this.createCriticalStyleTag();
  }

  // Apply a rule to matching elements
  applyRule(rule: Rule): number {
    try {
      const elements = document.querySelectorAll(rule.selector);
      const validElements = Array.from(elements).filter(el => this.isValidTarget(el));
      
      if (validElements.length === 0) {
        console.warn(`No valid elements found for selector: ${rule.selector}`);
        return 0;
      }

      if (validElements.length > 50) {
        console.warn(`Selector matches too many elements (${validElements.length}): ${rule.selector}`);
        return 0;
      }

      const affectedElements = new Set<Element>();
      const undoAction: UndoAction = {
        id: crypto.randomUUID(),
        type: 'rule',
        action: 'apply',
        timestamp: Date.now(),
        rule,
        elements: validElements,
        prevValues: new Map()
      };

      for (const element of validElements) {
        if (this.applyRuleToElement(element, rule, undoAction)) {
          affectedElements.add(element);
        }
      }

      if (affectedElements.size > 0) {
        this.appliedRules.set(rule.id, affectedElements);
        this.addToUndoStack(undoAction);
        this.markElementsAsProcessed(affectedElements, rule);
      }

      return affectedElements.size;
    } catch (error) {
      console.error('Failed to apply rule:', rule, error);
      return 0;
    }
  }

  private applyRuleToElement(element: Element, rule: Rule, undoAction: UndoAction): boolean {
    // Store original state for undo
    const prevStyles = this.captureElementState(element);
    undoAction.prevValues!.set(element, JSON.stringify(prevStyles));

    switch (rule.action) {
      case 'hide':
        return this.hideElement(element, rule.strategy);
      case 'blank':
        return this.blankElement(element, rule.strategy);
      case 'replace':
        return this.replaceElement(element, rule);
      default:
        console.warn(`Unknown rule action: ${rule.action}`);
        return false;
    }
  }

  private hideElement(element: Element, strategy: Rule['strategy']): boolean {
    if (strategy.preserveLayout) {
      // Use visibility instead of display to preserve layout
      (element as HTMLElement).style.setProperty('visibility', 'hidden', 'important');
      (element as HTMLElement).style.setProperty('pointer-events', 'none', 'important');
    } else {
      (element as HTMLElement).style.setProperty('display', 'none', 'important');
    }

    element.setAttribute('data-oblivion-hidden', 'true');
    element.setAttribute('data-oblivion-timestamp', Date.now().toString());

    return true;
  }

  private blankElement(element: Element, strategy: Rule['strategy']): boolean {
    const htmlElement = element as HTMLElement;
    
    // Make content invisible but preserve space
    htmlElement.style.setProperty('color', 'transparent', 'important');
    htmlElement.style.setProperty('background-color', 'transparent', 'important');
    htmlElement.style.setProperty('background-image', 'none', 'important');
    htmlElement.style.setProperty('border-color', 'transparent', 'important');
    htmlElement.style.setProperty('text-shadow', 'none', 'important');
    htmlElement.style.setProperty('box-shadow', 'none', 'important');
    
    if (!strategy.preserveLayout) {
      htmlElement.style.setProperty('opacity', '0', 'important');
    }

    htmlElement.style.setProperty('pointer-events', 'none', 'important');
    element.setAttribute('data-oblivion-blanked', 'true');
    element.setAttribute('data-oblivion-timestamp', Date.now().toString());

    return true;
  }

  private replaceElement(element: Element, rule: Rule): boolean {
    // Create shadow root for isolated replacement
    if (!element.shadowRoot && element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA') {
      try {
        const shadow = element.attachShadow({ mode: 'open' });
        this.shadowHosts.add(element);

        // Create replacement content
        const replacement = this.createReplacement(rule);
        shadow.appendChild(replacement);

        // Hide original content
        (element as HTMLElement).style.setProperty('font-size', '0', 'important');
        (element as HTMLElement).style.setProperty('line-height', '0', 'important');
        (element as HTMLElement).style.setProperty('overflow', 'hidden', 'important');

        element.setAttribute('data-oblivion-replaced', 'true');
        element.setAttribute('data-oblivion-timestamp', Date.now().toString());

        return true;
      } catch (error) {
        console.warn('Cannot attach shadow root to element:', element, error);
        // Fallback to hiding
        return this.hideElement(element, rule.strategy);
      }
    } else {
      // Fallback for elements that can't have shadow roots
      return this.hideElement(element, rule.strategy);
    }
  }

  private createReplacement(rule: Rule): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = `
      padding: 4px 8px;
      background: rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 4px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11px;
      color: #666;
      text-align: center;
      cursor: default;
      user-select: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: 200px;
    `;

    const icon = document.createElement('span');
    icon.textContent = '🚫';
    icon.style.fontSize = '12px';

    const text = document.createElement('span');
    text.textContent = rule.notes || 'Hidden by Oblivion';
    text.style.fontSize = '10px';

    container.appendChild(icon);
    container.appendChild(text);

    return container;
  }

  // Remove a specific rule
  removeRule(ruleId: string): boolean {
    const affectedElements = this.appliedRules.get(ruleId);
    if (!affectedElements) return false;

    const undoAction: UndoAction = {
      id: crypto.randomUUID(),
      type: 'rule',
      action: 'remove',
      timestamp: Date.now(),
      elements: Array.from(affectedElements),
      prevValues: new Map()
    };

    for (const element of affectedElements) {
      this.restoreElement(element);
    }

    this.appliedRules.delete(ruleId);
    this.addToUndoStack(undoAction);

    return true;
  }

  private restoreElement(element: Element): void {
    const htmlElement = element as HTMLElement;

    // Remove all oblivion-specific styles and attributes
    const oblivionAttributes = [
      'data-oblivion-hidden',
      'data-oblivion-blanked', 
      'data-oblivion-replaced',
      'data-oblivion-timestamp',
      'data-oblivion-rule-id'
    ];

    oblivionAttributes.forEach(attr => element.removeAttribute(attr));

    // Restore shadow root elements
    if (this.shadowHosts.has(element) && element.shadowRoot) {
      element.shadowRoot.innerHTML = '';
      this.shadowHosts.delete(element);
    }

    // Remove applied styles by resetting to empty string
    const stylesToReset = [
      'display', 'visibility', 'opacity', 'color', 'background-color',
      'background-image', 'border-color', 'text-shadow', 'box-shadow',
      'pointer-events', 'font-size', 'line-height', 'overflow'
    ];

    stylesToReset.forEach(prop => {
      htmlElement.style.removeProperty(prop);
    });
  }

  // Undo last action
  undo(): boolean {
    if (this.undoStack.length === 0) return false;

    const lastAction = this.undoStack.pop()!;
    
    if (lastAction.type === 'rule') {
      if (lastAction.action === 'apply') {
        // Undo application - restore elements
        lastAction.elements?.forEach(element => {
          this.restoreElement(element);
          
          // Restore previous state if available
          const prevStateJson = lastAction.prevValues?.get(element);
          if (prevStateJson) {
            try {
              const prevState = JSON.parse(prevStateJson);
              this.restoreElementState(element, prevState);
            } catch (error) {
              console.warn('Failed to restore element state:', error);
            }
          }
        });

        if (lastAction.rule) {
          this.appliedRules.delete(lastAction.rule.id);
        }
      } else if (lastAction.action === 'remove') {
        // Undo removal - reapply rule
        if (lastAction.rule) {
          this.applyRule(lastAction.rule);
        }
      }
    }

    return true;
  }

  // Reset all rules
  resetAll(): void {
    for (const [ruleId, elements] of this.appliedRules) {
      elements.forEach(element => this.restoreElement(element));
    }

    this.appliedRules.clear();
    this.undoStack = [];
    this.shadowHosts = new WeakSet();

    // Clear critical styles
    if (this.criticalStyleTag) {
      this.criticalStyleTag.textContent = '';
    }
  }

  // Get currently applied rules
  getAppliedRules(): Rule[] {
    return Array.from(this.appliedRules.keys())
      .map(id => this.findRuleById(id))
      .filter(rule => rule !== null) as Rule[];
  }

  // Pre-inject critical CSS for zero-flicker hiding
  injectCriticalCSS(rules: Rule[]): void {
    if (!this.criticalStyleTag) {
      this.createCriticalStyleTag();
    }

    const criticalSelectors = rules
      .filter(rule => rule.action === 'hide' && !rule.strategy.preserveLayout)
      .map(rule => `${rule.selector} { display: none !important; }`)
      .join('\n');

    if (this.criticalStyleTag) {
      this.criticalStyleTag.textContent = criticalSelectors;
    }
  }

  private createCriticalStyleTag(): void {
    this.criticalStyleTag = document.createElement('style');
    this.criticalStyleTag.id = 'oblivion-critical';
    this.criticalStyleTag.setAttribute('data-oblivion-critical', 'true');
    
    // Insert at the very beginning of head for maximum priority
    const head = document.head || document.getElementsByTagName('head')[0];
    if (head.firstChild) {
      head.insertBefore(this.criticalStyleTag, head.firstChild);
    } else {
      head.appendChild(this.criticalStyleTag);
    }
  }

  private isValidTarget(element: Element): boolean {
    // Prevent hiding critical page elements
    const criticalSelectors = [
      'html', 'body', 'head',
      '[data-oblivion-ui]', // Our own UI elements
      'script', 'style', 'meta', 'title', 'link'
    ];

    if (criticalSelectors.some(sel => element.matches?.(sel))) {
      return false;
    }

    // Check if element is already processed
    if (element.hasAttribute('data-oblivion-hidden') ||
        element.hasAttribute('data-oblivion-blanked') ||
        element.hasAttribute('data-oblivion-replaced')) {
      return false;
    }

    // Check if element is inside our shadow DOM
    let parent = element.parentElement;
    while (parent) {
      if (parent.hasAttribute('data-oblivion-ui')) {
        return false;
      }
      parent = parent.parentElement;
    }

    return true;
  }

  private markElementsAsProcessed(elements: Set<Element>, rule: Rule): void {
    elements.forEach(element => {
      element.setAttribute('data-oblivion-rule-id', rule.id);
    });
  }

  private captureElementState(element: Element): any {
    const htmlElement = element as HTMLElement;
    const computedStyle = window.getComputedStyle(htmlElement);
    
    return {
      display: computedStyle.display,
      visibility: computedStyle.visibility,
      opacity: computedStyle.opacity,
      color: computedStyle.color,
      backgroundColor: computedStyle.backgroundColor,
      // Add other properties as needed
    };
  }

  private restoreElementState(element: Element, state: any): void {
    const htmlElement = element as HTMLElement;
    
    Object.keys(state).forEach(prop => {
      if (state[prop] && state[prop] !== 'initial') {
        htmlElement.style.setProperty(prop, state[prop]);
      }
    });
  }

  private addToUndoStack(action: UndoAction): void {
    this.undoStack.push(action);
    
    // Limit undo stack size
    if (this.undoStack.length > this.maxUndoStackSize) {
      this.undoStack.shift();
    }
  }

  private findRuleById(id: string): Rule | null {
    // This would typically fetch from storage or memory
    // For now, return null - will be implemented with storage integration
    return null;
  }

  // Validate rule before applying
  validateRule(rule: Rule): boolean {
    try {
      // Check if selector is valid
      document.querySelector(rule.selector);
      
      // Check if selector isn't too broad
      const matches = document.querySelectorAll(rule.selector);
      if (matches.length > 100) {
        console.warn(`Rule selector too broad: ${matches.length} matches`);
        return false;
      }

      // Check rule structure
      if (!rule.id || !rule.selector || !rule.action) {
        console.warn('Invalid rule structure:', rule);
        return false;
      }

      return true;
    } catch (error) {
      console.warn('Invalid selector in rule:', rule.selector, error);
      return false;
    }
  }

  // Check if an element is interactive (for safety warnings)
  isInteractiveElement(element: Element): boolean {
    const interactiveTags = new Set([
      'a', 'button', 'input', 'select', 'textarea', 'label', 
      'option', 'summary', 'details'
    ]);

    const interactiveRoles = new Set([
      'button', 'link', 'menuitem', 'tab', 'checkbox', 
      'radio', 'textbox', 'combobox', 'listbox'
    ]);

    // Check tag name
    if (interactiveTags.has(element.tagName.toLowerCase())) {
      return true;
    }

    // Check role
    const role = element.getAttribute('role');
    if (role && interactiveRoles.has(role.toLowerCase())) {
      return true;
    }

    // Check for click handlers or tabindex
    if (element.hasAttribute('onclick') || 
        (element.hasAttribute('tabindex') && element.getAttribute('tabindex') !== '-1')) {
      return true;
    }

    return false;
  }

  // Get statistics about applied rules
  getStatistics(): { totalRules: number; totalElements: number; undoStackSize: number } {
    let totalElements = 0;
    for (const elements of this.appliedRules.values()) {
      totalElements += elements.size;
    }

    return {
      totalRules: this.appliedRules.size,
      totalElements,
      undoStackSize: this.undoStack.length
    };
  }
}
