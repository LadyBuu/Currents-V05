/**
 * =============================================================================
 * STILL WATERS - CULTURE MYTHOLOGY TAB (js/tabs/culture-mythology-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/culture-mythology-tab.js
 *
 * A CultureEditorTabs tab for editing the mythology section of a culture:
 * creation/afterlife/cosmology text, plus list sections for keyDeities,
 * keyEvents, symbols, and themes.
 *
 * REGISTRATION (CultureEditorTabs, composite form):
 *   CultureEditorTabs.registerTab('mythology', MythologyTab);
 *
 *   render(container, culture)     — paints the tab's DOM into `container`
 *   save(culture)                  — returns a partial culture object whose
 *                                    `mythology` field replaces the whole
 *                                    mythology; the HOST merges and calls
 *                                    CultureCommands.updateCulture once
 *   validate(culture)              — { valid, errors, warnings }
 *
 * CONTRACTS
 * ---------
 *   - Reads are scoped to `container.querySelector(...)`. Never `document`.
 *   - Writes go into `culture.mythology` on change, so a tab switch
 *     preserves input. The HOST is the only thing that calls
 *     CultureCommands.updateCulture; this tab only ever produces a
 *     candidate object in save().
 *   - No inline `style=""`. Classes live in css/culture-tabs.css.
 *   - No emojis. No `<template>`-suggestion glyphs. No inline `onkeydown`.
 *     Template buttons are text-only; list-tag remove buttons are text-only.
 *   - No `confirm()` from inside list-tag handlers. The composite save()
 *     call is the commit point; transient edits live in the working
 *     culture and are discarded on Cancel.
 *
 * THE SHAPE OF `mythology`
 * ------------------------
 *   mythology = {
 *     creation:   string,
 *     afterlife:  string,
 *     cosmology:  string,
 *     keyDeities: string[],
 *     keyEvents:  string[],
 *     symbols:    string[],
 *     themes:     string[]
 *   }
 *
 *   Only non-empty fields are kept in the candidate. Text fields with
 *   empty strings are preserved as '' so a user who clears an existing
 *   text field actually clears it (rather than it silently reverting).
 *   List fields with zero items are preserved as [] so a user who removes
 *   the last item actually clears the list.
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - CultureEditorTabs (this must load after culture-editor-tab.js)
 *   - formatting.js     (escapeHtml)
 *   - icons.js          (Icons[name] via _getIcon)
 *   - ui.js             (showToast — only used for tag-add feedback)
 *   - modals-core.js    (optional, for confirmDialog — not used here)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    // =========================================================================
    // 2. SECTION DEFINITIONS
    // =========================================================================
    //
    // Text sections render as labeled textareas. List sections render as
    // a chip set with a text input and Add button. The two arrays below
    // are the tab's own presentation vocabulary.

    var TEXT_SECTIONS = [
        {
            key: 'creation',
            label: 'Creation Story',
            hint: 'The origin story of the world and humanity',
            placeholder: 'How did the world begin? Describe the creation myth of this culture...',
            rows: 4
        },
        {
            key: 'afterlife',
            label: 'Afterlife Beliefs',
            hint: 'Beliefs about what happens to the soul after death',
            placeholder: 'What happens after death? Describe the journey of the soul...',
            rows: 4
        },
        {
            key: 'cosmology',
            label: 'Cosmology',
            hint: 'The structure of the universe and the relationship between realms',
            placeholder: 'How is the universe structured? Describe the cosmic order...',
            rows: 3
        }
    ];

    var LIST_SECTIONS = [
        {
            key: 'keyDeities',
            label: 'Key Deities',
            hint: 'Major gods and goddesses worshipped by this culture',
            placeholder: 'Odin, Thor, Freya'
        },
        {
            key: 'keyEvents',
            label: 'Key Events',
            hint: 'Important mythological events and stories',
            placeholder: 'The Creation, The Great Flood, The War of the Gods'
        },
        {
            key: 'symbols',
            label: 'Symbols',
            hint: 'Sacred symbols and their meanings',
            placeholder: 'Mjolnir, Valknut, Yggdrasil'
        },
        {
            key: 'themes',
            label: 'Themes',
            hint: 'Core values and recurring themes in mythology',
            placeholder: 'Honor, Courage, Fate, Loyalty'
        }
    ];

    // =========================================================================
    // 3. HELPERS
    // =========================================================================

    function _isObject(v) {
        return v !== null && typeof v === 'object' && !Array.isArray(v);
    }

    function _mythologyOf(culture) {
        return (culture && _isObject(culture.mythology)) ? culture.mythology : {};
    }

    function _stringOf(mythology, key) {
        var v = mythology ? mythology[key] : null;
        return (typeof v === 'string') ? v : '';
    }

    function _stringListOf(mythology, key) {
        var list = mythology ? mythology[key] : null;
        if (!Array.isArray(list)) return [];
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (typeof list[i] === 'string' && list[i].length > 0) {
                out.push(list[i]);
            }
        }
        return out;
    }

    function _wordCount(str) {
        if (typeof str !== 'string') return 0;
        var trimmed = str.trim();
        if (!trimmed) return 0;
        return trimmed.split(/\s+/).length;
    }

    /**
     * Reads the DOM back into the working culture's `mythology` field.
     * Called on every input so tab-switch preservation works. Preserves
     * empty text as '' (so cleared fields stay cleared) and empty lists
     * as [] (so removed items stay removed).
     */
    function _syncToWorkingCulture(root, culture) {
        if (!root || !culture) return;

        var mythology = {};

        // Text sections: always read (a cleared field becomes '').
        for (var i = 0; i < TEXT_SECTIONS.length; i++) {
            var textSection = TEXT_SECTIONS[i];
            var textarea = root.querySelector(
                '.ct-mythology-textarea[data-section="' + textSection.key + '"]'
            );
            mythology[textSection.key] = textarea ? textarea.value : '';
        }

        // List sections: read from chips.
        for (var j = 0; j < LIST_SECTIONS.length; j++) {
            var listSection = LIST_SECTIONS[j];
            mythology[listSection.key] = _readTags(root, listSection.key);
        }

        culture.mythology = mythology;
    }

    function _readTags(root, sectionKey) {
        var chips = root.querySelectorAll(
            '.ct-mythology-tag-container[data-section="' + sectionKey + '"] .ct-mythology-tag'
        );
        var out = [];
        for (var i = 0; i < chips.length; i++) {
            var text = chips[i].getAttribute('data-value');
            if (typeof text === 'string' && text.length > 0) out.push(text);
        }
        return out;
    }

    // =========================================================================
    // 4. RENDER
    // =========================================================================

    function renderMythologyTab(container, culture) {
        if (!container) return;

        if (!culture) {
            container.innerHTML =
                '<div class="rt-empty">No culture loaded.</div>';
            return;
        }

        var mythology = _mythologyOf(culture);

        var html =
            '<div class="ct-mythology">' +

            // ---- Hint ----
            '<div class="ct-hint">' +
              'Define the mythology, beliefs, and sacred traditions of this ' +
              'culture. These are flavor text and have no gameplay impact.' +
            '</div>' +

            // ---- Overview stats ----
            _renderOverview(mythology) +

            // ---- Text sections ----
            '<div class="ct-mythology__text-grid">';
        for (var i = 0; i < TEXT_SECTIONS.length; i++) {
            html += _renderTextSection(TEXT_SECTIONS[i], _stringOf(mythology, TEXT_SECTIONS[i].key));
        }
        html +=
            '</div>' +

            // ---- List sections ----
            '<div class="ct-mythology__list-grid">';
        for (var j = 0; j < LIST_SECTIONS.length; j++) {
            html += _renderListSection(LIST_SECTIONS[j], _stringListOf(mythology, LIST_SECTIONS[j].key));
        }
        html +=
            '</div>' +

            // ---- Footer hint ----
            '<div class="ct-hint ct-hint--footer">' +
              'Press Enter to add an item to a list. Use the Remove button ' +
              'on a chip to delete it.' +
            '</div>' +

            '</div>';

        container.innerHTML = html;

        _attachEvents(container, culture);
        _syncToWorkingCulture(container, culture);
    }

    function _renderOverview(mythology) {
        var parts = [];

        var deityCount = _stringListOf(mythology, 'keyDeities').length;
        var eventCount = _stringListOf(mythology, 'keyEvents').length;
        var symbolCount = _stringListOf(mythology, 'symbols').length;
        var themeCount = _stringListOf(mythology, 'themes').length;

        if (deityCount > 0) parts.push(deityCount + ' deities');
        if (eventCount > 0) parts.push(eventCount + ' events');
        if (symbolCount > 0) parts.push(symbolCount + ' symbols');
        if (themeCount > 0) parts.push(themeCount + ' themes');

        var words = _wordCount(_stringOf(mythology, 'creation'))
            + _wordCount(_stringOf(mythology, 'afterlife'))
            + _wordCount(_stringOf(mythology, 'cosmology'));
        if (words > 0) parts.push(words + ' words');

        var summary = parts.length > 0 ? parts.join(' · ') : 'No mythology defined yet';

        return (
            '<div class="ct-mythology__overview">' +
              '<span class="ct-mythology__overview-label">Mythology Overview</span>' +
              '<span class="ct-mythology__overview-summary">' + _escapeHtml(summary) + '</span>' +
            '</div>'
        );
    }

    function _renderTextSection(section, value) {
        var words = _wordCount(value);
        return (
            '<div class="ct-card ct-mythology-text" data-section="' + _escapeHtml(section.key) + '">' +
              '<div class="ct-card__header">' +
                '<div class="ct-card__title">' +
                  _escapeHtml(section.label) +
                  '<span class="ct-card__hint">' + _escapeHtml(section.hint) + '</span>' +
                '</div>' +
                '<span class="ct-mythology-wordcount">' + words + ' words</span>' +
              '</div>' +
              '<textarea class="ct-mythology-textarea"' +
                ' data-section="' + _escapeHtml(section.key) + '"' +
                ' rows="' + Number(section.rows) + '"' +
                ' placeholder="' + _escapeHtml(section.placeholder) + '">' +
                _escapeHtml(value) +
              '</textarea>' +
            '</div>'
        );
    }

    function _renderListSection(section, items) {
        var chipsHtml = '';
        if (items.length === 0) {
            chipsHtml = '<div class="ct-mythology-empty">No items yet.</div>';
        } else {
            for (var i = 0; i < items.length; i++) {
                chipsHtml += _renderTag(section.key, items[i]);
            }
        }

        return (
            '<div class="ct-card ct-mythology-list" data-section="' + _escapeHtml(section.key) + '">' +
              '<div class="ct-card__header">' +
                '<div class="ct-card__title">' +
                  _escapeHtml(section.label) +
                  '<span class="ct-card__hint">' + _escapeHtml(section.hint) + '</span>' +
                '</div>' +
                '<span class="ct-mythology-count">' + items.length + ' items</span>' +
              '</div>' +
              '<div class="ct-mythology-tag-container" data-section="' + _escapeHtml(section.key) + '">' +
                chipsHtml +
              '</div>' +
              '<div class="ct-mythology-add-row">' +
                '<input type="text" class="ct-mythology-add-input"' +
                  ' data-section="' + _escapeHtml(section.key) + '"' +
                  ' placeholder="Add ' + _escapeHtml(section.label) + '...">' +
                '<button type="button" class="rt-btn rt-btn--primary ct-mythology-add-btn"' +
                  ' data-section="' + _escapeHtml(section.key) + '">Add</button>' +
              '</div>' +
            '</div>'
        );
    }

    function _renderTag(sectionKey, value) {
        return (
            '<span class="ct-mythology-tag" data-section="' + _escapeHtml(sectionKey) + '"' +
              ' data-value="' + _escapeHtml(value) + '">' +
              '<span class="ct-mythology-tag__label">' + _escapeHtml(value) + '</span>' +
              '<button type="button" class="ct-mythology-tag__remove" title="Remove">Remove</button>' +
            '</span>'
        );
    }

    // =========================================================================
    // 5. EVENT WIRING
    // =========================================================================

    function _attachEvents(container, culture) {
        // Delegated input listener: text edits + live re-sync into the
        // working culture. List inputs also route through this (harmless;
        // the input listener only updates the culture's text fields via
        // _syncToWorkingCulture, which reads list tags as-is).
        container.addEventListener('input', function (e) {
            var target = e.target;
            if (target && target.classList && target.classList.contains('ct-mythology-textarea')) {
                _updateWordCount(target);
            }
            _syncToWorkingCulture(container, culture);
        });

        // Delegated keydown on the list inputs: Enter adds a tag.
        container.addEventListener('keydown', function (e) {
            var target = e.target;
            if (!target || !target.classList) return;
            if (!target.classList.contains('ct-mythology-add-input')) return;
            if (e.key !== 'Enter') return;
            e.preventDefault();
            var sectionKey = target.getAttribute('data-section');
            if (sectionKey) _handleAddTag(container, culture, sectionKey);
        });

        // Delegated click: add button / remove button.
        container.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            var addBtn = target.closest('.ct-mythology-add-btn');
            if (addBtn) {
                e.preventDefault();
                var sectionKey = addBtn.getAttribute('data-section');
                if (sectionKey) _handleAddTag(container, culture, sectionKey);
                return;
            }

            var removeBtn = target.closest('.ct-mythology-tag__remove');
            if (removeBtn) {
                e.preventDefault();
                var tag = removeBtn.closest('.ct-mythology-tag');
                if (tag) _handleRemoveTag(container, culture, tag);
                return;
            }
        });
    }

    function _updateWordCount(textarea) {
        var card = textarea.closest('.ct-mythology-text');
        if (!card) return;
        var countEl = card.querySelector('.ct-mythology-wordcount');
        if (!countEl) return;
        countEl.textContent = _wordCount(textarea.value) + ' words';
    }

    function _handleAddTag(container, culture, sectionKey) {
        var input = container.querySelector(
            '.ct-mythology-add-input[data-section="' + sectionKey + '"]'
        );
        var tagContainer = container.querySelector(
            '.ct-mythology-tag-container[data-section="' + sectionKey + '"]'
        );
        if (!input || !tagContainer) return;

        var value = (input.value || '').trim();
        if (!value) return;

        // Duplicate check against the current tags.
        var existing = tagContainer.querySelectorAll('.ct-mythology-tag');
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].getAttribute('data-value') === value) {
                _showToast('Duplicate item: "' + value + '"', 'warning');
                input.focus();
                return;
            }
        }

        // Remove the empty state if present.
        var empty = tagContainer.querySelector('.ct-mythology-empty');
        if (empty) empty.remove();

        // Insert the new tag chip.
        var tmp = document.createElement('div');
        tmp.innerHTML = _renderTag(sectionKey, value);
        var chip = tmp.firstChild;
        tagContainer.appendChild(chip);

        // Clear the input.
        input.value = '';

        // Update the count.
        _updateTagCount(container, sectionKey);

        // Sync to working culture.
        _syncToWorkingCulture(container, culture);

        // Refocus the input for rapid entry.
        input.focus();
    }

    function _handleRemoveTag(container, culture, tag) {
        var tagContainer = tag.parentNode;
        if (!tagContainer) return;

        tag.remove();

        // If the container is now empty, restore the empty state.
        if (tagContainer.querySelectorAll('.ct-mythology-tag').length === 0) {
            var emptyDiv = document.createElement('div');
            emptyDiv.className = 'ct-mythology-empty';
            emptyDiv.textContent = 'No items yet.';
            tagContainer.appendChild(emptyDiv);
        }

        var sectionKey = tagContainer.getAttribute('data-section');
        if (sectionKey) _updateTagCount(container, sectionKey);

        _syncToWorkingCulture(container, culture);
    }

    function _updateTagCount(container, sectionKey) {
        var card = container.querySelector(
            '.ct-mythology-list[data-section="' + sectionKey + '"]'
        );
        if (!card) return;
        var countEl = card.querySelector('.ct-mythology-count');
        if (!countEl) return;
        var count = card.querySelectorAll('.ct-mythology-tag').length;
        countEl.textContent = count + ' items';

        // Refresh the overview line.
        var culture = null;
        var parent = container.closest('.ct-editor');
        if (parent) {
            // The overview is a sibling of the text grid; find it and
            // rebuild its summary from the current chip counts.
            var overviewSummary = container.querySelector('.ct-mythology__overview-summary');
            if (overviewSummary) {
                overviewSummary.textContent = _buildOverviewSummary(container);
            }
        }
    }

    function _buildOverviewSummary(container) {
        var parts = [];
        var counts = [
            { key: 'keyDeities', label: 'deities' },
            { key: 'keyEvents', label: 'events' },
            { key: 'symbols', label: 'symbols' },
            { key: 'themes', label: 'themes' }
        ];
        for (var i = 0; i < counts.length; i++) {
            var n = container.querySelectorAll(
                '.ct-mythology-tag-container[data-section="' + counts[i].key + '"] .ct-mythology-tag'
            ).length;
            if (n > 0) parts.push(n + ' ' + counts[i].label);
        }

        var words = 0;
        var textareas = container.querySelectorAll('.ct-mythology-textarea');
        for (var j = 0; j < textareas.length; j++) {
            words += _wordCount(textareas[j].value);
        }
        if (words > 0) parts.push(words + ' words');

        return parts.length > 0 ? parts.join(' · ') : 'No mythology defined yet';
    }

    // =========================================================================
    // 6. SAVE
    // =========================================================================
    //
    // Called by the HOST's save-all. Reads the DOM (via the sync the input
    // handlers already performed) and returns the partial culture object
    // the host will merge. Preserves empty text as '' and empty lists as
    // [] so cleared fields stay cleared.

    function saveMythologyTab(culture) {
        if (!culture) return culture;
        return { mythology: culture.mythology || {} };
    }

    // =========================================================================
    // 7. VALIDATE
    // =========================================================================
    //
    // Reads the candidate, not the DOM. Deterministic regardless of which
    // tab is visible.

    function validateMythologyTab(culture) {
        var errors = [];
        var warnings = [];

        if (!culture) {
            return { valid: true, errors: [], warnings: [] };
        }

        var mythology = _mythologyOf(culture);

        // Duplicate check for list sections.
        for (var i = 0; i < LIST_SECTIONS.length; i++) {
            var section = LIST_SECTIONS[i];
            var items = _stringListOf(mythology, section.key);
            var seen = Object.create(null);
            for (var j = 0; j < items.length; j++) {
                if (seen[items[j]]) {
                    errors.push(
                        'Duplicate item "' + items[j] + '" in ' + section.label + '.'
                    );
                }
                seen[items[j]] = true;
            }
        }

        // Warning when nothing is defined.
        var hasContent = false;
        for (var k = 0; k < TEXT_SECTIONS.length; k++) {
            if (_stringOf(mythology, TEXT_SECTIONS[k].key).trim().length > 10) {
                hasContent = true;
                break;
            }
        }
        if (!hasContent) {
            for (var m = 0; m < LIST_SECTIONS.length; m++) {
                if (_stringListOf(mythology, LIST_SECTIONS[m].key).length > 0) {
                    hasContent = true;
                    break;
                }
            }
        }
        if (!hasContent) {
            warnings.push('Mythology is mostly empty — consider adding some flavor text.');
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings
        };
    }

    // =========================================================================
    // 8. TAB DEFINITION + REGISTRATION
    // =========================================================================

    var MythologyTab = {
        label: 'Mythology',
        icon: 'BOOK',
        render: renderMythologyTab,
        save: saveMythologyTab,
        validate: validateMythologyTab
    };

    window.MythologyTab = MythologyTab;

    function register() {
        if (typeof window.CultureEditorTabs === 'undefined'
            || !window.CultureEditorTabs
            || typeof window.CultureEditorTabs.registerTab !== 'function') {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'culture-mythology-tab.js: CultureEditorTabs is not loaded; ' +
                    'the mythology tab was not registered. Load ' +
                    'culture-editor-tab.js first.'
                );
            }
            return false;
        }
        return window.CultureEditorTabs.registerTab('mythology', MythologyTab);
    }

    window.registerMythologyTab = register;

    if (typeof window.CultureEditorTabs !== 'undefined') {
        register();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            MythologyTab: MythologyTab,
            registerMythologyTab: register
        };
    }
})();
