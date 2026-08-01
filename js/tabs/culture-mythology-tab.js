/**
 * =============================================================================
 * STILL WATERS - CULTURE MYTHOLOGY TAB (js/tabs/culture-mythology-tab.js)
 * =============================================================================
 * 
 * A modular tab for editing culture mythology and beliefs.
 * 
 * USAGE:
 *   // Register the tab
 *   window.registerCultureMythologyTab();
 * 
 *   // Or manually:
 *   CultureEditorTabs.registerTab('mythology', MythologyTab.definition);
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
    // 2. CONSTANTS
    // =========================================================================

    var MYTHOLOGY_SECTIONS = [
        { 
            id: 'creation', 
            label: 'Creation Story', 
            icon: 'STAR_4',
            placeholder: 'How did the world begin? Describe the creation myth of this culture...',
            rows: 4,
            hint: 'The origin story of the world and humanity'
        },
        { 
            id: 'afterlife', 
            label: 'Afterlife Beliefs', 
            icon: 'CIRCLE_DOT',
            placeholder: 'What happens after death? Describe the journey of the soul...',
            rows: 4,
            hint: 'Beliefs about what happens to the soul after death'
        },
        { 
            id: 'cosmology', 
            label: 'Cosmology', 
            icon: 'WORLD',
            placeholder: 'How is the universe structured? Describe the cosmic order...',
            rows: 3,
            hint: 'The structure of the universe and the relationship between realms'
        }
    ];

    var MYTHOLOGY_LIST_SECTIONS = [
        {
            id: 'keyDeities',
            label: 'Key Deities',
            icon: 'CROWN',
            placeholder: 'Odin, Thor, Freya',
            hint: 'Major gods and goddesses worshipped by this culture'
        },
        {
            id: 'keyEvents',
            label: 'Key Events',
            icon: 'TIMELINE',
            placeholder: 'The Creation, The Great Flood, The War of the Gods',
            hint: 'Important mythological events and stories'
        },
        {
            id: 'symbols',
            label: 'Symbols',
            icon: 'STAR',
            placeholder: 'Mjolnir, Valknut, Yggdrasil',
            hint: 'Sacred symbols and their meanings'
        },
        {
            id: 'themes',
            label: 'Themes',
            icon: 'BOOK',
            placeholder: 'Honor, Courage, Fate, Loyalty',
            hint: 'Core values and recurring themes in mythology'
        }
    ];

    // =========================================================================
    // 3. RENDER FUNCTIONS
    // =========================================================================

    /**
     * Render a text section
     */
    function renderTextSection(section, value) {
        var icon = _getIcon(section.icon) || '◈';
        
        return '<div class="mythology-section" data-section="' + section.id + '" style="' +
            'background:var(--bg2);border-radius:6px;padding:12px;margin-bottom:12px;' +
            'border:1px solid var(--border);' +
            '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<div>' +
            '<span style="font-size:0.75rem;font-weight:bold;">' + icon + ' ' + _escapeHtml(section.label) + '</span>' +
            '<span style="font-size:0.55rem;color:var(--dim);margin-left:8px;">' + _escapeHtml(section.hint || '') + '</span>' +
            '</div>' +
            '<span style="font-size:0.55rem;color:var(--dim);">' + (value ? value.split(/\s+/).filter(function(w) { return w; }).length : 0) + ' words</span>' +
            '</div>' +
            '<textarea id="myth_' + section.id + '" rows="' + (section.rows || 4) + '" ' +
            'placeholder="' + _escapeHtml(section.placeholder || '') + '" ' +
            'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;' +
            'font-size:0.7rem;resize:vertical;' +
            '">' + _escapeHtml(value || '') + '</textarea>' +
            '</div>';
    }

    /**
     * Render a list section with tag input
     */
    function renderListSection(section, items) {
        var icon = _getIcon(section.icon) || '✦';
        items = items || [];
        
        var tagsHtml = '';
        for (var i = 0; i < items.length; i++) {
            tagsHtml += renderTag(items[i]);
        }

        return '<div class="mythology-section" data-section="' + section.id + '" style="' +
            'background:var(--bg2);border-radius:6px;padding:12px;margin-bottom:12px;' +
            'border:1px solid var(--border);' +
            '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<div>' +
            '<span style="font-size:0.75rem;font-weight:bold;">' + icon + ' ' + _escapeHtml(section.label) + '</span>' +
            '<span style="font-size:0.55rem;color:var(--dim);margin-left:8px;">' + _escapeHtml(section.hint || '') + '</span>' +
            '</div>' +
            '<span style="font-size:0.55rem;color:var(--dim);">' + items.length + ' items</span>' +
            '</div>' +
            '<div class="mythology-tag-container" data-section="' + section.id + '" style="' +
            'display:flex;flex-wrap:wrap;gap:4px;padding:4px;' +
            'background:var(--bg);border:1px solid var(--border);border-radius:4px;' +
            'min-height:40px;' +
            '">' +
            tagsHtml +
            '</div>' +
            '<div style="display:flex;gap:4px;margin-top:6px;">' +
            '<input type="text" class="mythology-tag-input" data-section="' + section.id + '" ' +
            'placeholder="Add ' + _escapeHtml(section.label) + '..." ' +
            'style="flex:1;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;' +
            'font-size:0.65rem;' +
            '" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.parentNode.querySelector(\'.mythology-add-tag\').click();}">' +
            '<button class="mythology-add-tag" data-section="' + section.id + '" style="' +
            'padding:4px 12px;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;' +
            'cursor:pointer;font-size:0.65rem;' +
            '">Add</button>' +
            '</div>' +
            '</div>';
    }

    /**
     * Render a single tag
     */
    function renderTag(value) {
        return '<span class="mythology-tag" style="' +
            'display:inline-flex;align-items:center;gap:4px;' +
            'background:var(--accent-dim);padding:2px 8px;border-radius:12px;' +
            'font-size:0.6rem;border:1px solid var(--accent);' +
            '">' +
            _escapeHtml(value) +
            '<button class="mythology-remove-tag" style="' +
            'background:transparent;border:none;color:var(--dim);cursor:pointer;' +
            'font-size:0.6rem;padding:0 2px;' +
            '" title="Remove">✕</button>' +
            '</span>';
    }

    /**
     * Render stats summary
     */
    function renderMythologyStats(culture) {
        var m = culture.mythology || {};
        var stats = [];

        // Count deities
        var deities = m.keyDeities || [];
        if (deities.length > 0) stats.push(deities.length + ' deities');

        // Count events
        var events = m.keyEvents || [];
        if (events.length > 0) stats.push(events.length + ' events');

        // Count symbols
        var symbols = m.symbols || [];
        if (symbols.length > 0) stats.push(symbols.length + ' symbols');

        // Count themes
        var themes = m.themes || [];
        if (themes.length > 0) stats.push(themes.length + ' themes');

        // Word count
        var totalWords = 0;
        var fields = ['creation', 'afterlife', 'cosmology'];
        for (var i = 0; i < fields.length; i++) {
            var text = m[fields[i]] || '';
            totalWords += text.split(/\s+/).filter(function(w) { return w; }).length;
        }
        if (totalWords > 0) stats.push(totalWords + ' words');

        var statsText = stats.length > 0 ? stats.join(' · ') : 'No mythology defined yet';

        return '<div style="' +
            'background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;' +
            'display:flex;justify-content:space-between;align-items:center;' +
            'font-size:0.6rem;color:var(--dim);' +
            '">' +
            '<span>' + _getIcon('BOOK') + ' Mythology Overview</span>' +
            '<span>' + statsText + '</span>' +
            '</div>';
    }

    // =========================================================================
    // 4. MAIN TAB RENDERER
    // =========================================================================

    function renderMythologyTab(container, culture) {
        if (!culture) {
            container.innerHTML = '<div style="padding:20px;color:var(--dim);">No culture loaded</div>';
            return;
        }

        var m = culture.mythology || {};

        var html = '<div class="culture-mythology-tab" style="padding:4px;">' +
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;font-size:0.65rem;color:var(--dim);">' +
            'Define the mythology, beliefs, and sacred traditions of this culture. ' +
            'These are purely flavor text and have no gameplay impact.' +
            '</div>';

        // Stats
        html += renderMythologyStats(culture);

        // Text sections
        html += '<div class="mythology-text-sections" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
        for (var i = 0; i < MYTHOLOGY_SECTIONS.length; i++) {
            var section = MYTHOLOGY_SECTIONS[i];
            var value = m[section.id] || '';
            html += renderTextSection(section, value);
        }
        html += '</div>';

        // List sections
        html += '<div class="mythology-list-sections" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">';
        for (var i = 0; i < MYTHOLOGY_LIST_SECTIONS.length; i++) {
            var section = MYTHOLOGY_LIST_SECTIONS[i];
            var items = m[section.id] || [];
            html += renderListSection(section, items);
        }
        html += '</div>';

        // Example templates
        html += renderTemplateSuggestions(culture);

        html += '<div style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);text-align:center;">' +
            'Press Enter to add items to lists. All mythology is flavor text only.' +
            '</div>' +
            '</div>';

        container.innerHTML = html;

        // Attach event listeners after DOM is ready
        setTimeout(function() {
            attachEventListeners(container);
        }, 50);
    }

    // =========================================================================
    // 5. TEMPLATE SUGGESTIONS
    // =========================================================================

    function renderTemplateSuggestions(culture) {
        var templates = [
            { 
                name: 'Nordic', 
                icon: '✦',
                onClick: 'fillNordicMythology()'
            },
            { 
                name: 'Mediterranean', 
                icon: '★',
                onClick: 'fillMediterraneanMythology()'
            },
            { 
                name: 'Celtic', 
                icon: '◈',
                onClick: 'fillCelticMythology()'
            },
            { 
                name: 'Desert', 
                icon: '☀',
                onClick: 'fillDesertMythology()'
            }
        ];

        var html = '<div style="margin-top:12px;padding:8px;background:var(--bg2);border-radius:6px;border:1px dashed var(--border);">' +
            '<div style="font-size:0.6rem;color:var(--dim);margin-bottom:6px;">Quick Templates:</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">';

        for (var i = 0; i < templates.length; i++) {
            var t = templates[i];
            html += '<button class="template-btn" data-template="' + t.name.toLowerCase() + '" style="' +
                'padding:4px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;' +
                'cursor:pointer;font-size:0.6rem;' +
                '">' + t.icon + ' ' + t.name +
                '</button>';
        }

        html += '</div></div>';
        return html;
    }

    // =========================================================================
    // 6. EVENT HANDLERS
    // =========================================================================

    function attachEventListeners(container) {
        // --- List section: Add tag buttons ---
        var addBtns = container.querySelectorAll('.mythology-add-tag');
        for (var i = 0; i < addBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var section = this.dataset.section;
                    var container = this.closest('.mythology-section').querySelector('.mythology-tag-container');
                    var input = this.closest('.mythology-section').querySelector('.mythology-tag-input');

                    if (input && input.value.trim()) {
                        addTag(container, input.value.trim());
                        input.value = '';
                        input.focus();
                        updateSectionCount(container);
                    }
                });
            })(addBtns[i]);
        }

        // --- List section: Remove tag buttons ---
        var removeBtns = container.querySelectorAll('.mythology-remove-tag');
        for (var i = 0; i < removeBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var tag = this.closest('.mythology-tag');
                    var container = this.closest('.mythology-tag-container');
                    if (tag) {
                        tag.remove();
                        updateSectionCount(container);
                    }
                });
            })(removeBtns[i]);
        }

        // --- Text sections: Word count updates ---
        var textAreas = container.querySelectorAll('.mythology-section textarea');
        for (var i = 0; i < textAreas.length; i++) {
            (function(area) {
                area.addEventListener('input', function() {
                    var section = this.closest('.mythology-section');
                    var countEl = section.querySelector('.mythology-section > div:first-child span:last-child');
                    if (countEl) {
                        var words = this.value.split(/\s+/).filter(function(w) { return w; }).length;
                        countEl.textContent = words + ' words';
                    }
                });
            })(textAreas[i]);
        }

        // --- Template buttons ---
        var templateBtns = container.querySelectorAll('.template-btn');
        for (var i = 0; i < templateBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var template = this.dataset.template;
                    var templateData = getMythologyTemplate(template);
                    if (templateData) {
                        if (confirm('This will replace all mythology data for this culture. Continue?')) {
                            fillMythologyFromTemplate(container, templateData);
                            _showToast('Loaded ' + template + ' mythology template', 'success');
                        }
                    }
                });
            })(templateBtns[i]);
        }
    }

    // =========================================================================
    // 7. TAG HELPERS
    // =========================================================================

    function addTag(container, value) {
        // Check for duplicates
        var existing = container.querySelectorAll('.mythology-tag');
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].textContent.trim() === value) {
                _showToast('Duplicate item: "' + value + '" already exists', 'warning');
                return false;
            }
        }

        var tag = document.createElement('span');
        tag.className = 'mythology-tag';
        tag.style.cssText = 'display:inline-flex;align-items:center;gap:4px;' +
            'background:var(--accent-dim);padding:2px 8px;border-radius:12px;' +
            'font-size:0.6rem;border:1px solid var(--accent);';
        tag.innerHTML = _escapeHtml(value) + 
            '<button class="mythology-remove-tag" style="' +
            'background:transparent;border:none;color:var(--dim);cursor:pointer;' +
            'font-size:0.6rem;padding:0 2px;' +
            '" title="Remove">✕</button>';

        container.appendChild(tag);

        // Attach remove handler
        var removeBtn = tag.querySelector('.mythology-remove-tag');
        if (removeBtn) {
            removeBtn.addEventListener('click', function() {
                var tagEl = this.closest('.mythology-tag');
                var containerEl = this.closest('.mythology-tag-container');
                if (tagEl) {
                    tagEl.remove();
                    updateSectionCount(containerEl);
                }
            });
        }

        return true;
    }

    function updateSectionCount(container) {
        var section = container.closest('.mythology-section');
        if (section) {
            var countEl = section.querySelector('.mythology-section > div:first-child span:last-child');
            if (countEl) {
                var count = container.querySelectorAll('.mythology-tag').length;
                countEl.textContent = count + ' items';
            }
        }
    }

    // =========================================================================
    // 8. TEMPLATES
    // =========================================================================

    function getMythologyTemplate(name) {
        var templates = {
            'nordic': {
                creation: 'In the beginning, there was only the great void of Ginnungagap. To the north lay the frozen realm of Niflheim, and to the south the fiery realm of Muspelheim. When fire and ice met, they created the first giant, Ymir, and from his body, the gods shaped the world. Odin and his brothers slew Ymir and used his flesh to form the earth, his blood to make the seas, his bones to create the mountains, and his skull to form the sky. The gods then took sparks from Muspelheim to create the stars and placed them in the sky to light the world.',
                afterlife: 'The brave who die in battle are carried by the Valkyries to Valhalla, Odin\'s great hall in Asgard. There they feast and fight until Ragnarok, preparing for the final battle. Those who die of sickness or old age go to Hel, a cold and misty realm ruled by the goddess Hel. The most noble and virtuous may find their way to Folkvangr, Freya\'s meadow, where they live in peace and beauty.',
                cosmology: 'The World Tree Yggdrasil connects the nine realms. Asgard, home of the Aesir gods, sits at the top. Midgard, the world of humans, lies in the middle, surrounded by a great ocean. Around it is Jotunheim, the land of the giants. Below is Hel, the realm of the dead. The tree is tended by the Norns, who weave the fate of all beings.',
                keyDeities: ['Odin', 'Thor', 'Freya', 'Loki', 'Tyr', 'Balder', 'Heimdall', 'Frigg'],
                keyEvents: ['The creation of the world from Ymir\'s body', 'The Aesir-Vanir war', 'The binding of Fenrir', 'The death of Balder', 'Ragnarok'],
                symbols: ['Mjolnir (Thor\'s hammer)', 'The Valknut', 'Yggdrasil', 'Runes', 'The World Serpent', 'The Sun and Moon'],
                themes: ['Honor', 'Courage', 'Fate', 'Loyalty', 'The cycle of seasons', 'The power of sacrifice']
            },
            'mediterranean': {
                creation: 'In the beginning, Chaos existed, formless and void. From Chaos emerged Gaia, the Earth, and Uranus, the Sky. Together they birthed the Titans, the first gods. Gaia also gave birth to the mountains, the seas, and the starry heavens. The youngest Titan, Cronus, overthrew his father Uranus and ruled during the Golden Age. But Cronus was warned that one of his children would overthrow him, so he swallowed each of his offspring. His wife Rhea hid their youngest child, Zeus, who later freed his siblings and defeated the Titans, establishing the rule of the Olympian gods.',
                afterlife: 'The souls of the dead cross the river Styx, ferried by Charon, to enter the Underworld, ruled by Hades. The righteous are sent to Elysium, a place of eternal happiness and beauty. The wicked are punished in Tartarus, the deepest pit of the Underworld. Those who lived ordinary lives drift in the Asphodel Meadows, a gray and forgetful existence. Heroes and the virtuous may achieve immortality among the stars.',
                cosmology: 'The world is a flat disc, surrounded by the river Oceanus. The heavens are a great dome held up by Atlas. The sun is driven across the sky in a chariot by Helios, and the moon by Selene. The Underworld lies beneath the earth, reached through caves and deep chasms. Mount Olympus is the home of the gods, rising above the clouds.',
                keyDeities: ['Zeus', 'Hera', 'Poseidon', 'Athena', 'Apollo', 'Artemis', 'Aphrodite', 'Ares', 'Demeter', 'Hephaestus'],
                keyEvents: ['The Titanomachy', 'The Trojan War', 'The Labors of Heracles', 'The Odyssey', 'The Twelve Labors', 'The Argonautica'],
                symbols: ['The laurel wreath', 'The owl (wisdom)', 'The trident', 'The thunderbolt', 'The lyre', 'The olive branch'],
                themes: ['Glory', 'Wisdom', 'Beauty', 'Heroism', 'The favor of the gods', 'Hubris and downfall']
            },
            'celtic': {
                creation: 'In the time before time, the world was formless, covered in mist and darkness. The first gods, the Tuatha Dé Danann, came from the four cities in the west: Falias, Gorias, Murias, and Findias. They brought with them four treasures: the Sword of Nuada, the Spear of Lugh, the Cauldron of Dagda, and the Lia Fáil, the Stone of Destiny. They fought the Fir Bolg for the land and then faced the Fomorians, dark giants from the sea. After great battles, they established their rule and shaped the land with their magic.',
                afterlife: 'The souls of the departed journey to the Otherworld, a realm of eternal youth and feasting. It is reached through sacred groves, burial mounds, or across the sea. The Otherworld is home to the gods of the Tuatha Dé Danann and is a place of endless summer, where there is no sickness, no age, and no death. The souls of heroes and the virtuous dwell there in peace, feasting and hunting with the gods.',
                cosmology: 'The world is a disc surrounded by the endless sea. Beyond the sea lies the Otherworld, reached through sacred groves, burial mounds, and misty islands. The sun and moon are deities who travel across the sky. The land is alive with spirits, and every spring and hill has its own guardian. The cycle of seasons is a reflection of the eternal dance between light and darkness.',
                keyDeities: ['The Morrigan', 'Lugh', 'Brigid', 'Cernunnos', 'Dagda', 'Nuada', 'Aengus', 'Danu'],
                keyEvents: ['The coming of the Tuatha Dé Danann', 'The battle of Moytura', 'The adventures of Cú Chulainn', 'The voyage of Bran', 'The cattle raid of Cooley'],
                symbols: ['The triskelion', 'The Celtic cross', 'The harp', 'The oak tree', 'The spiral', 'The knot'],
                themes: ['Honor', 'Poetry', 'War', 'The cycle of seasons', 'The bond with nature', 'The power of music']
            },
            'desert': {
                creation: 'From the sands of time, the first people emerged, guided by the stars and the wisdom of the ancestors. In the beginning, there was only the vast desert, endless and silent. The Sun God rose from the east, bringing light and warmth to the world. The Moon Goddess followed, bringing coolness and dreams. Together, they created the first oasis, and from its waters, all life was born. The first tribe was led by a wise elder who knew the language of the stars and could read the signs of the desert.',
                afterlife: 'The souls of the departed join the ancestors in the eternal desert, where they guide the living from beyond. The ancestors are ever-present, speaking through dreams and omens. They gather at the great oasis of the spirits, where they feast and watch over their descendants. Those who lived honorably become stars in the sky, guiding travelers and protecting their tribes. Those who lived dishonorably wander the desert alone, never finding rest.',
                cosmology: 'The world is a vast desert, with the sky as a great tent. The stars are the campfires of the ancestors, and the Milky Way is the path they walk. The sun travels across the sky in a chariot of fire, while the moon follows in a silver boat. The desert winds carry the voices of the spirits, and the oases are sacred places where the veil between worlds is thin.',
                keyDeities: ['The Sun God', 'The Moon Goddess', 'The Storm King', 'The Earth Mother', 'The Sky Father', 'The Wind Spirit'],
                keyEvents: ['The journey of the first tribe', 'The great drought', 'The alliance of the tribes', 'The discovery of the sacred oasis', 'The war of the stars'],
                symbols: ['The crescent moon', 'The star', 'The horse', 'The sword', 'The palm tree', 'The sand dune'],
                themes: ['Hospitality', 'Honor', 'Poetry', 'Courage', 'The wisdom of the desert', 'The power of faith']
            }
        };

        return templates[name] || null;
    }

    function fillMythologyFromTemplate(container, template) {
        // Fill text sections
        for (var i = 0; i < MYTHOLOGY_SECTIONS.length; i++) {
            var section = MYTHOLOGY_SECTIONS[i];
            var textarea = document.getElementById('myth_' + section.id);
            if (textarea && template[section.id] !== undefined) {
                textarea.value = template[section.id];
                // Trigger word count update
                var event = new Event('input');
                textarea.dispatchEvent(event);
            }
        }

        // Fill list sections
        for (var i = 0; i < MYTHOLOGY_LIST_SECTIONS.length; i++) {
            var section = MYTHOLOGY_LIST_SECTIONS[i];
            var containerEl = container.querySelector('.mythology-tag-container[data-section="' + section.id + '"]');
            if (containerEl && template[section.id] !== undefined) {
                // Clear existing tags
                containerEl.innerHTML = '';
                // Add new tags
                var items = template[section.id];
                for (var j = 0; j < items.length; j++) {
                    addTag(containerEl, items[j]);
                }
                updateSectionCount(containerEl);
            }
        }
    }

    // =========================================================================
    // 9. SAVE FUNCTION
    // =========================================================================

    function saveMythologyTab(culture) {
        var mythology = {};

        // Save text sections
        for (var i = 0; i < MYTHOLOGY_SECTIONS.length; i++) {
            var section = MYTHOLOGY_SECTIONS[i];
            var element = document.getElementById('myth_' + section.id);
            if (element) {
                mythology[section.id] = element.value.trim();
            }
        }

        // Save list sections
        for (var i = 0; i < MYTHOLOGY_LIST_SECTIONS.length; i++) {
            var section = MYTHOLOGY_LIST_SECTIONS[i];
            var container = document.querySelector('.mythology-tag-container[data-section="' + section.id + '"]');
            if (container) {
                var tags = container.querySelectorAll('.mythology-tag');
                var items = [];
                for (var j = 0; j < tags.length; j++) {
                    var text = tags[j].textContent.replace('✕', '').trim();
                    if (text) items.push(text);
                }
                mythology[section.id] = items;
            }
        }

        // Merge with existing culture
        var updated = {};
        for (var key in culture) {
            if (culture.hasOwnProperty(key)) {
                updated[key] = culture[key];
            }
        }
        updated.mythology = mythology;

        return updated;
    }

    // =========================================================================
    // 10. VALIDATE FUNCTION
    // =========================================================================

    function validateMythologyTab(culture) {
        var errors = [];
        var warnings = [];

        if (!culture.mythology) {
            warnings.push('No mythology defined');
            return { valid: true, errors: [], warnings: warnings };
        }

        var m = culture.mythology;

        // Check for empty required fields (none are required, but warn if all empty)
        var hasContent = false;
        var fields = ['creation', 'afterlife', 'cosmology'];
        for (var i = 0; i < fields.length; i++) {
            if (m[fields[i]] && m[fields[i]].trim().length > 10) {
                hasContent = true;
                break;
            }
        }

        var listFields = ['keyDeities', 'keyEvents', 'symbols', 'themes'];
        for (var i = 0; i < listFields.length; i++) {
            if (m[listFields[i]] && m[listFields[i]].length > 0) {
                hasContent = true;
                break;
            }
        }

        if (!hasContent) {
            warnings.push('Mythology is mostly empty - consider adding some flavor text');
        }

        // Check for duplicate deities
        if (m.keyDeities) {
            var seen = {};
            for (var i = 0; i < m.keyDeities.length; i++) {
                var name = m.keyDeities[i].trim();
                if (name && seen[name]) {
                    errors.push('Duplicate deity: "' + name + '"');
                }
                if (name) {
                    seen[name] = true;
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            warnings: warnings
        };
    }

    // =========================================================================
    // 11. TAB DEFINITION
    // =========================================================================

    var MythologyTab = {
        label: 'Mythology',
        icon: 'BOOK',
        render: renderMythologyTab,
        save: saveMythologyTab,
        validate: validateMythologyTab
    };

    // =========================================================================
    // 12. REGISTER FUNCTION
    // =========================================================================

    function registerMythologyTab() {
        if (typeof window.CultureEditorTabs === 'undefined') {
            console.warn('[MythologyTab] CultureEditorTabs not available, tab not registered');
            return false;
        }

        var result = window.CultureEditorTabs.registerTab('mythology', MythologyTab);
        if (result) {
            console.log('[MythologyTab] Registered mythology tab successfully');
        }
        return result;
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.MythologyTab = MythologyTab;
    window.registerMythologyTab = registerMythologyTab;

    // Auto-register if CultureEditorTabs is available
    if (typeof window.CultureEditorTabs !== 'undefined') {
        registerMythologyTab();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            MythologyTab: MythologyTab,
            registerMythologyTab: registerMythologyTab
        };
    }

    console.log('[MythologyTab] Loaded successfully');

})();