/**
 * =============================================================================
 * STILL WATERS - CULTURE NAMES TAB (js/tabs/culture-names-tab.js)
 * =============================================================================
 * 
 * A modular tab for managing culture-specific names and surname rules.
 * 
 * FEATURES:
 *   - Character name lists (male, female, surnames)
 *   - Import/export name lists
 *   - Surname rules (family, patronymic, chain)
 *   - Name generation preview
 *   - Surname history management
 *   - Add/remove names manually
 *   - Country-based rules inheritance
 * 
 * DEPENDENCIES:
 *   - CultureEditorTabs (js/culture/culture-editor-tabs.js)
 *   - NameState, NameQueries, NameCommands, NameRules (js/core/)
 *   - modals-core.js (for _escapeHtml, _getIcon, _showToast)
 * 
 * ICON POLICY: Uses icons.js via _getIcon() - NO EMOJIS
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

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
        } else if (typeof window._confirmDialog === 'function') {
            window._confirmDialog(message, title, onConfirm);
        } else if (confirm(message)) {
            onConfirm();
        }
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getLocationTypes() {
        return typeof window.getLocationTypes === 'function' ? window.getLocationTypes() : [];
    }

    function _getLocationTypePriority(typeId) {
        if (typeof window.getLocationTypePriority === 'function') {
            return window.getLocationTypePriority(typeId);
        }
        return 5;
    }

    // =========================================================================
    // 2. STATE
    // =========================================================================

    var namesTabState = {
        searchTerm: '',
        expandedSections: {
            character_names: true,
            surname_rules: true,
            generation_preview: true
        },
        _isRendering: false,
        _containerId: null,
        _handlersAttached: false
    };

    // =========================================================================
    // 3. HELPER FUNCTIONS
    // =========================================================================

    function getCountryIdFromCulture(culture) {
        // If culture has a location association, get country from first location
        if (culture.locations && culture.locations.length > 0) {
            var place = _getPlaceById(culture.locations[0]);
            if (place) {
                // Walk up to find country (type priority 1)
                var current = place;
                var visited = new Set();
                while (current && !visited.has(current.id)) {
                    visited.add(current.id);
                    var priority = _getLocationTypePriority(current.typeId);
                    if (priority === 1) {
                        return current.id;
                    }
                    if (!current.parentId) break;
                    current = _getPlaceById(current.parentId);
                }
                return place.id; // Fallback to the location itself
            }
        }
        return null;
    }

    function getCountryNameFromId(countryId) {
        if (!countryId) return 'Unknown';
        var place = _getPlaceById(countryId);
        return place ? place.displayName : countryId;
    }

    function filterNames(names, search) {
        if (!search) return names;
        var lower = search.toLowerCase();
        return names.filter(function(n) { return n.toLowerCase().indexOf(lower) !== -1; });
    }

    function getCountryNameLists(countryId) {
        if (typeof window.NameState !== 'undefined' && typeof window.NameState.getNameList === 'function') {
            return window.NameState.getNameList(countryId);
        }
        // Fallback
        var lists = typeof window.getNameLists === 'function' ? window.getNameLists() : {};
        if (!lists[countryId]) {
            lists[countryId] = { male: [], female: [], surnames: [] };
        }
        return lists[countryId];
    }

    function getCountrySurnameRules(countryId) {
        if (typeof window.NameQueries !== 'undefined' && typeof window.NameQueries.getCountrySurnameRules === 'function') {
            return window.NameQueries.getCountrySurnameRules(countryId);
        }
        return null;
    }

    function setCountrySurnameRules(countryId, rules) {
        if (typeof window.NameQueries !== 'undefined' && typeof window.NameQueries.getCountrySurnameRules === 'function') {
            // Use the setter through masterData
            var lists = typeof window.getNameLists === 'function' ? window.getNameLists() : {};
            if (!lists[countryId]) {
                lists[countryId] = { male: [], female: [], surnames: [] };
            }
            lists[countryId].rules = rules;
            if (typeof window.masterData !== 'undefined' && window.masterData.data) {
                window.masterData.data.nameLists = lists;
                if (typeof window.saveMasterData === 'function') window.saveMasterData();
            }
            if (typeof window.NameState !== 'undefined' && typeof window.NameState.invalidateCache === 'function') {
                window.NameState.invalidateCache();
            }
            return true;
        }
        return false;
    }

    function getCountryCityParts(countryId) {
        if (typeof window.getCityNameParts === 'function') {
            var parts = window.getCityNameParts();
            if (!parts[countryId]) {
                parts[countryId] = { prefixes: [], roots: [], suffixes: [] };
            }
            return parts[countryId];
        }
        return { prefixes: [], roots: [], suffixes: [] };
    }

    // =========================================================================
    // 4. RENDER FUNCTIONS
    // =========================================================================

    function renderNamesTab(container, culture) {
        if (namesTabState._isRendering) return;
        namesTabState._isRendering = true;

        if (!culture) {
            container.innerHTML = '<div style="padding:20px;color:var(--dim);">No culture loaded</div>';
            namesTabState._isRendering = false;
            return;
        }

        var countryId = getCountryIdFromCulture(culture);
        var countryName = countryId ? getCountryNameFromId(countryId) : 'None (no location associated)';
        var countryDisplay = countryId ? getCountryNameFromId(countryId) : 'No country found';

        var personIcon = _getIcon('PERSON');
        var locationIcon = _getIcon('LOCATION');
        var bookIcon = _getIcon('BOOK');
        var gearIcon = _getIcon('GEAR');
        var refreshIcon = _getIcon('REFRESH');
        var warningIcon = _getIcon('WARNING');
        var flagIcon = _getIcon('FLAG');

        var search = namesTabState.searchTerm || '';
        var isCharacterExpanded = namesTabState.expandedSections.character_names !== false;
        var isSurnameRulesExpanded = namesTabState.expandedSections.surname_rules !== false;
        var isGenerationExpanded = namesTabState.expandedSections.generation_preview !== false;

        var html = 
            '<div class="culture-names-tab" style="padding:4px;">' +
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;font-size:0.65rem;color:var(--dim);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">' +
            '<span>' + locationIcon + ' Country: <strong>' + _escapeHtml(countryDisplay) + '</strong></span>' +
            (countryId ? '<span style="font-size:0.55rem;color:var(--success);">' + flagIcon + ' Names loaded for this country</span>' :
                '<span style="font-size:0.55rem;color:var(--warn);">' + warningIcon + ' No country found - add a location association first</span>') +
            '</div>' +

            // Search
            '<div style="padding:0 4px 8px 4px;">' +
            '<input type="text" id="namesSearchInput" placeholder="Filter names..." value="' + _escapeHtml(search) + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.6rem;">' +
            '</div>' +

            (countryId ? renderAllSections(countryId, culture, search) :
                '<div class="empty-state" style="padding:40px;text-align:center;color:var(--dim);">' +
                    locationIcon + ' This culture has no location association.<br>' +
                    '<span style="font-size:0.6rem;">Add a location in the Details tab to enable name management</span>' +
                '</div>') +

            '</div>';

        container.innerHTML = html;

        if (countryId) {
            attachNamesTabHandlers(container, countryId, culture);
        }

        namesTabState._isRendering = false;
    }

    // =========================================================================
    // 5. RENDER ALL SECTIONS
    // =========================================================================

    function renderAllSections(countryId, culture, search) {
        var isCharacterExpanded = namesTabState.expandedSections.character_names !== false;
        var isSurnameRulesExpanded = namesTabState.expandedSections.surname_rules !== false;
        var isGenerationExpanded = namesTabState.expandedSections.generation_preview !== false;

        var personIcon = _getIcon('PERSON');
        var linkIcon = _getIcon('LINK');
        var gearIcon = _getIcon('GEAR');
        var starIcon = _getIcon('STAR');

        return (
            '<div style="display:flex;flex-direction:column;gap:12px;">' +

            renderCollapsibleSection(
                'character_names',
                personIcon + ' Character Names',
                renderCharacterNamesContent(countryId, search),
                isCharacterExpanded
            ) +

            renderCollapsibleSection(
                'surname_rules',
                linkIcon + ' Surname Rules',
                renderSurnameRulesContent(countryId, culture),
                isSurnameRulesExpanded
            ) +

            renderCollapsibleSection(
                'generation_preview',
                starIcon + ' Name Generation Preview',
                renderGenerationPreviewContent(countryId),
                isGenerationExpanded
            ) +

            '</div>'
        );
    }

    function renderCollapsibleSection(sectionKey, title, content, isExpanded) {
        var icon = isExpanded ? '▼' : '▶';
        return (
            '<div class="names-section" data-section="' + sectionKey + '" style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:8px;">' +
            '<div class="names-section-header" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:pointer;background:var(--bg3);">' +
            '<span style="font-size:0.6rem;font-weight:bold;color:var(--accent);display:inline-flex;align-items:center;gap:6px;">' + title + '</span>' +
            '<span style="font-size:0.5rem;color:var(--dim);">' + icon + '</span>' +
            '</div>' +
            '<div class="names-section-content" style="display:' + (isExpanded ? 'block' : 'none') + ';padding:12px;">' +
            content +
            '</div></div>'
        );
    }

    // =========================================================================
    // 6. CHARACTER NAMES CONTENT
    // =========================================================================

    function renderCharacterNamesContent(countryId, search) {
        var nameList = getCountryNameLists(countryId);
        var maleNames = filterNames(nameList.male || [], search);
        var femaleNames = filterNames(nameList.female || [], search);
        var surnames = filterNames(nameList.surnames || [], search);

        var personIcon = _getIcon('PERSON');
        var bookIcon = _getIcon('BOOK');
        var checkIcon = _getIcon('CHECK_SIMPLE');
        var crossIcon = _getIcon('X_HEAVY');
        var gearIcon = _getIcon('GEAR');

        return (
            '<div style="display:flex;flex-direction:column;gap:8px;">' +
            '<div style="display:flex;gap:16px;font-size:0.55rem;color:var(--dim);padding:4px 0;">' +
            '<span style="display:inline-flex;align-items:center;gap:4px;">' + personIcon + ' ' + maleNames.length + ' male</span>' +
            '<span style="display:inline-flex;align-items:center;gap:4px;">' + personIcon + ' ' + femaleNames.length + ' female</span>' +
            '<span style="display:inline-flex;align-items:center;gap:4px;">' + bookIcon + ' ' + surnames.length + ' surnames</span>' +
            '</div>' +

            renderNameTagSection('male', 'Male Names', maleNames, countryId) +
            renderNameTagSection('female', 'Female Names', femaleNames, countryId) +
            renderNameTagSection('surnames', 'Surnames', surnames, countryId) +

            '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--border);">' +
            '<button class="names-import-btn btn small" data-type="male" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + gearIcon + ' Import Male</button>' +
            '<button class="names-import-btn btn small" data-type="female" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + gearIcon + ' Import Female</button>' +
            '<button class="names-import-btn btn small" data-type="surnames" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + gearIcon + ' Import Surnames</button>' +
            '<button id="namesAddManualBtn" class="btn small" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + checkIcon + ' Add</button>' +
            '<button id="namesClearAllBtn" class="btn small danger" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;background:var(--danger);border:1px solid var(--danger);border-radius:4px;cursor:pointer;color:white;">' + crossIcon + ' Clear All</button>' +
            '</div>' +
            '</div>'
        );
    }

    function renderNameTagSection(type, label, names, countryId) {
        var crossIcon = _getIcon('X_HEAVY');

        return (
            '<div style="background:var(--bg);border:1px solid var(--border2);border-radius:6px;padding:8px;margin-bottom:6px;">' +
            '<div style="font-size:0.55rem;font-weight:bold;color:var(--accent);margin-bottom:4px;">' + label + ' (' + names.length + ')</div>' +
            (names.length > 0 ?
                '<div style="display:flex;flex-wrap:wrap;gap:4px;max-height:150px;overflow-y:auto;">' +
                names.map(function(n) {
                    return '<span class="name-tag" style="background:var(--bg2);padding:2px 8px;border-radius:12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border);">' +
                        _escapeHtml(n) +
                        '<button class="names-delete-btn" data-type="' + type + '" data-name="' + _escapeHtml(n) + '" style="background:none;border:none;color:var(--danger-lt);cursor:pointer;font-size:0.5rem;padding:0 2px;display:inline-flex;align-items:center;">' + crossIcon + '</button>' +
                        '</span>';
                }).join('') +
                '</div>' :
                '<div style="color:var(--dim);font-size:0.55rem;padding:8px;text-align:center;">No ' + label.toLowerCase() + ' yet. Import a file or add manually.</div>'
            ) +
            '</div>'
        );
    }

    // =========================================================================
    // 7. SURNAME RULES CONTENT
    // =========================================================================

    function renderSurnameRulesContent(countryId, culture) {
        var rules = getCountrySurnameRules(countryId);
        var checkIcon = _getIcon('CHECK_SIMPLE');
        var crossIcon = _getIcon('X_HEAVY');
        var linkIcon = _getIcon('LINK');
        var treeIcon = _getIcon('FAMILY_TREE');
        var gearIcon = _getIcon('GEAR');
        var bookIcon = _getIcon('BOOK');
        var saveIcon = _getIcon('CHECK_SIMPLE');
        var flagIcon = _getIcon('FLAG');

        if (!rules) {
            rules = {
                type: 'family',
                family: {
                    source: 'both',
                    order: 'father_first',
                    count: 1,
                    position: 'first',
                    connector: 'space',
                    customConnector: ''
                },
                patronymic: {
                    source: 'father',
                    malePrefix: 'Mac',
                    maleSuffix: 'son',
                    femalePrefix: 'Nic',
                    femaleSuffix: 'dottir',
                    usePrefix: true,
                    useSuffix: true
                },
                chain: {
                    source: 'firstname',
                    depth: 1,
                    order: ['father', 'mother'],
                    connector: 'space',
                    customConnector: ''
                }
            };
        }

        var typeOptions = {
            'family': 'Family Surname (inherit from parents)',
            'patronymic': 'Patronymic/Matronymic (from parent\'s first name)',
            'chain': 'Chain (multiple generations)'
        };

        var sourceOptions = {
            'father': 'Father only',
            'mother': 'Mother only',
            'both': 'Both parents'
        };

        var orderOptions = {
            'father_first': 'Father first, then Mother',
            'mother_first': 'Mother first, then Father'
        };

        var positionOptions = {
            'first': 'First surname',
            'last': 'Last surname'
        };

        var countOptions = {
            '1': '1 surname',
            '2': '2 surnames'
        };

        var connectorOptions = {
            'space': 'Space (e.g., "Smith Jones")',
            'hyphen': 'Hyphen (e.g., "Smith-Jones")',
            'custom': 'Custom'
        };

        var chainSourceOptions = {
            'firstname': 'First names',
            'surname': 'Surnames'
        };

        var depthOptions = {
            '1': '1 generation (parents only)',
            '2': '2 generations (+ grandparents)',
            '3': '3 generations (+ great-grandparents)',
            '4': '4 generations',
            '5': '5 generations'
        };

        var ancestorTypes = [
            { value: 'father', label: 'Father' },
            { value: 'mother', label: 'Mother' },
            { value: 'paternal_grandfather', label: 'Paternal Grandfather' },
            { value: 'paternal_grandmother', label: 'Paternal Grandmother' },
            { value: 'maternal_grandfather', label: 'Maternal Grandfather' },
            { value: 'maternal_grandmother', label: 'Maternal Grandmother' }
        ];

        var currentChainOrder = rules.chain && rules.chain.order ? rules.chain.order : ['father', 'mother'];

        var typeSelectHtml = Object.keys(typeOptions).map(function(key) {
            var selected = rules.type === key ? 'selected' : '';
            return '<option value="' + key + '" ' + selected + '>' + typeOptions[key] + '</option>';
        }).join('');

        var sourceSelectHtml = Object.keys(sourceOptions).map(function(key) {
            var selected = (rules.family && rules.family.source === key) ? 'selected' : '';
            return '<option value="' + key + '" ' + selected + '>' + sourceOptions[key] + '</option>';
        }).join('');

        var orderSelectHtml = Object.keys(orderOptions).map(function(key) {
            var selected = (rules.family && rules.family.order === key) ? 'selected' : '';
            return '<option value="' + key + '" ' + selected + '>' + orderOptions[key] + '</option>';
        }).join('');

        var positionSelectHtml = Object.keys(positionOptions).map(function(key) {
            var selected = (rules.family && rules.family.position === key) ? 'selected' : '';
            return '<option value="' + key + '" ' + selected + '>' + positionOptions[key] + '</option>';
        }).join('');

        var countSelectHtml = Object.keys(countOptions).map(function(key) {
            var selected = (rules.family && rules.family.count === parseInt(key)) ? 'selected' : '';
            return '<option value="' + key + '" ' + selected + '>' + countOptions[key] + '</option>';
        }).join('');

        var connectorSelectHtml = Object.keys(connectorOptions).map(function(key) {
            var selected = (rules.family && rules.family.connector === key) ? 'selected' : '';
            return '<option value="' + key + '" ' + selected + '>' + connectorOptions[key] + '</option>';
        }).join('');

        var chainSourceSelectHtml = Object.keys(chainSourceOptions).map(function(key) {
            var selected = (rules.chain && rules.chain.source === key) ? 'selected' : '';
            return '<option value="' + key + '" ' + selected + '>' + chainSourceOptions[key] + '</option>';
        }).join('');

        var depthSelectHtml = Object.keys(depthOptions).map(function(key) {
            var selected = (rules.chain && rules.chain.depth === parseInt(key)) ? 'selected' : '';
            return '<option value="' + key + '" ' + selected + '>' + depthOptions[key] + '</option>';
        }).join('');

        var patronymicSourceSelectHtml = ['father', 'mother'].map(function(key) {
            var selected = (rules.patronymic && rules.patronymic.source === key) ? 'selected' : '';
            var label = key === 'father' ? 'Father (Patronymic)' : 'Mother (Matronymic)';
            return '<option value="' + key + '" ' + selected + '>' + label + '</option>';
        }).join('');

        var chainOrderHtml = ancestorTypes.map(function(opt) {
            var checked = currentChainOrder.indexOf(opt.value) !== -1 ? 'checked' : '';
            return '<label style="display:flex;align-items:center;gap:4px;font-size:0.5rem;cursor:pointer;padding:2px 4px;">' +
                '<input type="checkbox" class="chain-order-checkbox" value="' + opt.value + '" ' + checked + '>' +
                opt.label +
                '</label>';
        }).join('');

        var showFamily = rules.type === 'family' ? 'block' : 'none';
        var showPatronymic = rules.type === 'patronymic' ? 'block' : 'none';
        var showChain = rules.type === 'chain' ? 'block' : 'none';

        var familyCustomConnector = (rules.family && rules.family.customConnector) || '';
        var chainCustomConnector = (rules.chain && rules.chain.customConnector) || '';
        var showFamilyCustom = (rules.family && rules.family.connector === 'custom') ? 'block' : 'none';
        var showChainCustom = (rules.chain && rules.chain.connector === 'custom') ? 'block' : 'none';

        var patronymicMalePrefix = (rules.patronymic && rules.patronymic.malePrefix) || 'Mac';
        var patronymicMaleSuffix = (rules.patronymic && rules.patronymic.maleSuffix) || 'son';
        var patronymicFemalePrefix = (rules.patronymic && rules.patronymic.femalePrefix) || 'Nic';
        var patronymicFemaleSuffix = (rules.patronymic && rules.patronymic.femaleSuffix) || 'dottir';
        var patronymicUsePrefix = (rules.patronymic && rules.patronymic.usePrefix !== false);
        var patronymicUseSuffix = (rules.patronymic && rules.patronymic.useSuffix !== false);

        return (
            '<div style="display:flex;flex-direction:column;gap:8px;">' +

            '<div style="background:var(--bg);border:1px solid var(--border2);border-radius:6px;padding:8px;border-left:3px solid var(--accent);">' +
            '<div style="font-size:0.5rem;color:var(--accent);display:inline-flex;align-items:center;gap:4px;">' + flagIcon + ' Location Inheritance</div>' +
            '<div style="font-size:0.45rem;color:var(--dim);">Children use the rules from the <strong>mother\'s current location</strong> (where they are born).</div>' +
            '</div>' +

            '<div style="background:var(--bg);border:1px solid var(--border2);border-radius:6px;padding:10px;">' +
            '<label style="font-size:0.55rem;font-weight:bold;color:var(--accent);display:block;margin-bottom:4px;">' + linkIcon + ' Surname Generation Rule</label>' +
            '<select id="surnameRuleType" style="width:100%;padding:6px;font-size:0.55rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            typeSelectHtml +
            '</select>' +
            '<small style="font-size:0.45rem;color:var(--dim);display:block;margin-top:4px;">This rule determines how surnames are generated for this culture</small>' +
            '</div>' +

            '<div id="familyOptions" style="display:' + showFamily + ';background:var(--bg);border:1px solid var(--border2);border-radius:6px;padding:10px;">' +
            '<div style="font-size:0.5rem;font-weight:bold;color:var(--accent);margin-bottom:6px;display:inline-flex;align-items:center;gap:4px;">' + treeIcon + ' Family Surname Inheritance</div>' +

            '<div style="margin-bottom:6px;">' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Source Parent</label>' +
            '<select id="familySource" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            sourceSelectHtml +
            '</select>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">' +
            '<div>' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Order</label>' +
            '<select id="familyOrder" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            orderSelectHtml +
            '</select>' +
            '</div>' +
            '<div>' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Surname Position</label>' +
            '<select id="familyPosition" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            positionSelectHtml +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">' +
            '<div>' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Number of Surnames</label>' +
            '<select id="familyCount" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            countSelectHtml +
            '</select>' +
            '</div>' +
            '<div>' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Connector</label>' +
            '<select id="familyConnector" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            connectorSelectHtml +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div id="familyCustomConnectorInput" style="display:' + showFamilyCustom + ';margin-top:4px;">' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Custom Connector</label>' +
            '<input type="text" id="familyCustomConnector" value="' + _escapeHtml(familyCustomConnector) + '" placeholder="e.g., von der, of the" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            '</div>' +

            '<div style="font-size:0.45rem;color:var(--dim);margin-top:4px;background:var(--bg2);padding:4px 8px;border-radius:4px;">Example: Father "John Smith Jones" + Mother "Jane Fanshaw Hill" → "Smith Fanshaw"</div>' +
            '</div>' +

            '<div id="patronymicOptions" style="display:' + showPatronymic + ';background:var(--bg);border:1px solid var(--border2);border-radius:6px;padding:10px;">' +
            '<div style="font-size:0.5rem;font-weight:bold;color:var(--accent);margin-bottom:6px;display:inline-flex;align-items:center;gap:4px;">' + linkIcon + ' Patronymic/Matronymic Rules</div>' +

            '<div style="margin-bottom:6px;">' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Source Parent</label>' +
            '<select id="patronymicSource" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            patronymicSourceSelectHtml +
            '</select>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">' +
            '<div>' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Male Prefix</label>' +
            '<input type="text" id="patronymicMalePrefix" value="' + _escapeHtml(patronymicMalePrefix) + '" placeholder="e.g., Mac" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            '</div>' +
            '<div>' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Male Suffix</label>' +
            '<input type="text" id="patronymicMaleSuffix" value="' + _escapeHtml(patronymicMaleSuffix) + '" placeholder="e.g., son" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">' +
            '<div>' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Female Prefix</label>' +
            '<input type="text" id="patronymicFemalePrefix" value="' + _escapeHtml(patronymicFemalePrefix) + '" placeholder="e.g., Nic" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            '</div>' +
            '<div>' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Female Suffix</label>' +
            '<input type="text" id="patronymicFemaleSuffix" value="' + _escapeHtml(patronymicFemaleSuffix) + '" placeholder="e.g., dottir" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            '</div>' +
            '</div>' +

            '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:4px;">' +
            '<label style="display:flex;align-items:center;gap:4px;font-size:0.45rem;cursor:pointer;">' +
            '<input type="checkbox" id="patronymicUsePrefix" ' + (patronymicUsePrefix ? 'checked' : '') + '>' +
            'Use Prefix' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:4px;font-size:0.45rem;cursor:pointer;">' +
            '<input type="checkbox" id="patronymicUseSuffix" ' + (patronymicUseSuffix ? 'checked' : '') + '>' +
            'Use Suffix' +
            '</label>' +
            '</div>' +

            '<div style="font-size:0.45rem;color:var(--dim);margin-top:4px;background:var(--bg2);padding:4px 8px;border-radius:4px;">Example: Father "John" + Male Prefix "Mac" + Male Suffix "son" → "MacJohnson"</div>' +
            '</div>' +

            '<div id="chainOptions" style="display:' + showChain + ';background:var(--bg);border:1px solid var(--border2);border-radius:6px;padding:10px;">' +
            '<div style="font-size:0.5rem;font-weight:bold;color:var(--accent);margin-bottom:6px;display:inline-flex;align-items:center;gap:4px;">' + treeIcon + ' Chain Rules</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">' +
            '<div>' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Source</label>' +
            '<select id="chainSource" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            chainSourceSelectHtml +
            '</select>' +
            '</div>' +
            '<div>' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Depth</label>' +
            '<select id="chainDepth" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            depthSelectHtml +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div style="margin-bottom:6px;">' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Order (select ancestors in order of inclusion)</label>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px;padding:4px;background:var(--bg2);border-radius:4px;border:1px solid var(--border-light);">' +
            chainOrderHtml +
            '</div>' +
            '<small style="font-size:0.4rem;color:var(--dim);display:block;margin-top:4px;">Select in the order you want them to appear in the surname</small>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">' +
            '<div>' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Connector</label>' +
            '<select id="chainConnector" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            connectorSelectHtml +
            '</select>' +
            '</div>' +
            '<div id="chainCustomConnectorInput" style="display:' + showChainCustom + ';">' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Custom Connector</label>' +
            '<input type="text" id="chainCustomConnector" value="' + _escapeHtml(chainCustomConnector) + '" placeholder="e.g., von der" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            '</div>' +
            '</div>' +

            '<div style="font-size:0.45rem;color:var(--dim);margin-top:4px;background:var(--bg2);padding:4px 8px;border-radius:4px;">Example: Father "John" + Mother "Mary" + Depth 2 = "John-Mary" (with hyphen connector)</div>' +
            '</div>' +

            '<button id="saveSurnameRulesBtn" class="btn primary" style="padding:6px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;background:var(--accent);border:none;color:white;border-radius:4px;cursor:pointer;">' + saveIcon + ' Save Rules</button>' +
            '<div style="font-size:0.4rem;color:var(--dim);margin-top:4px;">' + warningIcon + ' Changes are saved to the current culture\'s location: ' + _escapeHtml(getCountryNameFromId(countryId)) + '</div>' +
            '</div>'
        );
    }

    // =========================================================================
    // 8. GENERATION PREVIEW CONTENT
    // =========================================================================

    function renderGenerationPreviewContent(countryId) {
        var personIcon = _getIcon('PERSON');
        var refreshIcon = _getIcon('REFRESH');
        var bookIcon = _getIcon('BOOK');

        return (
            '<div style="display:flex;flex-direction:column;gap:8px;">' +

            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            '<div style="flex:1;min-width:120px;">' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Gender</label>' +
            '<select id="previewGender" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            '<option value="all">All</option>' +
            '<option value="male" selected>Male</option>' +
            '<option value="female">Female</option>' +
            '</select>' +
            '</div>' +
            '<div style="flex:1;min-width:120px;">' +
            '<label style="font-size:0.45rem;color:var(--accent);display:block;">Count</label>' +
            '<select id="previewCount" style="width:100%;padding:4px;font-size:0.5rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            '<option value="5">5</option>' +
            '<option value="10" selected>10</option>' +
            '<option value="20">20</option>' +
            '<option value="50">50</option>' +
            '</select>' +
            '</div>' +
            '<div style="display:flex;align-items:flex-end;">' +
            '<button id="previewGenerateBtn" class="btn primary small" style="padding:4px 12px;font-size:0.5rem;background:var(--accent);border:none;color:white;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">' + refreshIcon + ' Generate</button>' +
            '</div>' +
            '</div>' +

            '<div id="previewResults" style="background:var(--bg);border:1px solid var(--border2);border-radius:6px;padding:8px;max-height:200px;overflow-y:auto;">' +
            '<div style="color:var(--dim);font-size:0.55rem;text-align:center;padding:20px;">Click Generate to preview names</div>' +
            '</div>' +

            '<div style="font-size:0.45rem;color:var(--dim);display:flex;gap:12px;flex-wrap:wrap;">' +
            '<span>' + personIcon + ' Uses the name lists and surname rules for this culture</span>' +
            '</div>' +
            '</div>'
        );
    }

    // =========================================================================
    // 9. EVENT HANDLERS
    // =========================================================================

    function attachNamesTabHandlers(container, countryId, culture) {
        var containerId = container.id || 'cultureEditorContent';

        // Search
        var searchInput = document.getElementById('namesSearchInput');
        if (searchInput) {
            searchInput._searchTimeout = null;
            searchInput.oninput = function() {
                if (searchInput._searchTimeout) {
                    clearTimeout(searchInput._searchTimeout);
                }
                searchInput._searchTimeout = setTimeout(function() {
                    namesTabState.searchTerm = searchInput.value;
                    renderNamesTab(container, culture);
                }, 300);
            };
        }

        // Section headers (expand/collapse)
        var headers = container.querySelectorAll('.names-section-header');
        for (var i = 0; i < headers.length; i++) {
            (function(header) {
                header.onclick = function(e) {
                    if (e.target.closest('button')) return;
                    var section = this.closest('.names-section');
                    if (section) {
                        var sectionKey = section.dataset.section;
                        var content = section.querySelector('.names-section-content');
                        var icon = this.querySelector('span:last-child');

                        if (content) {
                            var isExpanded = content.style.display !== 'none';
                            content.style.display = isExpanded ? 'none' : 'block';
                            if (icon) icon.textContent = isExpanded ? '▶' : '▼';
                            namesTabState.expandedSections[sectionKey] = !isExpanded;
                            try {
                                localStorage.setItem('namesTab_expanded', JSON.stringify(namesTabState.expandedSections));
                            } catch(e) {}
                        }
                    }
                };
            })(headers[i]);
        }

        // Delete name buttons (delegated)
        container.querySelectorAll('.names-delete-btn').forEach(function(btn) {
            if (btn._clickAttached) return;
            btn._clickAttached = true;
            btn.onclick = function() {
                var type = this.dataset.type;
                var name = this.dataset.name;
                _confirmDialog('Remove "' + name + '" from ' + type + ' names?', 'Remove Name', function() {
                    var lists = typeof window.getNameLists === 'function' ? window.getNameLists() : {};
                    if (lists[countryId] && lists[countryId][type]) {
                        lists[countryId][type] = lists[countryId][type].filter(function(n) { return n !== name; });
                        if (typeof window.masterData !== 'undefined' && window.masterData.data) {
                            window.masterData.data.nameLists = lists;
                            if (typeof window.saveMasterData === 'function') window.saveMasterData();
                        }
                        if (typeof window.NameState !== 'undefined' && typeof window.NameState.invalidateCache === 'function') {
                            window.NameState.invalidateCache();
                        }
                        renderNamesTab(container, culture);
                        _showToast('Removed "' + name + '"', 'info');
                    }
                });
            };
        });

        // Import buttons
        container.querySelectorAll('.names-import-btn').forEach(function(btn) {
            if (btn._clickAttached) return;
            btn._clickAttached = true;
            btn.onclick = function() {
                var type = this.dataset.type;
                openNameFileUpload(countryId, type, function() {
                    renderNamesTab(container, culture);
                });
            };
        });

        // Add manual name
        var addNameBtn = document.getElementById('namesAddManualBtn');
        if (addNameBtn && !addNameBtn._clickAttached) {
            addNameBtn._clickAttached = true;
            addNameBtn.onclick = function() {
                var name = prompt('Enter name:');
                if (name && name.trim()) {
                    var type = prompt('Type: male, female, or surnames?', 'male');
                    if (type && ['male', 'female', 'surnames'].indexOf(type.toLowerCase()) !== -1) {
                        var lists = typeof window.getNameLists === 'function' ? window.getNameLists() : {};
                        if (!lists[countryId]) lists[countryId] = { male: [], female: [], surnames: [] };
                        var trimmed = name.trim();
                        var typeKey = type.toLowerCase();
                        if (lists[countryId][typeKey].indexOf(trimmed) === -1) {
                            lists[countryId][typeKey].push(trimmed);
                            lists[countryId][typeKey].sort();
                            if (typeof window.masterData !== 'undefined' && window.masterData.data) {
                                window.masterData.data.nameLists = lists;
                                if (typeof window.saveMasterData === 'function') window.saveMasterData();
                            }
                            if (typeof window.NameState !== 'undefined' && typeof window.NameState.invalidateCache === 'function') {
                                window.NameState.invalidateCache();
                            }
                            renderNamesTab(container, culture);
                            _showToast('Added "' + trimmed + '"', 'success');
                        } else {
                            _showToast('Name already exists', 'error');
                        }
                    }
                }
            };
        }

        // Clear all names
        var clearNamesBtn = document.getElementById('namesClearAllBtn');
        if (clearNamesBtn && !clearNamesBtn._clickAttached) {
            clearNamesBtn._clickAttached = true;
            clearNamesBtn.onclick = function() {
                _confirmDialog('Clear ALL names for this culture?', 'Clear All Names', function() {
                    var lists = typeof window.getNameLists === 'function' ? window.getNameLists() : {};
                    lists[countryId] = { male: [], female: [], surnames: [] };
                    if (typeof window.masterData !== 'undefined' && window.masterData.data) {
                        window.masterData.data.nameLists = lists;
                        if (typeof window.saveMasterData === 'function') window.saveMasterData();
                    }
                    if (typeof window.NameState !== 'undefined' && typeof window.NameState.invalidateCache === 'function') {
                        window.NameState.invalidateCache();
                    }
                    renderNamesTab(container, culture);
                    _showToast('All names cleared', 'info');
                });
            };
        }

        // Surname rules handlers
        attachSurnameRulesHandlers(container, countryId, culture);

        // Generation preview
        attachGenerationPreviewHandlers(container, countryId);
    }

    // =========================================================================
    // 10. SURNAME RULES HANDLERS
    // =========================================================================

    function attachSurnameRulesHandlers(container, countryId, culture) {
        var ruleTypeSelect = document.getElementById('surnameRuleType');
        if (ruleTypeSelect && !ruleTypeSelect._changeAttached) {
            ruleTypeSelect._changeAttached = true;
            ruleTypeSelect.addEventListener('change', function() {
                var type = this.value;
                var familyOptions = document.getElementById('familyOptions');
                var patronymicOptions = document.getElementById('patronymicOptions');
                var chainOptions = document.getElementById('chainOptions');
                if (familyOptions) familyOptions.style.display = type === 'family' ? 'block' : 'none';
                if (patronymicOptions) patronymicOptions.style.display = type === 'patronymic' ? 'block' : 'none';
                if (chainOptions) chainOptions.style.display = type === 'chain' ? 'block' : 'none';
            });
        }

        var familyConnectorSelect = document.getElementById('familyConnector');
        if (familyConnectorSelect && !familyConnectorSelect._changeAttached) {
            familyConnectorSelect._changeAttached = true;
            familyConnectorSelect.addEventListener('change', function() {
                var customInput = document.getElementById('familyCustomConnectorInput');
                if (customInput) customInput.style.display = this.value === 'custom' ? 'block' : 'none';
            });
        }

        var chainConnectorSelect = document.getElementById('chainConnector');
        if (chainConnectorSelect && !chainConnectorSelect._changeAttached) {
            chainConnectorSelect._changeAttached = true;
            chainConnectorSelect.addEventListener('change', function() {
                var customInput = document.getElementById('chainCustomConnectorInput');
                if (customInput) customInput.style.display = this.value === 'custom' ? 'block' : 'none';
            });
        }

        var saveBtn = document.getElementById('saveSurnameRulesBtn');
        if (saveBtn && !saveBtn._clickAttached) {
            saveBtn._clickAttached = true;
            saveBtn.onclick = function() {
                var chainCheckboxes = container.querySelectorAll('.chain-order-checkbox');
                var chainOrder = [];
                chainCheckboxes.forEach(function(cb) {
                    if (cb.checked) {
                        chainOrder.push(cb.value);
                    }
                });

                if (chainOrder.length === 0) {
                    chainOrder = ['father', 'mother'];
                }

                var rules = {
                    type: document.getElementById('surnameRuleType').value,
                    family: {
                        source: document.getElementById('familySource').value,
                        order: document.getElementById('familyOrder').value,
                        count: parseInt(document.getElementById('familyCount').value) || 1,
                        position: document.getElementById('familyPosition').value,
                        connector: document.getElementById('familyConnector').value,
                        customConnector: document.getElementById('familyCustomConnector')?.value || ''
                    },
                    patronymic: {
                        source: document.getElementById('patronymicSource').value,
                        malePrefix: document.getElementById('patronymicMalePrefix')?.value || '',
                        maleSuffix: document.getElementById('patronymicMaleSuffix')?.value || '',
                        femalePrefix: document.getElementById('patronymicFemalePrefix')?.value || '',
                        femaleSuffix: document.getElementById('patronymicFemaleSuffix')?.value || '',
                        usePrefix: document.getElementById('patronymicUsePrefix')?.checked !== false,
                        useSuffix: document.getElementById('patronymicUseSuffix')?.checked !== false
                    },
                    chain: {
                        source: document.getElementById('chainSource').value,
                        depth: parseInt(document.getElementById('chainDepth').value) || 1,
                        order: chainOrder,
                        connector: document.getElementById('chainConnector').value,
                        customConnector: document.getElementById('chainCustomConnector')?.value || ''
                    }
                };

                setCountrySurnameRules(countryId, rules);
                _showToast('Surname rules saved for ' + getCountryNameFromId(countryId), 'success');
                renderNamesTab(container, culture);
            };
        }
    }

    // =========================================================================
    // 11. GENERATION PREVIEW HANDLERS
    // =========================================================================

    function attachGenerationPreviewHandlers(container, countryId) {
        var generateBtn = document.getElementById('previewGenerateBtn');
        if (generateBtn && !generateBtn._clickAttached) {
            generateBtn._clickAttached = true;
            generateBtn.onclick = function() {
                var gender = document.getElementById('previewGender')?.value || 'male';
                var count = parseInt(document.getElementById('previewCount')?.value || 10);
                var results = document.getElementById('previewResults');

                if (!results) return;

                var names = [];
                var surnames = [];

                for (var i = 0; i < count; i++) {
                    var name = null;
                    var surname = '';

                    // Get random name
                    if (typeof window.NameQueries !== 'undefined' && typeof window.NameQueries.getRandomName === 'function') {
                        name = window.NameQueries.getRandomName(countryId, gender);
                    }
                    if (!name) {
                        var lists = getCountryNameLists(countryId);
                        var nameList = gender === 'male' ? lists.male : (gender === 'female' ? lists.female : [].concat(lists.male || [], lists.female || []));
                        if (nameList && nameList.length > 0) {
                            name = nameList[Math.floor(Math.random() * nameList.length)];
                        }
                    }

                    // Get random surname
                    if (typeof window.NameQueries !== 'undefined' && typeof window.NameQueries.getRandomSurname === 'function') {
                        surname = window.NameQueries.getRandomSurname(countryId);
                    }
                    if (!surname) {
                        var lists = getCountryNameLists(countryId);
                        var surnameList = lists.surnames || [];
                        if (surnameList.length > 0) {
                            surname = surnameList[Math.floor(Math.random() * surnameList.length)];
                        }
                    }

                    if (name) {
                        names.push(name + (surname ? ' ' + surname : ''));
                    }
                }

                if (names.length === 0) {
                    results.innerHTML = '<div style="color:var(--dim);font-size:0.55rem;text-align:center;padding:20px;">No names available. Add names to the lists first.</div>';
                    return;
                }

                results.innerHTML = names.map(function(n) {
                    return '<span style="display:inline-block;background:var(--bg2);padding:2px 10px;border-radius:12px;font-size:0.55rem;margin:3px;border:1px solid var(--border);">' + _escapeHtml(n) + '</span>';
                }).join('');
            };
        }

        // Auto-generate on load
        setTimeout(function() {
            var genBtn = document.getElementById('previewGenerateBtn');
            if (genBtn) genBtn.click();
        }, 100);
    }

    // =========================================================================
    // 12. FILE UPLOAD
    // =========================================================================

    function openNameFileUpload(countryId, type, callback) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.csv';
        input.onchange = function(e) {
            if (e.target.files[0]) {
                var reader = new FileReader();
                reader.onload = function(ev) {
                    var content = ev.target.result;
                    var names = content.split(/\r?\n|,|\s+/).filter(function(n) { return n.trim().length > 0; });
                    if (content.includes(',')) {
                        var csvNames = content.split(',').map(function(n) { return n.trim().replace(/^["']|["']$/g, ''); });
                        if (csvNames.length > names.length) names = csvNames;
                    }

                    var lists = typeof window.getNameLists === 'function' ? window.getNameLists() : {};
                    if (!lists[countryId]) lists[countryId] = { male: [], female: [], surnames: [] };
                    if (!lists[countryId][type]) lists[countryId][type] = [];

                    var added = 0;
                    var duplicates = 0;
                    for (var i = 0; i < names.length; i++) {
                        var trimmed = names[i].trim();
                        if (trimmed && lists[countryId][type].indexOf(trimmed) === -1) {
                            lists[countryId][type].push(trimmed);
                            added++;
                        } else if (trimmed) {
                            duplicates++;
                        }
                    }

                    lists[countryId][type].sort();

                    if (typeof window.masterData !== 'undefined' && window.masterData.data) {
                        window.masterData.data.nameLists = lists;
                        if (typeof window.saveMasterData === 'function') window.saveMasterData();
                    }
                    if (typeof window.NameState !== 'undefined' && typeof window.NameState.invalidateCache === 'function') {
                        window.NameState.invalidateCache();
                    }

                    _showToast('Added ' + added + ' names to ' + type + ' (' + duplicates + ' duplicates skipped)', 'success');
                    if (callback) callback();
                };
                reader.readAsText(e.target.files[0]);
            }
        };
        input.click();
    }

    // =========================================================================
    // 13. TAB DEFINITION
    // =========================================================================

    var NamesTab = {
        label: 'Names',
        icon: 'PERSON',
        render: renderNamesTab,
        save: function(culture) {
            // Names tab doesn't modify the culture object directly
            // Changes are saved directly to nameLists
            return culture;
        },
        validate: function(culture) {
            var countryId = getCountryIdFromCulture(culture);
            if (!countryId) {
                return { valid: true, warnings: ['No location associated with this culture'] };
            }
            return { valid: true };
        }
    };

    // =========================================================================
    // 14. REGISTER FUNCTION
    // =========================================================================

    function registerNamesTab() {
        if (typeof window.CultureEditorTabs === 'undefined') {
            console.warn('[NamesTab] CultureEditorTabs not available, tab not registered');
            return false;
        }

        var result = window.CultureEditorTabs.registerTab('names', NamesTab);
        if (result) {
            console.log('[NamesTab] Registered names tab successfully');
        }
        return result;
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.NamesTab = NamesTab;
    window.registerNamesTab = registerNamesTab;

    // Auto-register if CultureEditorTabs is available
    if (typeof window.CultureEditorTabs !== 'undefined') {
        registerNamesTab();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            NamesTab: NamesTab,
            registerNamesTab: registerNamesTab
        };
    }

    console.log('[NamesTab] Loaded successfully');

})();