// CSS injection and DOM manipulation
window.injector = {
    styleTag: null,
    appliedIds: new Set(),
  
  applyChanges(elements, destructive = false) {
    console.log('CleanView injector: applyChanges called with', elements.length, 'elements, destructive:', destructive);
    
    const changeRecord = {
      type: destructive ? 'destructive' : 'nondestructive',
      timestamp: Date.now(),
      elements: [],
      ids: []
    };

    if (destructive) {
      console.log('CleanView injector: Applying destructive changes');
      // Store elements for potential restoration
      elements.forEach(el => {
        changeRecord.elements.push({
          element: el,
          parent: el.parentNode,
          nextSibling: el.nextSibling,
          outerHTML: el.outerHTML
        });
        el.remove();
      });
    } else {
      console.log('CleanView injector: Applying non-destructive changes');
      // Non-destructive hiding with CSS
      this.ensureStyleTag();
      
      elements.forEach(el => {
        const id = 'cv-' + this.generateId();
        el.setAttribute('data-cleanview-id', id);
        this.appliedIds.add(id);
        changeRecord.ids.push(id);
      });
      
      this.updateStyleTag();
      console.log('CleanView injector: Applied', changeRecord.ids.length, 'CSS hiding rules');
    }

    return changeRecord;
  },
  
    undoChanges(changeRecord) {
      if (changeRecord.type === 'destructive') {
        // Restore removed elements
        changeRecord.elements.forEach(info => {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = info.outerHTML;
          const restoredElement = tempDiv.firstChild;
          
          if (info.nextSibling) {
            info.parent.insertBefore(restoredElement, info.nextSibling);
          } else {
            info.parent.appendChild(restoredElement);
          }
        });
      } else {
        // Remove CSS hiding
        changeRecord.ids.forEach(id => {
          this.appliedIds.delete(id);
          const elements = document.querySelectorAll(`[data-cleanview-id="${id}"]`);
          elements.forEach(el => el.removeAttribute('data-cleanview-id'));
        });
        
        this.updateStyleTag();
      }
    },
  
    ensureStyleTag() {
      if (!this.styleTag || !document.contains(this.styleTag)) {
        this.styleTag = document.createElement('style');
        this.styleTag.setAttribute('data-cleanview', '1');
        document.documentElement.appendChild(this.styleTag);
      }
    },
  
  updateStyleTag() {
    if (!this.styleTag) return;
    
    const rules = Array.from(this.appliedIds).map(id => 
      `[data-cleanview-id="${id}"] { display: none !important; }`
    );
    
    console.log('CleanView injector: Updating style tag with', rules.length, 'rules');
    console.log('CleanView injector: CSS rules:', rules);
    
    this.styleTag.textContent = rules.join('\n');
  },
  
    generateId() {
      return Math.random().toString(36).substr(2, 9);
    },
  
    reset() {
      // Remove all applied changes
      this.appliedIds.clear();
      
      // Remove all data attributes
      document.querySelectorAll('[data-cleanview-id]').forEach(el => {
        el.removeAttribute('data-cleanview-id');
      });
      
      // Remove style tag
      if (this.styleTag) {
        this.styleTag.remove();
        this.styleTag = null;
      }
    }
  };
  