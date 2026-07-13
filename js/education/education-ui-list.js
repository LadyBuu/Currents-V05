/**
 * =============================================================================
 * STILL WATERS - EDUCATION UI LIST (education-ui-list.js)
 * =============================================================================
 * 
 * LOCATION: js/core/education/education-ui-list.js
 * 
 * UI rendering for education lists, cards, and tables.
 * 
 * DEPENDENCIES:
 *   - education-state.js: EducationState
 *   - education-queries.js: EducationQueries
 *   - education-commands.js: EducationCommands
 *   - formatting.js: escapeHtml
 *   - icons.js: Icons
 *   - modals-core.js: _showToast, _getIcon
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        return '';
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _getAllInstitutions() {
        if (typeof window.EducationState !== 'undefined' &&
            typeof window.EducationState.getAllInstitutions === 'function') {
            return window.EducationState.getAllInstitutions();
        }
        return [];
    }

    function _getInstitution(id) {
        if (typeof window.EducationState !== 'undefined' &&
            typeof window.EducationState.getInstitution === 'function') {
            return window.EducationState.getInstitution(id);
        }
        return null;
    }

    function _getInstitutionDetails(id) {
        if (typeof window.EducationQueries !== 'undefined' &&
            typeof window.EducationQueries.getInstitutionDetails === 'function') {
            return window.EducationQueries.getInstitutionDetails(id);
        }
        return null;
    }

    function _getLocationEducationSummary(locationId) {
        if (typeof window.EducationQueries !== 'undefined' &&
            typeof window.EducationQueries.getLocationEducationSummary === 'function') {
            return window.EducationQueries.getLocationEducationSummary(locationId, false);
        }
        return null;
    }

    function _getCharacterName(id) {
        if (typeof window.getCharacterFullNameById === 'function') {
            return window.getCharacterFullNameById(id);
        }
        if (typeof window.getCharacterById === 'function') {
            var char = window.getCharacterById(id);
            if (char) {
                return char.name + (char.surname ? ' ' + char.surname : '');
            }
        }
        return 'Unknown';
    }

    function _getPlaceName(id) {
        if (typeof window.getPlaceName === 'function') {
            return window.getPlaceName(id);
        }
        if (typeof window.getPlaceById === 'function') {
            var place = window.getPlaceById(id);
            if (place) return place.displayName;
        }
        return 'Unknown';
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    // =========================================================================
    // 3. STATUS HELPERS
    // =========================================================================

    function _getStatusBadge(institution) {
        if (!institution) return '';
        if (institution.status === 'demolished') {
            return '<span style="color:#b54a4a;font-size:0.55rem;padding:2px 8px;border:1px solid #b54a4a;border-radius:4px;">Demolished</span>';
        }
        if (institution.status === 'inactive') {
            return '<span style="color:#b58a4a;font-size:0.55rem;padding:2px 8px;border:1px solid #b58a4a;border-radius:4px;">Inactive</span>';
        }
        return '<span style="color:#4a9e6a;font-size:0.55rem;padding:2px 8px;border:1px solid #4a9e6a;border-radius:4px;">Active</span>';
    }

    function _getOwnershipBadge(institution) {
        if (!institution) return '';
        if (institution.ownershipType === 'public') {
            return '<span style="font-size:0.5rem;padding:2px 6px;background:rgba(74,125,181,0.2);border-radius:4px;color:#4a7db5;">Public</span>';
        } else if (institution.ownershipType === 'private') {
            var owner = institution.ownerName || 'Private';
            return '<span style="font-size:0.5rem;padding:2px 6px;background:rgba(181,164,74,0.2);border-radius:4px;color:#b58a4a;">Private</span>';
        } else if (institution.ownershipType === 'religious') {
            var religionName = institution.religionName || 'Religious';
            return '<span style="font-size:0.5rem;padding:2px 6px;background:rgba(106,158,106,0.2);border-radius:4px;color:#4a9e6a;">Religious</span>';
        }
        return '';
    }

    function _getReputationColor(reputation) {
        if (reputation >= 80) return '#4a9e6a';
        if (reputation >= 60) return '#6a9e6a';
        if (reputation >= 40) return '#b58a4a';
        if (reputation >= 20) return '#b56a4a';
        return '#b54a4a';
    }

    // =========================================================================
    // 4. RENDER INSTITUTION LIST
    // =========================================================================

    function renderInstitutionList(containerId, options) {
        if (_rendering) return false;

        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                return false;
            }

            options = options || {};

            var institutions = options.filteredInstitutions || _getAllInstitutions();

            // Apply filters if provided
            if (options.filters) {
                var filters = options.filters;
                institutions = institutions.filter(function(inst) {
                    // Filter by type
                    if (filters.type && inst.type !== filters.type) return false;
                    // Filter by location
                    if (filters.location && inst.locationId !== filters.location) return false;
                    // Filter by ownership type
                    if (filters.ownershipType && inst.ownershipType !== filters.ownershipType) return false;
                    // Filter by reputation (min)
                    if (filters.minReputation && (inst.reputation || 0) < filters.minReputation) return false;
                    // Filter by search term
                    if (filters.search) {
                        var searchLower = filters.search.toLowerCase();
                        var nameMatch = inst.name.toLowerCase().indexOf(searchLower) !== -1;
                        var descMatch = inst.description && inst.description.toLowerCase().indexOf(searchLower) !== -1;
                        if (!nameMatch && !descMatch) return false;
                    }
                    // Filter by religion (NEW)
                    if (filters.religionId && inst.religionId !== filters.religionId) return false;
                    return true;
                });
            }

            if (!institutions || institutions.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--dim);">' +
                    _escapeHtml(options.emptyMessage || 'No institutions found') +
                    '</div>';
                return true;
            }

            // Sort by reputation (descending) if not specified
            if (!options.sortBy) {
                institutions = institutions.slice().sort(function(a, b) {
                    return (b.reputation || 0) - (a.reputation || 0);
                });
            } else if (options.sortBy === 'name') {
                institutions = institutions.slice().sort(function(a, b) {
                    return a.name.localeCompare(b.name);
                });
            } else if (options.sortBy === 'students') {
                institutions = institutions.slice().sort(function(a, b) {
                    var aCount = a.students ? a.students.filter(function(s) { return !s.graduated; }).length : 0;
                    var bCount = b.students ? b.students.filter(function(s) { return !s.graduated; }).length : 0;
                    return bCount - aCount;
                });
            }

            var html = '';
            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;
            var showActions = options.showActions !== false;
            var showStats = options.showStats !== false;
            var rowClass = options.rowClass || '';

            html += '<div class="institution-list" style="display:flex;flex-direction:column;gap:6px;">';

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                var isSelected = (selectedId === inst.id);
                var isDemolished = inst.status === 'demolished';

                var studentCount = inst.students ? inst.students.filter(function(s) { return !s.graduated; }).length : 0;
                var teacherCount = inst.teachers ? inst.teachers.length : 0;
                var graduateCount = inst.graduates ? inst.graduates.length : 0;
                var reputation = inst.reputation || 50;
                var repColor = _getReputationColor(reputation);

                var locationName = _getPlaceName(inst.locationId);

                var style = '';
                var borderStyle = '';

                if (isSelected) {
                    style += 'background:var(--accent-dim);';
                    borderStyle = 'border:2px solid var(--accent);';
                } else {
                    borderStyle = 'border:1px solid var(--border);';
                }

                if (isDemolished) {
                    style += 'opacity:0.5;';
                }

                html += '<div class="institution-item" data-institution-id="' + inst.id + '" style="' +
                    'display:flex;' +
                    'align-items:center;' +
                    'justify-content:space-between;' +
                    'padding:10px 14px;' +
                    'background:var(--bg2);' +
                    'border-radius:6px;' +
                    'cursor:' + (onSelect ? 'pointer' : 'default') + ';' +
                    'transition:all 0.2s;' +
                    borderStyle +
                    style +
                    '">';

                // Left: Icon, Name, Details
                html += '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">';

                // Icon
                var icon = inst.icon || '⌂';
                html += '<span style="font-size:1rem;' + (isDemolished ? 'opacity:0.5;' : '') + '">' + _escapeHtml(icon) + '</span>';

                // Name and details
                html += '<div style="min-width:0;flex:1;">';
                html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">';
                html += '<span style="font-weight:bold;font-size:0.8rem;' + (isDemolished ? 'text-decoration:line-through;' : '') + '">' + _escapeHtml(inst.name) + '</span>';
                html += _getStatusBadge(inst);
                html += _getOwnershipBadge(inst);
                html += '</div>';

                html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:0.6rem;color:var(--dim);margin-top:2px;">';
                html += '<span>' + _escapeHtml(inst.typeName || inst.type || 'Unknown') + '</span>';
                html += '<span>⌂ ' + _escapeHtml(locationName) + '</span>';
                if (inst.reputation !== undefined) {
                    html += '<span style="color:' + repColor + ';">◉ ' + reputation + '</span>';
                }
                if (inst.curriculum) {
                    html += '<span>📚 ' + inst.curriculum.length + ' subjects</span>';
                }
                // Religious affiliation (NEW)
                if (inst.religionId && inst.religionName) {
                    html += '<span style="color:#4a9e6a;">⌆ ' + _escapeHtml(inst.religionName) + '</span>';
                }
                html += '</div>';

                html += '</div>';

                html += '</div>';

                // Right: Stats and Actions
                html += '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">';

                if (showStats) {
                    html += '<div style="display:flex;gap:8px;font-size:0.5rem;color:var(--dim);">';
                    html += '<span title="Students">👤 ' + studentCount + '</span>';
                    html += '<span title="Teachers">⌇ ' + teacherCount + '</span>';
                    html += '<span title="Graduates">✓ ' + graduateCount + '</span>';
                    if (inst.maxStudents) {
                        var utilization = inst.maxStudents > 0 ? Math.round((studentCount / inst.maxStudents) * 100) : 0;
                        html += '<span title="Capacity">⌂ ' + utilization + '%</span>';
                    }
                    html += '</div>';
                }

                if (showActions) {
                    html += '<div style="display:flex;gap:4px;">';
                    html += '<button class="btn view-institution-btn" data-institution-id="' + inst.id + '" style="' +
                        'background:var(--bg3);' +
                        'border:1px solid var(--border);' +
                        'color:var(--text);' +
                        'padding:3px 8px;' +
                        'border-radius:4px;' +
                        'font-size:0.5rem;' +
                        'cursor:pointer;' +
                        '">View</button>';

                    if (!isDemolished) {
                        html += '<button class="btn edit-institution-btn" data-institution-id="' + inst.id + '" style="' +
                            'background:var(--bg3);' +
                            'border:1px solid var(--border);' +
                            'color:var(--text);' +
                            'padding:3px 8px;' +
                            'border-radius:4px;' +
                            'font-size:0.5rem;' +
                            'cursor:pointer;' +
                            '">Edit</button>';
                    }
                    html += '</div>';
                }

                html += '</div>';

                html += '</div>';
            }

            html += '</div>';

            container.innerHTML = html;

            // Attach click handlers
            if (onSelect) {
                var items = container.querySelectorAll('.institution-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function(e) {
                            if (e.target.closest('button')) return;
                            var id = this.dataset.institutionId;
                            var inst = _getInstitution(id);
                            if (inst && onSelect) {
                                onSelect(inst);
                            }
                        });
                    })(items[i]);
                }
            }

            // Attach view button handlers
            var viewBtns = container.querySelectorAll('.view-institution-btn');
            for (var i = 0; i < viewBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var id = this.dataset.institutionId;
                        if (typeof window.openInstitutionDetailsModal === 'function') {
                            window.openInstitutionDetailsModal(id);
                        } else if (typeof window.openEducationDetailsModal === 'function') {
                            window.openEducationDetailsModal(id);
                        } else {
                            _showToast('Institution details not available', 'warning');
                        }
                    });
                })(viewBtns[i]);
            }

            // Attach edit button handlers
            var editBtns = container.querySelectorAll('.edit-institution-btn');
            for (var i = 0; i < editBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var id = this.dataset.institutionId;
                        if (typeof window.openEditInstitutionModal === 'function') {
                            window.openEditInstitutionModal(id);
                        } else {
                            _showToast('Edit not available', 'warning');
                        }
                    });
                })(editBtns[i]);
            }

            return true;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 5. RENDER INSTITUTION CARD
    // =========================================================================

    function renderInstitutionCard(institutionId, options) {
        if (_rendering) return '';

        _rendering = true;

        try {
            var inst = _getInstitution(institutionId);
            if (!inst) {
                return '<div style="padding:20px;color:var(--dim);">Institution not found</div>';
            }

            options = options || {};
            var compact = options.compact || false;
            var showActions = options.showActions !== false;

            var studentCount = inst.students ? inst.students.filter(function(s) { return !s.graduated; }).length : 0;
            var teacherCount = inst.teachers ? inst.teachers.length : 0;
            var graduateCount = inst.graduates ? inst.graduates.length : 0;
            var reputation = inst.reputation || 50;
            var repColor = _getReputationColor(reputation);
            var locationName = _getPlaceName(inst.locationId);
            var isDemolished = inst.status === 'demolished';

            var headmasterName = inst.headmaster ? _getCharacterName(inst.headmaster.characterId) : 'None';

            var html = '';

            html += '<div class="institution-card" style="' +
                'background:var(--bg2);' +
                'border:1px solid ' + (isDemolished ? '#b54a4a' : 'var(--border)') + ';' +
                'border-radius:8px;' +
                'padding:' + (compact ? '12px' : '18px') + ';' +
                'display:flex;' +
                'flex-direction:column;' +
                'gap:' + (compact ? '6px' : '10px') + ';' +
                (isDemolished ? 'opacity:0.6;' : '') +
                '">';

            // Header
            html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;">';
            html += '<div style="display:flex;align-items:center;gap:8px;">';
            html += '<span style="font-size:' + (compact ? '1.2rem' : '1.5rem') + ';">' + _escapeHtml(inst.icon || '⌂') + '</span>';
            html += '<div>';
            html += '<div style="font-weight:bold;font-size:' + (compact ? '0.85rem' : '1rem') + ';' + (isDemolished ? 'text-decoration:line-through;' : '') + '">' + _escapeHtml(inst.name) + '</div>';
            html += '<div style="font-size:0.6rem;color:var(--dim);">' + _escapeHtml(inst.typeName || inst.type || 'Unknown') + '</div>';
            html += '</div>';
            html += '</div>';

            html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
            html += _getStatusBadge(inst);
            html += _getOwnershipBadge(inst);
            if (inst.religionId && inst.religionName) {
                html += '<span style="font-size:0.5rem;padding:2px 6px;background:rgba(106,158,106,0.2);border-radius:4px;color:#4a9e6a;">⌆ ' + _escapeHtml(inst.religionName) + '</span>';
            }
            html += '</div>';
            html += '</div>';

            // Description
            if (inst.description && !compact) {
                html += '<div style="font-size:0.65rem;color:var(--dim);">' + _escapeHtml(inst.description) + '</div>';
            }

            // Stats
            html += '<div style="display:flex;flex-wrap:wrap;gap:' + (compact ? '6px' : '10px') + ';font-size:0.6rem;border-top:1px solid var(--border-light);padding-top:' + (compact ? '6px' : '8px') + ';">';
            html += '<span>👤 ' + studentCount + ' students</span>';
            html += '<span>⌇ ' + teacherCount + ' teachers</span>';
            html += '<span>✓ ' + graduateCount + ' graduates</span>';
            html += '<span>◉ ' + reputation + ' reputation</span>';
            html += '<span>⌂ ' + _escapeHtml(locationName) + '</span>';
            html += '<span>◉ Headmaster: ' + _escapeHtml(headmasterName) + '</span>';
            if (inst.maxStudents) {
                var utilization = inst.maxStudents > 0 ? Math.round((studentCount / inst.maxStudents) * 100) : 0;
                html += '<span>⌂ ' + utilization + '% capacity</span>';
            }
            if (inst.curriculum) {
                html += '<span>📚 ' + inst.curriculum.length + ' subjects</span>';
            }
            if (inst.isSpecialized && inst.specializationCategory) {
                html += '<span>◉ Specialized: ' + _escapeHtml(inst.specializationCategory) + '</span>';
            }
            if (inst.taughtRoles && inst.taughtRoles.length > 0) {
                html += '<span>◉ ' + inst.taughtRoles.length + ' role(s) taught</span>';
            }
            html += '</div>';

            // Founded year
            if (inst.foundedYear) {
                html += '<div style="font-size:0.5rem;color:var(--dim);">Founded: ' + inst.foundedYear + '</div>';
            }

            // Demolished info
            if (isDemolished && inst.demolishedAt) {
                html += '<div style="font-size:0.5rem;color:#b54a4a;">Demolished: ' + inst.demolishedAt + (inst.demolishedReason ? ' (' + _escapeHtml(inst.demolishedReason) + ')' : '') + '</div>';
            }

            // Actions
            if (showActions) {
                html += '<div style="display:flex;gap:6px;margin-top:' + (compact ? '4px' : '8px') + ';flex-wrap:wrap;">';
                html += '<button class="btn view-institution-btn" data-institution-id="' + inst.id + '" style="' +
                    'background:var(--bg3);' +
                    'border:1px solid var(--border);' +
                    'color:var(--text);' +
                    'padding:4px 10px;' +
                    'border-radius:4px;' +
                    'font-size:0.5rem;' +
                    'cursor:pointer;' +
                    '">View Details</button>';

                if (!isDemolished) {
                    html += '<button class="btn edit-institution-btn" data-institution-id="' + inst.id + '" style="' +
                        'background:var(--bg3);' +
                        'border:1px solid var(--border);' +
                        'color:var(--text);' +
                        'padding:4px 10px;' +
                        'border-radius:4px;' +
                        'font-size:0.5rem;' +
                        'cursor:pointer;' +
                        '">Edit</button>';

                    html += '<button class="btn enroll-student-btn" data-institution-id="' + inst.id + '" style="' +
                        'background:var(--bg3);' +
                        'border:1px solid var(--border);' +
                        'color:var(--text);' +
                        'padding:4px 10px;' +
                        'border-radius:4px;' +
                        'font-size:0.5rem;' +
                        'cursor:pointer;' +
                        '">Enroll Student</button>';

                    html += '<button class="btn hire-teacher-btn" data-institution-id="' + inst.id + '" style="' +
                        'background:var(--bg3);' +
                        'border:1px solid var(--border);' +
                        'color:var(--text);' +
                        'padding:4px 10px;' +
                        'border-radius:4px;' +
                        'font-size:0.5rem;' +
                        'cursor:pointer;' +
                        '">Hire Teacher</button>';
                }
                html += '</div>';
            }

            html += '</div>';

            return html;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 6. RENDER INSTITUTION TABLE
    // =========================================================================

    function renderInstitutionTable(institutions, options) {
        if (_rendering) return '';

        _rendering = true;

        try {
            options = options || {};
            var columns = options.columns || ['name', 'type', 'location', 'students', 'teachers', 'reputation', 'status', 'ownership'];
            var showActions = options.showActions !== false;

            var html = '';

            html += '<table class="institution-table" style="width:100%;border-collapse:collapse;font-size:0.7rem;">';
            html += '<thead style="border-bottom:2px solid var(--border);">';
            html += '<tr style="text-align:left;">';

            for (var i = 0; i < columns.length; i++) {
                var col = columns[i];
                var label = '';
                switch (col) {
                    case 'name': label = 'Name'; break;
                    case 'type': label = 'Type'; break;
                    case 'location': label = 'Location'; break;
                    case 'students': label = 'Students'; break;
                    case 'teachers': label = 'Teachers'; break;
                    case 'graduates': label = 'Graduates'; break;
                    case 'reputation': label = 'Reputation'; break;
                    case 'status': label = 'Status'; break;
                    case 'ownership': label = 'Ownership'; break;
                    case 'religion': label = 'Religion'; break;
                    case 'headmaster': label = 'Headmaster'; break;
                    default: label = col.charAt(0).toUpperCase() + col.slice(1);
                }
                html += '<th style="padding:6px 8px;font-weight:600;color:var(--dim);font-size:0.6rem;">' + _escapeHtml(label) + '</th>';
            }

            if (showActions) {
                html += '<th style="padding:6px 8px;font-weight:600;color:var(--dim);font-size:0.6rem;">Actions</th>';
            }

            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                var isDemolished = inst.status === 'demolished';

                html += '<tr style="' + (isDemolished ? 'opacity:0.5;' : '') + 'border-bottom:1px solid var(--border-light);">';

                for (var j = 0; j < columns.length; j++) {
                    var col = columns[j];
                    html += '<td style="padding:6px 8px;font-size:0.6rem;">';

                    switch (col) {
                        case 'name':
                            html += _escapeHtml(inst.icon || '⌂') + ' ' + _escapeHtml(inst.name);
                            break;
                        case 'type':
                            html += _escapeHtml(inst.typeName || inst.type || 'Unknown');
                            break;
                        case 'location':
                            html += _escapeHtml(_getPlaceName(inst.locationId));
                            break;
                        case 'students':
                            var count = inst.students ? inst.students.filter(function(s) { return !s.graduated; }).length : 0;
                            html += count;
                            break;
                        case 'teachers':
                            html += inst.teachers ? inst.teachers.length : 0;
                            break;
                        case 'graduates':
                            html += inst.graduates ? inst.graduates.length : 0;
                            break;
                        case 'reputation':
                            var rep = inst.reputation || 50;
                            var repColor = _getReputationColor(rep);
                            html += '<span style="color:' + repColor + ';">' + rep + '</span>';
                            break;
                        case 'status':
                            html += _getStatusBadge(inst);
                            break;
                        case 'ownership':
                            html += _getOwnershipBadge(inst);
                            break;
                        case 'religion':
                            if (inst.religionId && inst.religionName) {
                                html += '<span style="color:#4a9e6a;">' + _escapeHtml(inst.religionName) + '</span>';
                            } else {
                                html += '<span style="color:var(--dim);">—</span>';
                            }
                            break;
                        case 'headmaster':
                            if (inst.headmaster) {
                                html += _escapeHtml(_getCharacterName(inst.headmaster.characterId));
                            } else {
                                html += '<span style="color:var(--dim);">None</span>';
                            }
                            break;
                        default:
                            html += '—';
                    }

                    html += '</td>';
                }

                if (showActions) {
                    html += '<td style="padding:6px 8px;">';
                    html += '<div style="display:flex;gap:4px;">';
                    html += '<button class="btn view-institution-btn" data-institution-id="' + inst.id + '" style="' +
                        'background:var(--bg3);' +
                        'border:1px solid var(--border);' +
                        'color:var(--text);' +
                        'padding:2px 6px;' +
                        'border-radius:4px;' +
                        'font-size:0.45rem;' +
                        'cursor:pointer;' +
                        '">View</button>';

                    if (!isDemolished) {
                        html += '<button class="btn edit-institution-btn" data-institution-id="' + inst.id + '" style="' +
                            'background:var(--bg3);' +
                            'border:1px solid var(--border);' +
                            'color:var(--text);' +
                            'padding:2px 6px;' +
                            'border-radius:4px;' +
                            'font-size:0.45rem;' +
                            'cursor:pointer;' +
                            '">Edit</button>';
                    }
                    html += '</div>';
                    html += '</td>';
                }

                html += '</tr>';
            }

            html += '</tbody>';
            html += '</table>';

            return html;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 7. RENDER EDUCATION SUMMARY (for settlements)
    // =========================================================================

    function renderEducationSummary(containerId, locationId, options) {
        if (_rendering) return false;

        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                return false;
            }

            options = options || {};

            var summary = _getLocationEducationSummary(locationId);
            if (!summary) {
                container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--dim);">No education data available</div>';
                return true;
            }

            var health = null;
            if (typeof window.EducationQueries !== 'undefined' &&
                typeof window.EducationQueries.getEducationHealthScore === 'function') {
                health = window.EducationQueries.getEducationHealthScore(locationId);
            }

            var html = '';

            html += '<div class="education-summary" style="display:flex;flex-direction:column;gap:8px;">';

            // Stats grid
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;padding:10px;background:var(--bg);border-radius:6px;">';
            html += '<div style="text-align:center;"><div style="font-size:0.5rem;color:var(--dim);">Institutions</div><div style="font-size:0.9rem;font-weight:bold;">' + summary.institutionCount + '</div></div>';
            html += '<div style="text-align:center;"><div style="font-size:0.5rem;color:var(--dim);">Students</div><div style="font-size:0.9rem;font-weight:bold;">' + summary.totalStudents + '</div></div>';
            html += '<div style="text-align:center;"><div style="font-size:0.5rem;color:var(--dim);">Teachers</div><div style="font-size:0.9rem;font-weight:bold;">' + summary.totalTeachers + '</div></div>';
            html += '<div style="text-align:center;"><div style="font-size:0.5rem;color:var(--dim);">Graduates</div><div style="font-size:0.9rem;font-weight:bold;">' + summary.totalGraduates + '</div></div>';
            html += '<div style="text-align:center;"><div style="font-size:0.5rem;color:var(--dim);">Avg Reputation</div><div style="font-size:0.9rem;font-weight:bold;">' + summary.averageReputation + '</div></div>';
            html += '<div style="text-align:center;"><div style="font-size:0.5rem;color:var(--dim);">Capacity Used</div><div style="font-size:0.9rem;font-weight:bold;">' + summary.capacityUsed + '%</div></div>';
            if (summary.educationBudget !== undefined) {
                html += '<div style="text-align:center;"><div style="font-size:0.5rem;color:var(--dim);">Budget</div><div style="font-size:0.9rem;font-weight:bold;">' + summary.educationBudget + 'g</div></div>';
            }
            html += '</div>';

            // Health score
            if (health) {
                var healthColor = health.score >= 80 ? '#4a9e6a' : (health.score >= 60 ? '#6a9e6a' : (health.score >= 40 ? '#b58a4a' : '#b54a4a'));
                html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg);border-radius:6px;font-size:0.6rem;">';
                html += '<span style="font-weight:bold;">Health Score:</span>';
                html += '<span style="color:' + healthColor + ';font-weight:bold;">' + health.score + '/100</span>';
                html += '<span style="color:var(--dim);">— ' + _escapeHtml(health.recommendation || '') + '</span>';
                if (health.needsMoreSchools) {
                    html += '<span style="color:#b58a4a;font-weight:bold;">⚠️ Needs more schools</span>';
                }
                html += '</div>';
            }

            // Institution list (limited)
            if (summary.institutions && summary.institutions.length > 0) {
                html += '<div style="font-weight:bold;font-size:0.65rem;margin-top:4px;">Institutions:</div>';
                html += '<div style="display:flex;flex-direction:column;gap:4px;">';

                var maxDisplay = options.maxInstitutions || 5;
                var displayInst = summary.institutions.slice(0, maxDisplay);

                for (var i = 0; i < displayInst.length; i++) {
                    var inst = displayInst[i];
                    var studentCount = inst.studentCount || 0;
                    var rep = inst.reputation || 50;
                    var repColor = _getReputationColor(rep);
                    var ownershipType = inst.ownershipType || 'public';
                    var ownershipLabel = ownershipType === 'public' ? 'Public' : (ownershipType === 'private' ? 'Private' : 'Religious');

                    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--bg3);border-radius:4px;font-size:0.55rem;">';
                    html += '<span>' + _escapeHtml(inst.icon || '⌂') + ' ' + _escapeHtml(inst.name) + '</span>';
                    html += '<span style="color:var(--dim);">' + studentCount + ' students · Rep: <span style="color:' + repColor + ';">' + rep + '</span> · ' + ownershipLabel + '</span>';
                    html += '</div>';
                }

                if (summary.institutions.length > maxDisplay) {
                    html += '<div style="text-align:center;font-size:0.5rem;color:var(--dim);">+ ' + (summary.institutions.length - maxDisplay) + ' more</div>';
                }

                html += '</div>';
            }

            html += '</div>';

            container.innerHTML = html;

            // Attach view buttons
            var viewBtns = container.querySelectorAll('.view-institution-btn');
            for (var i = 0; i < viewBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var id = this.dataset.institutionId;
                        if (typeof window.openInstitutionDetailsModal === 'function') {
                            window.openInstitutionDetailsModal(id);
                        }
                    });
                })(viewBtns[i]);
            }

            return true;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 8. RENDER RELIGIOUS SCHOOLS LIST (NEW)
    // =========================================================================

    function renderReligiousSchoolsList(containerId, religionId, options) {
        if (_rendering) return false;

        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                return false;
            }

            options = options || {};

            // Get all institutions filtered by religion
            var allInstitutions = _getAllInstitutions();
            var religiousSchools = allInstitutions.filter(function(inst) {
                return inst.religionId === religionId && inst.ownershipType === 'religious';
            });

            if (religiousSchools.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.7rem;">No religious schools found</div>';
                return true;
            }

            var html = '';
            html += '<div class="religious-schools-list" style="display:flex;flex-direction:column;gap:6px;">';

            for (var i = 0; i < religiousSchools.length; i++) {
                var inst = religiousSchools[i];
                var studentCount = inst.students ? inst.students.filter(function(s) { return !s.graduated; }).length : 0;
                var locationName = _getPlaceName(inst.locationId);
                var isDemolished = inst.status === 'demolished';

                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg3);border-radius:4px;' + (isDemolished ? 'opacity:0.5;' : '') + '">';
                html += '<div style="display:flex;align-items:center;gap:8px;">';
                html += '<span>' + _escapeHtml(inst.icon || '⌂') + '</span>';
                html += '<span style="font-size:0.7rem;' + (isDemolished ? 'text-decoration:line-through;' : '') + '">' + _escapeHtml(inst.name) + '</span>';
                html += _getOwnershipBadge(inst);
                html += _getStatusBadge(inst);
                html += '</div>';
                html += '<div style="display:flex;align-items:center;gap:12px;font-size:0.55rem;color:var(--dim);">';
                html += '<span>👤 ' + studentCount + ' students</span>';
                html += '<span>⌂ ' + _escapeHtml(locationName) + '</span>';
                html += '<button class="btn view-institution-btn" data-institution-id="' + inst.id + '" style="' +
                    'background:var(--bg3);' +
                    'border:1px solid var(--border);' +
                    'color:var(--text);' +
                    'padding:2px 8px;' +
                    'border-radius:4px;' +
                    'font-size:0.5rem;' +
                    'cursor:pointer;' +
                    '">View</button>';
                html += '</div>';
                html += '</div>';
            }

            html += '</div>';

            container.innerHTML = html;

            // Attach view buttons
            var viewBtns = container.querySelectorAll('.view-institution-btn');
            for (var i = 0; i < viewBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var id = this.dataset.institutionId;
                        if (typeof window.openInstitutionDetailsModal === 'function') {
                            window.openInstitutionDetailsModal(id);
                        }
                    });
                })(viewBtns[i]);
            }

            return true;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 9. REFRESH FUNCTIONS
    // =========================================================================

    var _refreshTimeout = null;

    function refreshEducationList(containerId, options) {
        if (_refreshTimeout) {
            clearTimeout(_refreshTimeout);
        }

        _refreshTimeout = setTimeout(function() {
            renderInstitutionList(containerId, options);
            _refreshTimeout = null;
        }, 50);
    }

    function debouncedRefresh(containerId, options) {
        refreshEducationList(containerId, options);
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.EducationUI = {
        renderInstitutionList: renderInstitutionList,
        renderInstitutionCard: renderInstitutionCard,
        renderInstitutionTable: renderInstitutionTable,
        renderEducationSummary: renderEducationSummary,
        renderReligiousSchoolsList: renderReligiousSchoolsList,
        refreshEducationList: refreshEducationList,
        debouncedRefresh: debouncedRefresh,

        // Helpers
        getStatusBadge: _getStatusBadge,
        getOwnershipBadge: _getOwnershipBadge,
        getReputationColor: _getReputationColor
    };

    // Legacy aliases
    window._renderEducationList = renderInstitutionList;
    window._renderEducationCard = renderInstitutionCard;
    window._renderEducationTable = renderInstitutionTable;
    window._renderEducationSummary = renderEducationSummary;
    window._refreshEducationList = refreshEducationList;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            EducationUI: window.EducationUI
        };
    }

})();