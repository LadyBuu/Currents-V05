/**
 * =============================================================================
 * STILL WATERS - CULTURE APPEARANCE TAB (js/tabs/culture-appearance-tab.js)
 * =============================================================================
 * 
 * A modular tab for editing culture appearance options.
 * 
 * USAGE:
 *   // Register the tab
 *   window.registerCultureAppearanceTab();
 * 
 *   // Or manually:
 *   CultureEditorTabs.registerTab('appearance', AppearanceTab.definition);
 * 
 * DEPENDENCIES:
 *   - CultureEditorTabs (js/culture/culture-editor-tabs.js)
 *   - modals-core.js (for _escapeHtml, _getIcon, _showToast)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        if (window.Icons && window.Icons.CIRCLE) return window.Icons.CIRCLE;
        return '';
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') window._showToast(msg, type);
        else if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    // =========================================================================
    // 2. APPEARANCE CATEGORY DEFINITIONS
    // =========================================================================

    var APPEARANCE_CATEGORIES = [
        { key: 'skinTones', label: 'Skin Tones', description: 'Skin color variations' },
        { key: 'eyeColors', label: 'Eye Colors', description: 'Eye color variations' },
        { key: 'hairColors', label: 'Hair Colors', description: 'Hair color variations' },
        { key: 'hairTypes', label: 'Hair Types', description: 'Hair texture variations' },
        { key: 'buildTypes', label: 'Build Types', description: 'Body build variations' },
        { key: 'commonFeatures', label: 'Common Features', description: 'Distinctive facial features' }
    ];

    var HEIGHT_CATEGORY = { key: 'height', label: 'Height Ranges', description: 'Gender-specific height ranges' };

    // =========================================================================
    // 3. RENDER FUNCTIONS
    // =========================================================================

    /**
     * Render a single appearance category
     */
    function renderCategory(category, items, container) {
        var html = '<div class="appearance-category" data-category="' + category.key + '" style="' +
            'background:var(--bg2);border-radius:6px;padding:12px;margin-bottom:12px;' +
            'border:1px solid var(--border);' +
            '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<div>' +
            '<span style="font-size:0.75rem;font-weight:bold;">' + _escapeHtml(category.label) + '</span>' +
            '<span style="font-size:0.55rem;color:var(--dim);margin-left:8px;">' + _escapeHtml(category.description) + '</span>' +
            '</div>' +
            '<span style="font-size:0.55rem;color:var(--dim);">' + (items ? items.length : 0) + ' options</span>' +
            '</div>' +
            '<div class="appearance-options-list" style="display:flex;flex-direction:column;gap:4px;">';

        if (items && items.length > 0) {
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                html += renderOptionRow(item, i);
            }
        } else {
            html += '<div class="empty-options" style="text-align:center;padding:12px;color:var(--dim);font-size:0.6rem;">No options defined</div>';
        }

        html += '</div>' +
            '<button class="add-option-btn" data-category="' + category.key + '" style="' +
            'margin-top:8px;padding:4px 12px;background:var(--bg3);' +
            'border:1px dashed var(--border);border-radius:4px;' +
            'cursor:pointer;font-size:0.6rem;width:100%;' +
            'transition:all 0.15s;' +
            '" onmouseover="this.style.background=\'var(--accent-dim)\'" onmouseout="this.style.background=\'var(--bg3)\'">' +
            '+ Add ' + category.label + ' Option' +
            '</button>' +
            '</div>';

        return html;
    }

    /**
     * Render a single option row
     */
    function renderOptionRow(item, index) {
        var value = item.value || '';
        var weight = item.weight !== undefined ? item.weight : 10;

        return '<div class="appearance-option-row" data-index="' + index + '" style="' +
            'display:flex;align-items:center;gap:8px;padding:4px 0;' +
            'border-bottom:1px solid var(--border-light);' +
            '">' +
            '<span class="option-drag" style="cursor:grab;color:var(--dim);font-size:0.7rem;user-select:none;">⠿</span>' +
            '<input type="text" class="option-value" value="' + _escapeHtml(value) + '" placeholder="Option name" style="' +
            'flex:1;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;' +
            'font-size:0.7rem;' +
            '">' +
            '<input type="number" class="option-weight" value="' + weight + '" min="0" max="100" style="' +
            'width:50px;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;' +
            'font-size:0.7rem;text-align:center;' +
            '">' +
            '<span style="font-size:0.5rem;color:var(--dim);">weight</span>' +
            '<button class="remove-option-btn" style="' +
            'background:transparent;border:none;color:var(--danger);cursor:pointer;' +
            'font-size:0.8rem;padding:2px 6px;' +
            '" title="Remove option">✕</button>' +
            '</div>';
    }

    /**
     * Render height range section
     */
    function renderHeightSection(heightConfig) {
        heightConfig = heightConfig || {};

        var maleMin = heightConfig.male && heightConfig.male.min !== undefined ? heightConfig.male.min : 155;
        var maleMax = heightConfig.male && heightConfig.male.max !== undefined ? heightConfig.male.max : 200;
        var femaleMin = heightConfig.female && heightConfig.female.min !== undefined ? heightConfig.female.min : 145;
        var femaleMax = heightConfig.female && heightConfig.female.max !== undefined ? heightConfig.female.max : 185;

        var rulerIcon = _getIcon('RULER') || '📏';

        return '<div class="height-section" style="' +
            'background:var(--bg2);border-radius:6px;padding:12px;' +
            'border:1px solid var(--border);' +
            '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<div>' +
            '<span style="font-size:0.75rem;font-weight:bold;">' + rulerIcon + ' Height Ranges</span>' +
            '<span style="font-size:0.55rem;color:var(--dim);margin-left:8px;">Gender-specific height ranges (cm)</span>' +
            '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div>' +
            '<label style="display:block;font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Male Range</label>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
            '<input type="number" id="height_male_min" value="' + maleMin + '" min="100" max="250" style="' +
            'flex:1;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.7rem;' +
            '">' +
            '<span style="font-size:0.6rem;color:var(--dim);">to</span>' +
            '<input type="number" id="height_male_max" value="' + maleMax + '" min="100" max="250" style="' +
            'flex:1;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.7rem;' +
            '">' +
            '<span style="font-size:0.55rem;color:var(--dim);">cm</span>' +
            '</div>' +
            '</div>' +
            '<div>' +
            '<label style="display:block;font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Female Range</label>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
            '<input type="number" id="height_female_min" value="' + femaleMin + '" min="100" max="250" style="' +
            'flex:1;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.7rem;' +
            '">' +
            '<span style="font-size:0.6rem;color:var(--dim);">to</span>' +
            '<input type="number" id="height_female_max" value="' + femaleMax + '" min="100" max="250" style="' +
            'flex:1;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.7rem;' +
            '">' +
            '<span style="font-size:0.55rem;color:var(--dim);">cm</span>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>';
    }

    // =========================================================================
    // 4. MAIN TAB RENDERER
    // =========================================================================

    function renderAppearanceTab(container, culture) {
        if (!culture) {
            container.innerHTML = '<div style="padding:20px;color:var(--dim);">No culture loaded</div>';
            return;
        }

        var appearance = culture.appearance || {};

        var html = '<div class="culture-appearance-tab" style="padding:4px;">' +
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;font-size:0.65rem;color:var(--dim);">' +
            'Define weighted appearance traits for characters of this culture. ' +
            'Higher weight = more common. Drag to reorder options.' +
            '</div>' +
            '<div class="appearance-categories" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';

        for (var i = 0; i < APPEARANCE_CATEGORIES.length; i++) {
            var category = APPEARANCE_CATEGORIES[i];
            var items = appearance[category.key] || [];
            html += renderCategory(category, items);
        }

        html += '</div>' +
            '<div style="margin-top:12px;">' +
            renderHeightSection(appearance.height) +
            '</div>' +
            '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);text-align:center;">' +
            'Options with weight 0 will never be selected. All weights are relative to each other within the category.' +
            '</div>' +
            '</div>';

        container.innerHTML = html;

        // Attach event listeners after DOM is ready
        setTimeout(function() {
            attachEventListeners(container);
        }, 50);
    }

    // =========================================================================
    // 5. EVENT HANDLERS
    // =========================================================================

    function attachEventListeners(container) {
        // Add option buttons
        var addBtns = container.querySelectorAll('.add-option-btn');
        for (var i = 0; i < addBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var categoryKey = this.dataset.category;
                    var list = this.closest('.appearance-category').querySelector('.appearance-options-list');
                    var empty = list.querySelector('.empty-options');

                    // Remove empty state if it exists
                    if (empty) empty.remove();

                    // Create new row
                    var newRow = document.createElement('div');
                    newRow.className = 'appearance-option-row';
                    newRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border-light);';
                    newRow.innerHTML =
                        '<span class="option-drag" style="cursor:grab;color:var(--dim);font-size:0.7rem;user-select:none;">⠿</span>' +
                        '<input type="text" class="option-value" placeholder="Option name" style="flex:1;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.7rem;">' +
                        '<input type="number" class="option-weight" value="10" min="0" max="100" style="width:50px;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.7rem;text-align:center;">' +
                        '<span style="font-size:0.5rem;color:var(--dim);">weight</span>' +
                        '<button class="remove-option-btn" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:0.8rem;padding:2px 6px;" title="Remove option">✕</button>';

                    // Insert before the add button
                    list.appendChild(newRow);

                    // Focus the new input
                    var valueInput = newRow.querySelector('.option-value');
                    if (valueInput) setTimeout(function() { valueInput.focus(); }, 50);

                    // Add remove handler
                    var removeBtn = newRow.querySelector('.remove-option-btn');
                    if (removeBtn) {
                        removeBtn.addEventListener('click', function() {
                            if (confirm('Remove this option?')) {
                                this.closest('.appearance-option-row').remove();
                                // Check if list is empty
                                var parentList = this.closest('.appearance-options-list');
                                if (parentList.querySelectorAll('.appearance-option-row').length === 0) {
                                    parentList.innerHTML = '<div class="empty-options" style="text-align:center;padding:12px;color:var(--dim);font-size:0.6rem;">No options defined</div>';
                                }
                            }
                        });
                    }

                    // Update count
                    updateCategoryCount(this.closest('.appearance-category'));
                });
            })(addBtns[i]);
        }

        // Remove option buttons (existing)
        var removeBtns = container.querySelectorAll('.remove-option-btn');
        for (var i = 0; i < removeBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    if (confirm('Remove this option?')) {
                        this.closest('.appearance-option-row').remove();
                        var parentList = this.closest('.appearance-options-list');
                        if (parentList.querySelectorAll('.appearance-option-row').length === 0) {
                            parentList.innerHTML = '<div class="empty-options" style="text-align:center;padding:12px;color:var(--dim);font-size:0.6rem;">No options defined</div>';
                        }
                        updateCategoryCount(this.closest('.appearance-category'));
                    }
                });
            })(removeBtns[i]);
        }

        // Drag-and-drop support
        setupDragAndDrop(container);

        // Real-time validation
        var valueInputs = container.querySelectorAll('.option-value');
        for (var i = 0; i < valueInputs.length; i++) {
            (function(input) {
                input.addEventListener('input', function() {
                    validateOption(this);
                });
                input.addEventListener('blur', function() {
                    validateOption(this);
                });
            })(valueInputs[i]);
        }

        // Weight validation
        var weightInputs = container.querySelectorAll('.option-weight');
        for (var i = 0; i < weightInputs.length; i++) {
            (function(input) {
                input.addEventListener('change', function() {
                    var val = parseInt(this.value);
                    if (isNaN(val) || val < 0) this.value = 0;
                    if (val > 100) this.value = 100;
                });
            })(weightInputs[i]);
        }
    }

    // =========================================================================
    // 6. DRAG AND DROP SUPPORT
    // =========================================================================

    function setupDragAndDrop(container) {
        var dragHandle = null;
        var dragItem = null;

        container.addEventListener('mousedown', function(e) {
            var handle = e.target.closest('.option-drag');
            if (!handle) return;

            e.preventDefault();
            dragHandle = handle;
            dragItem = handle.closest('.appearance-option-row');

            if (dragItem) {
                dragItem.style.opacity = '0.6';
                dragItem.style.background = 'var(--accent-dim)';
                dragItem.style.borderRadius = '4px';
            }
        });

        document.addEventListener('mousemove', function(e) {
            if (!dragItem) return;

            var list = dragItem.closest('.appearance-options-list');
            if (!list) return;

            var items = list.querySelectorAll('.appearance-option-row');
            var targetItem = null;

            for (var i = 0; i < items.length; i++) {
                if (items[i] === dragItem) continue;
                var rect = items[i].getBoundingClientRect();
                var midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    targetItem = items[i];
                    break;
                }
            }

            // Visual feedback
            if (targetItem) {
                targetItem.style.borderTop = '2px solid var(--accent)';
            } else if (items.length > 0) {
                items[items.length - 1].style.borderBottom = '2px solid var(--accent)';
            }
        });

        document.addEventListener('mouseup', function(e) {
            if (!dragItem) return;

            var list = dragItem.closest('.appearance-options-list');
            if (list) {
                var items = list.querySelectorAll('.appearance-option-row');
                var targetIndex = -1;

                for (var i = 0; i < items.length; i++) {
                    if (items[i] === dragItem) continue;
                    var rect = items[i].getBoundingClientRect();
                    var midY = rect.top + rect.height / 2;
                    if (e.clientY < midY) {
                        targetIndex = i;
                        break;
                    }
                }

                // Clear visual feedback
                for (var i = 0; i < items.length; i++) {
                    items[i].style.borderTop = '';
                    items[i].style.borderBottom = '';
                }

                if (targetIndex !== -1 && items[targetIndex] !== dragItem) {
                    // Move the item
                    var parent = dragItem.parentNode;
                    var refNode = items[targetIndex];
                    parent.insertBefore(dragItem, refNode);
                } else if (targetIndex === -1 && items.length > 0) {
                    // Move to end
                    var parent = dragItem.parentNode;
                    parent.appendChild(dragItem);
                }
            }

            dragItem.style.opacity = '';
            dragItem.style.background = '';
            dragItem.style.borderRadius = '';
            dragItem = null;
            dragHandle = null;
        });
    }

    // =========================================================================
    // 7. HELPERS
    // =========================================================================

    function updateCategoryCount(categoryEl) {
        if (!categoryEl) return;
        var countEl = categoryEl.querySelector('.appearance-category > div:first-child span:last-child');
        var list = categoryEl.querySelector('.appearance-options-list');
        if (countEl && list) {
            var count = list.querySelectorAll('.appearance-option-row').length;
            countEl.textContent = count + ' options';
        }
    }

    function validateOption(input) {
        var value = input.value.trim();
        if (!value) {
            input.style.borderColor = 'var(--danger)';
            return false;
        }
        input.style.borderColor = 'var(--success)';
        return true;
    }

    // =========================================================================
    // 8. SAVE FUNCTION
    // =========================================================================

    function saveAppearanceTab(culture) {
        var appearance = {};

        // Collect all categories
        for (var i = 0; i < APPEARANCE_CATEGORIES.length; i++) {
            var category = APPEARANCE_CATEGORIES[i];
            var options = [];

            var categoryEl = document.querySelector('.appearance-category[data-category="' + category.key + '"]');
            if (categoryEl) {
                var rows = categoryEl.querySelectorAll('.appearance-option-row');
                for (var j = 0; j < rows.length; j++) {
                    var row = rows[j];
                    var valueInput = row.querySelector('.option-value');
                    var weightInput = row.querySelector('.option-weight');

                    if (valueInput && valueInput.value.trim()) {
                        options.push({
                            value: valueInput.value.trim(),
                            weight: parseInt(weightInput ? weightInput.value : 10) || 10
                        });
                    }
                }
            }

            if (options.length > 0) {
                appearance[category.key] = options;
            }
        }

        // Collect height data
        var maleMin = document.getElementById('height_male_min');
        var maleMax = document.getElementById('height_male_max');
        var femaleMin = document.getElementById('height_female_min');
        var femaleMax = document.getElementById('height_female_max');

        if (maleMin && maleMax && femaleMin && femaleMax) {
            appearance.height = {
                male: {
                    min: parseInt(maleMin.value) || 155,
                    max: parseInt(maleMax.value) || 200
                },
                female: {
                    min: parseInt(femaleMin.value) || 145,
                    max: parseInt(femaleMax.value) || 185
                }
            };
        }

        // Merge with existing culture
        var updated = {};
        for (var key in culture) {
            if (culture.hasOwnProperty(key)) {
                updated[key] = culture[key];
            }
        }
        updated.appearance = appearance;

        return updated;
    }

    // =========================================================================
    // 9. VALIDATE FUNCTION
    // =========================================================================

    function validateAppearanceTab(culture) {
        var errors = [];
        var warnings = [];

        if (!culture.appearance) {
            warnings.push('No appearance options defined');
            return { valid: true, errors: [], warnings: warnings };
        }

        // Check each category
        for (var i = 0; i < APPEARANCE_CATEGORIES.length; i++) {
            var category = APPEARANCE_CATEGORIES[i];
            var items = culture.appearance[category.key] || [];

            // Check for duplicate values
            var seen = {};
            for (var j = 0; j < items.length; j++) {
                var value = items[j].value;
                if (value && seen[value]) {
                    errors.push('Duplicate option "' + value + '" in ' + category.label);
                }
                if (value) {
                    seen[value] = true;
                }
            }

            // Check for empty values
            for (var j = 0; j < items.length; j++) {
                if (!items[j].value || items[j].value.trim() === '') {
                    errors.push('Empty option in ' + category.label);
                }
            }
        }

        // Validate height ranges
        var height = culture.appearance.height;
        if (height) {
            if (height.male && height.male.min > height.male.max) {
                errors.push('Male height min (' + height.male.min + ') exceeds max (' + height.male.max + ')');
            }
            if (height.female && height.female.min > height.female.max) {
                errors.push('Female height min (' + height.female.min + ') exceeds max (' + height.female.max + ')');
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings
        };
    }

    // =========================================================================
    // 10. TAB DEFINITION
    // =========================================================================

    var AppearanceTab = {
        label: 'Appearance',
        icon: 'PERSON',
        render: renderAppearanceTab,
        save: saveAppearanceTab,
        validate: validateAppearanceTab
    };

    // =========================================================================
    // 11. REGISTER FUNCTION
    // =========================================================================

    function registerAppearanceTab() {
        if (typeof window.CultureEditorTabs === 'undefined') {
            console.warn('[AppearanceTab] CultureEditorTabs not available, tab not registered');
            return false;
        }

        var result = window.CultureEditorTabs.registerTab('appearance', AppearanceTab);
        if (result) {
            console.log('[AppearanceTab] Registered appearance tab successfully');
        }
        return result;
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.AppearanceTab = AppearanceTab;
    window.registerAppearanceTab = registerAppearanceTab;

    // Auto-register if CultureEditorTabs is available
    if (typeof window.CultureEditorTabs !== 'undefined') {
        registerAppearanceTab();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            AppearanceTab: AppearanceTab,
            registerAppearanceTab: registerAppearanceTab
        };
    }

    console.log('[AppearanceTab] Loaded successfully');

})();