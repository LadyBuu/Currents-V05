/**
 * =============================================================================
 * STILL WATERS - NAMES MANAGER TAB UI (systems/world/ui/namesManagerTabUI.js)
 * =============================================================================
 * 
 * Names Manager as a tab in World Manager.
 * Uses the currently selected location from the sidebar.
 * 
 * UPDATED:
 * - All icons from icons.js via _getIcon() - NO EMOJIS
 * - No console logs
 * - Proper integration with NameState, NameQueries, NameCommands, NameRules
 * - All sections on one page
 * - Surname Rules - COMPLETE with all rule types
 * - City Names (prefixes, roots, suffixes, generator)
 * - PROPERLY SAVES rules to nameLists[countryId].rules
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. ICON HELPERS - Using SVG icons from icons.js ONLY
    // =========================================================================

    function _getIcon(name, fallback) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        return fallback || '<svg viewBox="0 0 20 20" width="1em" height="1em" style="display:inline-block;fill:currentColor;stroke:currentColor;vertical-align:middle;"><circle cx="10" cy="10" r="5.71" fill="currentColor"/></svg>';
    }

    function _getCheckIcon() { return _getIcon('CHECK_SIMPLE'); }
    function _getCrossIcon() { return _getIcon('X_HEAVY'); }
    function _getCircleIcon() { return _getIcon('CIRCLE'); }
    function _getHomeIcon() { return _getIcon('HOME'); }
    function _getSearchIcon() { return _getIcon('SEARCH'); }
    function _getRefreshIcon() { return _getIcon('REFRESH'); }
    function _getPersonIcon() { return _getIcon('PERSON'); }
    function _getFlagIcon() { return _getIcon('FLAG'); }
    function _getPlusIcon() { return _getIcon('PLUS'); }
    function _getBookIcon() { return _getIcon('BOOK'); }
    function _getGearIcon() { return _getIcon('GEAR'); }
    function _getStarIcon() { return _getIcon('STAR'); }
    function _getLinkIcon() { return _getIcon('LINK'); }
    function _getTreeIcon() { return _getIcon('FAMILY_TREE'); }
    function _getCrownIcon() { return _getIcon('CROWN'); }
    function _getEditIcon() { return _getIcon('EDIT'); }
    function _getTrashIcon() { return _getIcon('TRASH'); }
    function _getWarningIcon() { return _getIcon('WARNING'); }
    function _getLocationIcon() { return _getIcon('LOCATION'); }
    function _getSaveIcon() { return _getIcon('CHECK_SIMPLE'); }

    // =========================================================================
    // 2. STATE
    // =========================================================================

    var namesTabState = {
        searchTerm: '',
        expandedSections: {
            character_names: true,
            surname_rules: true,
            city_names: true
        },
        _isRendering: false,
        _containerId: null,
        _handlersAttached: false
    };

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
        else if (typeof window._showToast === 'function') window._showToast(msg, type);
        else if (typeof window.showToastMessage === 'function') window.showToastMessage(msg, type);
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

    function _getNameLists() {
        if (typeof window.NameState !== 'undefined' && typeof window.NameState.getNameLists === 'function') {
            return window.NameState.getNameLists();
        }
        return typeof window.getNameLists === 'function' ? window.getNameLists() : {};
    }

    function _setNameLists(lists) {
        if (typeof window.NameState !== 'undefined' && typeof window.NameState._initialize === 'function') {
            // Use NameState's internal mechanism
            if (window.masterData && window.masterData.data) {
                window.masterData.data.nameLists = lists;
                if (typeof window.saveMasterData === 'function') window.saveMasterData();
                window.NameState.invalidateCache();
            }
        } else if (typeof window.masterData !== 'undefined' && window.masterData.data) {
            window.masterData.data.nameLists = lists;
            if (typeof window.saveMasterData === 'function') window.saveMasterData();
        }
    }

    function _getCityNameParts() {
        return typeof window.getCityNameParts === 'function' ? window.getCityNameParts() : {};
    }

    function _setCityNameParts(parts) {
        if (typeof window.masterData !== 'undefined' && window.masterData.data) {
            window.masterData.data.cityNameParts = parts;
            if (typeof window.saveMasterData === 'function') window.saveMasterData();
        }
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

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    // =========================================================================
    // 4. HELPER FUNCTIONS
    // =========================================================================

    function getLocationId() {
        if (typeof window.worldManager !== 'undefined' && window.worldManager.getSelectedLocation) {
            return window.worldManager.getSelectedLocation();
        }
        return null;
    }

    function getCountries() {
        var places = _getPlaces();
        var types = _getLocationTypes();
        var countryType = types.find(function(t) { return t.displayName === 'Country'; });
        
        if (countryType) {
            return places.filter(function(p) { return p.typeId === countryType.id; })
                .map(function(p) { return { id: p.id, displayName: p.displayName }; });
        }
        return places.filter(function(p) { return !p.parentId; })
            .map(function(p) { return { id: p.id, displayName: p.displayName }; });
    }

    function getCurrentCountry() {
        var locationId = getLocationId();
        if (!locationId) return null;
        
        var place = _getPlaceById(locationId);
        if (!place) return null;
        
        var types = _getLocationTypes();
        var countryType = types.find(function(t) { return t.displayName === 'Country'; });
        if (countryType && place.typeId === countryType.id) {
            return { id: place.id, displayName: place.displayName };
        }
        
        var countries = getCountries();
        var current = place;
        var safety = 0;
        while (current && safety < 20) {
            var country = countries.find(function(c) { return c.id === current.id; });
            if (country) return country;
            if (!current.parentId) break;
            current = _getPlaceById(current.parentId);
            safety++;
        }
        return null;
    }

    function filterNames(names, search) {
        if (!search) return names;
        var lower = search.toLowerCase();
        return names.filter(function(n) { return n.toLowerCase().indexOf(lower) !== -1; });
    }

    function getCountryNameLists(countryId) {
        var lists = _getNameLists();
        if (!lists[countryId]) {
            lists[countryId] = { male: [], female: [], surnames: [] };
            _setNameLists(lists);
        }
        return lists[countryId];
    }

    function getCountryCityParts(countryId) {
        var parts = _getCityNameParts();
        if (!parts[countryId]) {
            parts[countryId] = { prefixes: [], roots: [], suffixes: [] };
            _setCityNameParts(parts);
        }
        return parts[countryId];
    }

    // =========================================================================
    // 5. SURNAME RULES - Get/Set Country Rules
    // =========================================================================

    function getCountrySurnameRules(countryId) {
        var lists = _getNameLists();
        if (!lists[countryId]) {
            lists[countryId] = { male: [], female: [], surnames: [] };
            _setNameLists(lists);
        }
        if (!lists[countryId].rules) {
            lists[countryId].rules = {
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
            _setNameLists(lists);
        }
        return lists[countryId].rules;
    }

    function setCountrySurnameRules(countryId, rules) {
        var lists = _getNameLists();
        if (!lists[countryId]) {
            lists[countryId] = { male: [], female: [], surnames: [] };
        }
        lists[countryId].rules = rules;
        _setNameLists(lists);
    }

    // =========================================================================
    // 6. MAIN RENDER FUNCTION
    // =========================================================================

    function renderNamesTab(containerId) {
        if (namesTabState._isRendering) {
            return;
        }
        namesTabState._isRendering = true;

        var container = document.getElementById(containerId || 'namesContent');
        if (!container) {
            namesTabState._isRendering = false;
            return;
        }

        namesTabState._containerId = containerId || 'namesContent';
        
        var country = getCurrentCountry();
        var place = getLocationId() ? _getPlaceById(getLocationId()) : null;
        var locationName = place ? place.displayName : 'No location selected';

        var homeIcon = _getHomeIcon();
        var flagIcon = _getFlagIcon();
        var crossIcon = _getCrossIcon();
        var personIcon = _getPersonIcon();
        var linkIcon = _getLinkIcon();
        var gearIcon = _getGearIcon();
        var refreshIcon = _getRefreshIcon();
        var searchIcon = _getSearchIcon();

        var html = 
            '<div class="names-tab" style="display:flex;flex-direction:column;height:100%;">' +
            '<div class="names-header" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:6px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;margin-bottom:12px;flex-shrink:0;">' +
            '<span style="font-size:0.6rem;color:var(--dim);display:inline-flex;align-items:center;gap:4px;">' + homeIcon + ' ' + _escapeHtml(locationName) + '</span>' +
            (country ? '<span style="font-size:0.55rem;color:var(--accent);display:inline-flex;align-items:center;gap:4px;">' + flagIcon + ' Country: ' + _escapeHtml(country.displayName) + '</span>' : 
                '<span style="font-size:0.55rem;color:var(--warn);display:inline-flex;align-items:center;gap:4px;">' + crossIcon + ' No country found</span>' +
                '<span style="font-size:0.45rem;color:var(--dim);margin-left:4px;">Select a location that belongs to a country</span>') +
            '<div style="flex:1;"></div>' +
            '<button id="namesRefreshBtn" class="btn small" style="padding:4px 8px;font-size:0.5rem;display:inline-flex;align-items:center;gap:4px;">' + refreshIcon + '</button>' +
            '</div>' +
            
            '<div style="padding:0 4px 8px 4px;flex-shrink:0;">' +
            '<input type="text" id="namesSearchInput" placeholder="Filter items..." value="' + _escapeHtml(namesTabState.searchTerm) + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.6rem;">' +
            '</div>' +
            
            '<div style="flex:1;overflow-y:auto;min-height:0;">' +
            (country ? renderAllSections(country) : 
                '<div class="empty-state" style="padding:40px;text-align:center;color:var(--dim);">' + 
                    homeIcon + ' Select a location that belongs to a country<br>' +
                    '<span style="font-size:0.6rem;">(Country-level locations and their children)</span>' +
                '</div>') +
            '</div>' +
            '</div>';

        container.innerHTML = html;
        
        attachNamesTabHandlers(container);
        
        namesTabState._isRendering = false;
    }

    // =========================================================================
    // 7. RENDER ALL SECTIONS
    // =========================================================================

    function renderAllSections(country) {
        var search = namesTabState.searchTerm || '';
        var isCharacterExpanded = namesTabState.expandedSections.character_names !== false;
        var isSurnameRulesExpanded = namesTabState.expandedSections.surname_rules !== false;
        var isCityExpanded = namesTabState.expandedSections.city_names !== false;

        var personIcon = _getPersonIcon();
        var linkIcon = _getLinkIcon();
        var gearIcon = _getGearIcon();

        return (
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            
            renderCollapsibleSection(
                'character_names',
                personIcon + ' Character Names',
                renderCharacterNamesContent(country, search),
                isCharacterExpanded
            ) +
            
            renderCollapsibleSection(
                'surname_rules',
                linkIcon + ' Surname Rules',
                renderSurnameRulesContent(country),
                isSurnameRulesExpanded
            ) +
            
            renderCollapsibleSection(
                'city_names',
                gearIcon + ' City Names',
                renderCityNamesContent(country, search),
                isCityExpanded
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
    // 8. CHARACTER NAMES CONTENT
    // =========================================================================

    function renderCharacterNamesContent(country, search) {
        var lists = getCountryNameLists(country.id);
        var maleNames = filterNames(lists.male || [], search);
        var femaleNames = filterNames(lists.female || [], search);
        var surnames = filterNames(lists.surnames || [], search);

        var crossIcon = _getCrossIcon();
        var checkIcon = _getCheckIcon();
        var personIcon = _getPersonIcon();
        var bookIcon = _getBookIcon();
        var gearIcon = _getGearIcon();

        return (
            '<div style="display:flex;flex-direction:column;gap:8px;">' +
            '<div style="display:flex;gap:16px;font-size:0.55rem;color:var(--dim);padding:4px 0;">' +
            '<span style="display:inline-flex;align-items:center;gap:4px;">' + personIcon + ' ' + maleNames.length + ' male</span>' +
            '<span style="display:inline-flex;align-items:center;gap:4px;">' + personIcon + ' ' + femaleNames.length + ' female</span>' +
            '<span style="display:inline-flex;align-items:center;gap:4px;">' + bookIcon + ' ' + surnames.length + ' surnames</span>' +
            '</div>' +
            
            renderNameTagSection('male', 'Male Names', maleNames, country.id) +
            renderNameTagSection('female', 'Female Names', femaleNames, country.id) +
            renderNameTagSection('surnames', 'Surnames', surnames, country.id) +
            
            '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--border);">' +
            '<button class="names-import-btn btn small" data-type="male" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;">' + gearIcon + ' Import Male</button>' +
            '<button class="names-import-btn btn small" data-type="female" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;">' + gearIcon + ' Import Female</button>' +
            '<button class="names-import-btn btn small" data-type="surnames" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;">' + gearIcon + ' Import Surnames</button>' +
            '<button id="namesAddManualBtn" class="btn small" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;">' + checkIcon + ' Add</button>' +
            '<button id="namesClearAllBtn" class="btn small danger" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;">' + crossIcon + ' Clear All</button>' +
            '</div>' +
            '</div>'
        );
    }

    function renderNameTagSection(type, label, names, countryId) {
        var crossIcon = _getCrossIcon();
        
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
    // 9. SURNAME RULES CONTENT
    // =========================================================================

    function renderSurnameRulesContent(country) {
        var rules = getCountrySurnameRules(country.id);
        var checkIcon = _getCheckIcon();
        var crossIcon = _getCrossIcon();
        var linkIcon = _getLinkIcon();
        var treeIcon = _getTreeIcon();
        var gearIcon = _getGearIcon();
        var bookIcon = _getBookIcon();
        var saveIcon = _getSaveIcon();
        var flagIcon = _getFlagIcon();
        var warningIcon = _getWarningIcon();

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
            '<small style="font-size:0.45rem;color:var(--dim);display:block;margin-top:4px;">This rule determines how surnames are generated for this country</small>' +
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
            '<div style="font-size:0.4rem;color:var(--dim);margin-top:4px;">' + warningIcon + ' Changes are saved to the current country: ' + _escapeHtml(country.displayName) + '</div>' +
            '</div>'
        );
    }

    // =========================================================================
    // 10. CITY NAMES CONTENT
    // =========================================================================

    function renderCityNamesContent(country, search) {
        var parts = getCountryCityParts(country.id);
        var prefixes = filterNames(parts.prefixes || [], search);
        var roots = filterNames(parts.roots || [], search);
        var suffixes = filterNames(parts.suffixes || [], search);

        var checkIcon = _getCheckIcon();
        var crossIcon = _getCrossIcon();
        var gearIcon = _getGearIcon();
        var starIcon = _getStarIcon();
        var bookIcon = _getBookIcon();

        return (
            '<div style="display:flex;flex-direction:column;gap:8px;">' +
            '<div style="display:flex;gap:16px;font-size:0.55rem;color:var(--dim);padding:4px 0;">' +
            '<span style="display:inline-flex;align-items:center;gap:4px;">' + gearIcon + ' ' + prefixes.length + ' prefixes</span>' +
            '<span style="display:inline-flex;align-items:center;gap:4px;">' + starIcon + ' ' + roots.length + ' roots</span>' +
            '<span style="display:inline-flex;align-items:center;gap:4px;">' + bookIcon + ' ' + suffixes.length + ' suffixes</span>' +
            '</div>' +
            
            renderCityPartSection('prefixes', 'Prefixes', prefixes, country.id) +
            renderCityPartSection('roots', 'Roots', roots, country.id) +
            renderCityPartSection('suffixes', 'Suffixes', suffixes, country.id) +
            
            '<div style="background:var(--bg);border:1px solid var(--border2);border-radius:6px;padding:8px;">' +
            '<div style="font-size:0.55rem;font-weight:bold;color:var(--accent);margin-bottom:4px;display:inline-flex;align-items:center;gap:4px;">' + gearIcon + ' City Name Generator</div>' +
            '<div style="display:flex;gap:8px;margin-bottom:6px;">' +
            '<button id="cityGenerateBtn" class="btn primary small" style="padding:4px 12px;font-size:0.5rem;">Generate 10</button>' +
            '<button id="cityCopyBtn" class="btn small" style="padding:4px 12px;font-size:0.5rem;display:inline-flex;align-items:center;gap:4px;">' + bookIcon + ' Copy</button>' +
            '</div>' +
            '<div id="cityGeneratedList" style="display:flex;flex-wrap:wrap;gap:4px;min-height:30px;background:var(--bg);border-radius:4px;padding:6px;">' +
            '<span style="color:var(--dim);font-size:0.5rem;">Click Generate to create city names</span>' +
            '</div></div>' +
            
            '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--border);">' +
            '<button class="city-import-btn btn small" data-part="prefixes" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;">' + gearIcon + ' Import Prefixes</button>' +
            '<button class="city-import-btn btn small" data-part="roots" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;">' + gearIcon + ' Import Roots</button>' +
            '<button class="city-import-btn btn small" data-part="suffixes" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;">' + gearIcon + ' Import Suffixes</button>' +
            '<button id="cityAddManualBtn" class="btn small" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;">' + checkIcon + ' Add Part</button>' +
            '<button id="cityClearAllBtn" class="btn small danger" style="padding:4px 12px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;">' + crossIcon + ' Clear All</button>' +
            '</div>' +
            '</div>'
        );
    }

    function renderCityPartSection(type, label, items, countryId) {
        var crossIcon = _getCrossIcon();
        
        return (
            '<div style="background:var(--bg);border:1px solid var(--border2);border-radius:6px;padding:8px;margin-bottom:6px;">' +
            '<div style="font-size:0.55rem;font-weight:bold;color:var(--accent);margin-bottom:4px;">' + label + ' (' + items.length + ')</div>' +
            (items.length > 0 ?
                '<div style="display:flex;flex-wrap:wrap;gap:4px;max-height:100px;overflow-y:auto;">' +
                items.map(function(item) {
                    return '<span class="name-tag" style="background:var(--bg2);padding:2px 8px;border-radius:12px;font-size:0.5rem;display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border);">' +
                        _escapeHtml(item) +
                        '<button class="city-delete-btn" data-type="' + type + '" data-name="' + _escapeHtml(item) + '" style="background:none;border:none;color:var(--danger-lt);cursor:pointer;font-size:0.45rem;padding:0 2px;display:inline-flex;align-items:center;">' + crossIcon + '</button>' +
                        '</span>';
                }).join('') +
                '</div>' :
                '<div style="color:var(--dim);font-size:0.5rem;padding:8px;text-align:center;">No ' + label.toLowerCase() + ' yet. Import a file or add manually.</div>'
            ) +
            '</div>'
        );
    }

    // =========================================================================
    // 11. EVENT HANDLERS
    // =========================================================================

    function attachNamesTabHandlers(container) {
        var containerId = container.id || 'namesContent';

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
                    if (document.getElementById(containerId)) {
                        renderNamesTab(containerId);
                    }
                }, 300);
            };
        }

        // Refresh button
        var refreshBtn = document.getElementById('namesRefreshBtn');
        if (refreshBtn) {
            refreshBtn._clickAttached = true;
            refreshBtn.onclick = function() {
                // Refresh name state
                if (typeof window.NameState !== 'undefined' && 
                    typeof window.NameState.refreshFromMasterData === 'function') {
                    window.NameState.refreshFromMasterData();
                }
                renderNamesTab(containerId);
                _showToast('Refreshed', 'success');
            };
        }

        // DELEGATED EVENT HANDLER
        if (container._clickHandler) {
            container.removeEventListener('click', container._clickHandler);
        }
        
        container._clickHandler = function(e) {
            // Section headers (expand/collapse)
            var header = e.target.closest('.names-section-header');
            if (header && !e.target.closest('button')) {
                e.stopPropagation();
                var section = header.closest('.names-section');
                if (section) {
                    var sectionKey = section.dataset.section;
                    var content = section.querySelector('.names-section-content');
                    var icon = header.querySelector('span:last-child');
                    
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
                return;
            }

            // Delete name buttons
            var deleteBtn = e.target.closest('.names-delete-btn');
            if (deleteBtn) {
                e.stopPropagation();
                var type = deleteBtn.dataset.type;
                var name = deleteBtn.dataset.name;
                var country = getCurrentCountry();
                if (!country) {
                    _showToast('No country found', 'error');
                    return;
                }
                
                _confirmDialog('Remove "' + name + '" from ' + type + ' names?', 'Remove Name', function() {
                    var lists = _getNameLists();
                    if (lists[country.id] && lists[country.id][type]) {
                        lists[country.id][type] = lists[country.id][type].filter(function(n) { return n !== name; });
                        _setNameLists(lists);
                        renderNamesTab(containerId);
                        _showToast('Removed "' + name + '"', 'info');
                    }
                });
                return;
            }

            // Delete city part buttons
            var cityDeleteBtn = e.target.closest('.city-delete-btn');
            if (cityDeleteBtn) {
                e.stopPropagation();
                var type = cityDeleteBtn.dataset.type;
                var name = cityDeleteBtn.dataset.name;
                var country = getCurrentCountry();
                if (!country) {
                    _showToast('No country found', 'error');
                    return;
                }
                
                _confirmDialog('Remove "' + name + '" from ' + type + '?', 'Remove Part', function() {
                    var parts = _getCityNameParts();
                    if (parts[country.id] && parts[country.id][type]) {
                        parts[country.id][type] = parts[country.id][type].filter(function(n) { return n !== name; });
                        _setCityNameParts(parts);
                        renderNamesTab(containerId);
                        _showToast('Removed "' + name + '"', 'info');
                    }
                });
                return;
            }
        };
        
        container.addEventListener('click', container._clickHandler);
        attachDynamicButtonHandlers(container);
        attachSurnameRulesHandlers(container);
    }

    // =========================================================================
    // 12. SURNAME RULES HANDLERS
    // =========================================================================

    function attachSurnameRulesHandlers(container) {
        var containerId = container.id || 'namesContent';
        var country = getCurrentCountry();
        if (!country) return;

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

                setCountrySurnameRules(country.id, rules);
                _showToast('Surname rules saved for ' + country.displayName, 'success');
                
                if (document.getElementById(containerId)) {
                    renderNamesTab(containerId);
                }
            };
        }
    }

    // =========================================================================
    // 13. DYNAMIC BUTTON HANDLERS
    // =========================================================================

    function attachDynamicButtonHandlers(container) {
        var containerId = container.id || 'namesContent';

        container.querySelectorAll('.names-import-btn').forEach(function(btn) {
            if (btn._clickAttached) return;
            btn._clickAttached = true;
            btn.onclick = function() {
                var type = this.dataset.type;
                var country = getCurrentCountry();
                if (!country) {
                    _showToast('No country found for this location', 'error');
                    return;
                }
                openNameFileUpload(type);
            };
        });

        container.querySelectorAll('.city-import-btn').forEach(function(btn) {
            if (btn._clickAttached) return;
            btn._clickAttached = true;
            btn.onclick = function() {
                var part = this.dataset.part;
                var country = getCurrentCountry();
                if (!country) {
                    _showToast('No country found for this location', 'error');
                    return;
                }
                openCityPartsFileUpload(part);
            };
        });

        var addNameBtn = document.getElementById('namesAddManualBtn');
        if (addNameBtn && !addNameBtn._clickAttached) {
            addNameBtn._clickAttached = true;
            addNameBtn.onclick = function() {
                var country = getCurrentCountry();
                if (!country) {
                    _showToast('No country found for this location', 'error');
                    return;
                }
                var name = prompt('Enter name:');
                if (name && name.trim()) {
                    var type = prompt('Type: male, female, or surnames?', 'male');
                    if (type && ['male', 'female', 'surnames'].indexOf(type.toLowerCase()) !== -1) {
                        var lists = _getNameLists();
                        if (!lists[country.id]) lists[country.id] = { male: [], female: [], surnames: [] };
                        var trimmed = name.trim();
                        if (lists[country.id][type.toLowerCase()].indexOf(trimmed) === -1) {
                            lists[country.id][type.toLowerCase()].push(trimmed);
                            lists[country.id][type.toLowerCase()].sort();
                            _setNameLists(lists);
                            renderNamesTab(containerId);
                            _showToast('Added "' + trimmed + '"', 'success');
                        } else {
                            _showToast('Name already exists', 'error');
                        }
                    }
                }
            };
        }

        var clearNamesBtn = document.getElementById('namesClearAllBtn');
        if (clearNamesBtn && !clearNamesBtn._clickAttached) {
            clearNamesBtn._clickAttached = true;
            clearNamesBtn.onclick = function() {
                var country = getCurrentCountry();
                if (!country) {
                    _showToast('No country found for this location', 'error');
                    return;
                }
                _confirmDialog('Clear ALL names for ' + country.displayName + '?', 'Clear All Names', function() {
                    var lists = _getNameLists();
                    lists[country.id] = { male: [], female: [], surnames: [] };
                    _setNameLists(lists);
                    renderNamesTab(containerId);
                    _showToast('All names cleared', 'info');
                });
            };
        }

        var addCityBtn = document.getElementById('cityAddManualBtn');
        if (addCityBtn && !addCityBtn._clickAttached) {
            addCityBtn._clickAttached = true;
            addCityBtn.onclick = function() {
                var country = getCurrentCountry();
                if (!country) {
                    _showToast('No country found for this location', 'error');
                    return;
                }
                var partType = prompt('Part type (prefixes, roots, suffixes):', 'prefixes');
                if (partType && ['prefixes', 'roots', 'suffixes'].indexOf(partType.toLowerCase()) !== -1) {
                    var value = prompt('Enter value:');
                    if (value && value.trim()) {
                        var parts = _getCityNameParts();
                        if (!parts[country.id]) parts[country.id] = { prefixes: [], roots: [], suffixes: [] };
                        var trimmed = value.trim();
                        if (parts[country.id][partType.toLowerCase()].indexOf(trimmed) === -1) {
                            parts[country.id][partType.toLowerCase()].push(trimmed);
                            parts[country.id][partType.toLowerCase()].sort();
                            _setCityNameParts(parts);
                            renderNamesTab(containerId);
                            _showToast('Added "' + trimmed + '" to ' + partType, 'success');
                        } else {
                            _showToast('Already exists', 'error');
                        }
                    }
                }
            };
        }

        var clearCityBtn = document.getElementById('cityClearAllBtn');
        if (clearCityBtn && !clearCityBtn._clickAttached) {
            clearCityBtn._clickAttached = true;
            clearCityBtn.onclick = function() {
                var country = getCurrentCountry();
                if (!country) {
                    _showToast('No country found for this location', 'error');
                    return;
                }
                _confirmDialog('Clear ALL city name parts for ' + country.displayName + '?', 'Clear All City Parts', function() {
                    var parts = _getCityNameParts();
                    parts[country.id] = { prefixes: [], roots: [], suffixes: [] };
                    _setCityNameParts(parts);
                    renderNamesTab(containerId);
                    _showToast('All city parts cleared', 'info');
                });
            };
        }

        var genBtn = document.getElementById('cityGenerateBtn');
        if (genBtn && !genBtn._clickAttached) {
            genBtn._clickAttached = true;
            genBtn.onclick = function() {
                var country = getCurrentCountry();
                if (!country) {
                    _showToast('No country found for this location', 'error');
                    return;
                }
                var names = generateCityNames(country.id);
                var list = document.getElementById('cityGeneratedList');
                if (list && names.length > 0) {
                    list.innerHTML = names.map(function(n) {
                        return '<span style="background:var(--bg);padding:2px 10px;border-radius:12px;font-size:0.5rem;border:1px solid var(--border);">' + _escapeHtml(n) + '</span>';
                    }).join('');
                } else if (list) {
                    list.innerHTML = '<span style="color:var(--dim);font-size:0.5rem;">Need prefixes and roots to generate</span>';
                }
            };
        }

        var copyBtn = document.getElementById('cityCopyBtn');
        if (copyBtn && !copyBtn._clickAttached) {
            copyBtn._clickAttached = true;
            copyBtn.onclick = function() {
                var list = document.getElementById('cityGeneratedList');
                if (list) {
                    var names = Array.from(list.querySelectorAll('span')).map(function(el) { return el.textContent; });
                    if (names.length > 0) {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(names.join('\n'));
                            _showToast('Copied to clipboard', 'success');
                        } else {
                            var text = names.join('\n');
                            var textarea = document.createElement('textarea');
                            textarea.value = text;
                            document.body.appendChild(textarea);
                            textarea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textarea);
                            _showToast('Copied to clipboard', 'success');
                        }
                    }
                }
            };
        }
    }

    // =========================================================================
    // 14. OPEN FILE UPLOAD FUNCTIONS
    // =========================================================================

    function openNameFileUpload(type) {
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
                    
                    var country = getCurrentCountry();
                    if (!country) {
                        _showToast('No country found for this location', 'error');
                        return;
                    }
                    
                    var nameLists = _getNameLists();
                    var countryId = country.id;
                    
                    if (!nameLists[countryId]) nameLists[countryId] = { male: [], female: [], surnames: [] };
                    if (!nameLists[countryId][type]) nameLists[countryId][type] = [];
                    
                    var added = 0;
                    var duplicates = 0;
                    for (var i = 0; i < names.length; i++) {
                        var trimmed = names[i].trim();
                        if (trimmed && nameLists[countryId][type].indexOf(trimmed) === -1) {
                            nameLists[countryId][type].push(trimmed);
                            added++;
                        } else if (trimmed) {
                            duplicates++;
                        }
                    }
                    
                    nameLists[countryId][type].sort();
                    _setNameLists(nameLists);
                    renderNamesTab(containerId || 'namesContent');
                    _showToast('Added ' + added + ' names to ' + type + ' (' + duplicates + ' duplicates skipped)', 'success');
                };
                reader.readAsText(e.target.files[0]);
            }
        };
        input.click();
    }

    function openCityPartsFileUpload(part) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.csv';
        input.onchange = function(e) {
            if (e.target.files[0]) {
                var reader = new FileReader();
                reader.onload = function(ev) {
                    var content = ev.target.result;
                    var items = content.split(/\r?\n|,|\s+/).filter(function(l) { return l.trim().length > 0; });
                    if (content.includes(',')) {
                        var csvItems = content.split(',').map(function(i) { return i.trim().replace(/^["']|["']$/g, ''); });
                        if (csvItems.length > items.length) items = csvItems;
                    }
                    
                    var country = getCurrentCountry();
                    if (!country) {
                        _showToast('No country found for this location', 'error');
                        return;
                    }
                    
                    var cityParts = _getCityNameParts();
                    var countryId = country.id;
                    
                    if (!cityParts[countryId]) cityParts[countryId] = { prefixes: [], roots: [], suffixes: [] };
                    if (!cityParts[countryId][part]) cityParts[countryId][part] = [];
                    
                    var added = 0;
                    var duplicates = 0;
                    for (var i = 0; i < items.length; i++) {
                        var trimmed = items[i].trim();
                        if (trimmed && cityParts[countryId][part].indexOf(trimmed) === -1) {
                            cityParts[countryId][part].push(trimmed);
                            added++;
                        } else if (trimmed) {
                            duplicates++;
                        }
                    }
                    
                    cityParts[countryId][part].sort();
                    _setCityNameParts(cityParts);
                    renderNamesTab(containerId || 'namesContent');
                    _showToast('Added ' + added + ' ' + part + ' (' + duplicates + ' duplicates skipped)', 'success');
                };
                reader.readAsText(e.target.files[0]);
            }
        };
        input.click();
    }

    function generateCityNames(countryId) {
        var cityParts = _getCityNameParts();
        var parts = cityParts[countryId];
        if (!parts || !parts.prefixes || !parts.prefixes.length || !parts.roots || !parts.roots.length) {
            _showToast('Need prefixes and roots to generate names', 'error');
            return [];
        }
        
        var generated = [];
        for (var i = 0; i < 10; i++) {
            var name = parts.prefixes[Math.floor(Math.random() * parts.prefixes.length)];
            name += parts.roots[Math.floor(Math.random() * parts.roots.length)];
            if (parts.suffixes && parts.suffixes.length && Math.random() > 0.6) {
                name += parts.suffixes[Math.floor(Math.random() * parts.suffixes.length)];
            }
            generated.push(name.charAt(0).toUpperCase() + name.slice(1));
        }
        return generated;
    }

    // =========================================================================
    // 15. RESTORE EXPANDED STATE
    // =========================================================================

    function restoreExpandedState() {
        try {
            var saved = localStorage.getItem('namesTab_expanded');
            if (saved) {
                var parsed = JSON.parse(saved);
                namesTabState.expandedSections = { ...namesTabState.expandedSections, ...parsed };
            }
        } catch(e) {}
    }

    restoreExpandedState();

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    window.renderNamesTab = renderNamesTab;
    window.getCountrySurnameRules = getCountrySurnameRules;
    window.setCountrySurnameRules = setCountrySurnameRules;

})();