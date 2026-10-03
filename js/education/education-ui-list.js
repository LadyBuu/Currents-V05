/**
 * STILL WATERS - EDUCATION UI LIST
 * Renders institution lists, cards, tables, summaries, and history timelines.
 * Reads through EducationQueries and EducationHistory only.
 * No state, no commands, no policy.
 */

(function() {
    'use strict';

    // --- Dependencies: required. ---

    function _queries() {
        if (typeof window.EducationQueries === 'undefined') {
            throw new Error('education-ui-list.js requires EducationQueries');
        }
        return window.EducationQueries;
    }

    function _history() {
        if (typeof window.EducationHistory === 'undefined') {
            throw new Error('education-ui-list.js requires EducationHistory');
        }
        return window.EducationHistory;
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
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
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        return '';
    }

    function _getIconOr(name, fallback) {
        return _getIcon(name) || _getIcon(fallback);
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') window._showToast(message, type);
        else if (typeof window.showToast === 'function') window.showToast(message, type);
    }

    function _eventTypes() {
        return window.HISTORY_EVENT_TYPES || {};
    }

    // --- Summary normalization ---

    function _resolveSummary(instOrId) {
        if (instOrId === null || instOrId === undefined) return null;
        if (typeof instOrId === 'string') return _queries().getInstitution(instOrId);
        return instOrId;
    }

    // --- Status / ownership presentation ---

    function _getStatusBadge(status) {
        if (status === 'demolished') {
            return '<span style="color:#b54a4a;font-size:0.55rem;padding:2px 8px;border:1px solid #b54a4a;border-radius:4px;">Demolished</span>';
        }
        if (status === 'inactive') {
            return '<span style="color:#b58a4a;font-size:0.55rem;padding:2px 8px;border:1px solid #b58a4a;border-radius:4px;">Inactive</span>';
        }
        return '<span style="color:#4a9e6a;font-size:0.55rem;padding:2px 8px;border:1px solid #4a9e6a;border-radius:4px;">Active</span>';
    }

    function _getOwnershipBadge(ownershipType, ownerName) {
        switch (ownershipType) {
            case 'public':
                return '<span style="font-size:0.5rem;padding:2px 6px;background:rgba(74,125,181,0.2);border-radius:4px;color:#4a7db5;">Public</span>';
            case 'private':
                return '<span style="font-size:0.5rem;padding:2px 6px;background:rgba(181,164,74,0.2);border-radius:4px;color:#b58a4a;">Private' +
                    (ownerName ? ' · ' + _escapeHtml(ownerName) : '') +
                    '</span>';
            case 'religious':
                return '<span style="font-size:0.5rem;padding:2px 6px;background:rgba(106,158,106,0.2);border-radius:4px;color:#4a9e6a;">Religious</span>';
            default:
                return '<span style="font-size:0.5rem;padding:2px 6px;background:var(--bg3);border-radius:4px;color:var(--dim);">Unknown</span>';
        }
    }

    function _getReputationColor(reputation) {
        if (reputation >= 80) return '#4a9e6a';
        if (reputation >= 60) return '#6a9e6a';
        if (reputation >= 40) return '#b58a4a';
        if (reputation >= 20) return '#b56a4a';
        return '#b54a4a';
    }

    // --- Presentation sorting ---

    function _sortInstitutions(list, sortBy) {
        var copy = list.slice();
        if (sortBy === 'name') {
            copy.sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
        } else if (sortBy === 'students') {
            copy.sort(function(a, b) { return (b.currentStudentCount || 0) - (a.currentStudentCount || 0); });
        } else {
            copy.sort(function(a, b) { return (b.reputation || 0) - (a.reputation || 0); });
        }
        return copy;
    }

    // =====================================================================
    // Institution list
    // =====================================================================

    function renderInstitutionList(containerId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return false;

        var institutions;
        if (options.institutions) {
            institutions = options.institutions;
        } else {
            institutions = _queries().getInstitutions(options.filters || {});
        }

        if (!institutions || institutions.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--dim);">' +
                _escapeHtml(options.emptyMessage || 'No institutions found') +
                '</div>';
            return true;
        }

        institutions = _sortInstitutions(institutions, options.sortBy);

        var onSelect = options.onSelect || null;
        var selectedId = options.selectedId || null;
        var showActions = options.showActions !== false;
        var showStats = options.showStats !== false;

        var html = '<div class="institution-list" style="display:flex;flex-direction:column;gap:6px;">';

        for (var i = 0; i < institutions.length; i++) {
            var inst = institutions[i];
            var isSelected = (selectedId === inst.id);
            var isDemolished = inst.status === 'demolished';

            var repColor = _getReputationColor(inst.reputation);

            var borderStyle = isSelected ? 'border:2px solid var(--accent);' : 'border:1px solid var(--border);';
            var background = isSelected ? 'background:var(--accent-dim);' : 'background:var(--bg2);';
            var opacity = isDemolished ? 'opacity:0.5;' : '';

            html += '<div class="institution-item" data-institution-id="' + _escapeHtml(inst.id) + '" style="' +
                'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:6px;' +
                'cursor:' + (onSelect ? 'pointer' : 'default') + ';transition:all 0.2s;' +
                borderStyle + background + opacity + '">';

            html += '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">';
            html += '<span style="font-size:1rem;' + (isDemolished ? 'opacity:0.5;' : '') + '">' +
                _getIconOr('HOME', 'CIRCLE_DOT') + '</span>';

            html += '<div style="min-width:0;flex:1;">';
            html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">';
            html += '<span style="font-weight:bold;font-size:0.8rem;' + (isDemolished ? 'text-decoration:line-through;' : '') + '">' +
                _escapeHtml(inst.name) + '</span>';
            html += _getStatusBadge(inst.status);
            html += _getOwnershipBadge(inst.ownershipType, inst.ownerName);
            html += '</div>';

            html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:0.6rem;color:var(--dim);margin-top:2px;">';
            html += '<span>' + _escapeHtml(inst.typeName || 'Unknown') + '</span>';
            html += '<span>' + _getIcon('LOCATION') + ' ' + _escapeHtml(inst.locationName) + '</span>';
            html += '<span style="color:' + repColor + ';">' + _getIcon('STAR_4') + ' ' + inst.reputation + '</span>';
            if (inst.curriculumCount) {
                html += '<span>' + _getIcon('GEAR') + ' ' + inst.curriculumCount + ' subjects</span>';
            }
            if (inst.isReligiousSchool && inst.religionName) {
                html += '<span style="color:#4a9e6a;">' + _getIconOr('CHURCH', 'HOME') + ' ' + _escapeHtml(inst.religionName) + '</span>';
            }
            html += '</div>';

            html += '</div></div>';

            html += '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">';

            if (showStats) {
                html += '<div style="display:flex;gap:8px;font-size:0.5rem;color:var(--dim);">';
                html += '<span title="Students">' + _getIcon('PERSON') + ' ' + inst.currentStudentCount + '</span>';
                html += '<span title="Teachers">' + _getIconOr('TEACHER', 'PERSON') + ' ' + inst.teacherCount + '</span>';
                html += '<span title="Graduates">' + _getIconOr('GRADUATE', 'CHECK_SIMPLE') + ' ' + inst.graduateCount + '</span>';
                if (inst.maxStudents > 0) {
                    html += '<span title="Capacity">' + _getIcon('HOME') + ' ' + inst.utilization + '%</span>';
                }
                html += '</div>';
            }

            if (showActions) {
                html += '<div style="display:flex;gap:4px;">';
                html += '<button class="btn view-institution-btn" data-institution-id="' + _escapeHtml(inst.id) + '" style="' +
                    'background:var(--bg3);border:1px solid var(--border);color:var(--text);' +
                    'padding:3px 8px;border-radius:4px;font-size:0.5rem;cursor:pointer;">View</button>';
                if (!isDemolished) {
                    html += '<button class="btn edit-institution-btn" data-institution-id="' + _escapeHtml(inst.id) + '" style="' +
                        'background:var(--bg3);border:1px solid var(--border);color:var(--text);' +
                        'padding:3px 8px;border-radius:4px;font-size:0.5rem;cursor:pointer;">Edit</button>';
                }
                html += '</div>';
            }

            html += '</div></div>';
        }

        html += '</div>';
        container.innerHTML = html;

        if (onSelect) {
            var items = container.querySelectorAll('.institution-item');
            for (var i = 0; i < items.length; i++) {
                (function(item) {
                    item.addEventListener('click', function(e) {
                        if (e.target.closest('button')) return;
                        var id = this.dataset.institutionId;
                        var summary = _queries().getInstitution(id);
                        if (summary && onSelect) onSelect(summary);
                    });
                })(items[i]);
            }
        }

        var viewBtns = container.querySelectorAll('.view-institution-btn');
        for (var i = 0; i < viewBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var id = this.dataset.institutionId;
                    if (typeof window.openInstitutionDetailsModal === 'function') {
                        window.openInstitutionDetailsModal(id);
                    } else {
                        _showToast('Institution details not available', 'warning');
                    }
                });
            })(viewBtns[i]);
        }

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
    }

    // =====================================================================
    // Institution card
    // =====================================================================

    function renderInstitutionCard(institutionOrId, options) {
        options = options || {};
        var inst = _resolveSummary(institutionOrId);
        if (!inst) {
            return '<div style="padding:20px;color:var(--dim);">Institution not found</div>';
        }

        var compact = options.compact || false;
        var showActions = options.showActions !== false;
        var isDemolished = inst.status === 'demolished';
        var repColor = _getReputationColor(inst.reputation);

        var html = '';
        html += '<div class="institution-card" style="' +
            'background:var(--bg2);' +
            'border:1px solid ' + (isDemolished ? '#b54a4a' : 'var(--border)') + ';' +
            'border-radius:8px;' +
            'padding:' + (compact ? '12px' : '18px') + ';' +
            'display:flex;flex-direction:column;gap:' + (compact ? '6px' : '10px') + ';' +
            (isDemolished ? 'opacity:0.6;' : '') + '">';

        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;">';
        html += '<div style="display:flex;align-items:center;gap:8px;">';
        html += '<span style="font-size:' + (compact ? '1.2rem' : '1.5rem') + ';">' + _getIconOr('HOME', 'CIRCLE_DOT') + '</span>';
        html += '<div>';
        html += '<div style="font-weight:bold;font-size:' + (compact ? '0.85rem' : '1rem') + ';' + (isDemolished ? 'text-decoration:line-through;' : '') + '">' +
            _escapeHtml(inst.name) + '</div>';
        html += '<div style="font-size:0.6rem;color:var(--dim);">' + _escapeHtml(inst.typeName || 'Unknown') + '</div>';
        html += '</div></div>';

        html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
        html += _getStatusBadge(inst.status);
        html += _getOwnershipBadge(inst.ownershipType, inst.ownerName);
        if (inst.isReligiousSchool && inst.religionName) {
            html += '<span style="font-size:0.5rem;padding:2px 6px;background:rgba(106,158,106,0.2);border-radius:4px;color:#4a9e6a;">' +
                _getIconOr('CHURCH', 'HOME') + ' ' + _escapeHtml(inst.religionName) + '</span>';
        }
        html += '</div>';
        html += '</div>';

        if (inst.description && !compact) {
            html += '<div style="font-size:0.65rem;color:var(--dim);">' + _escapeHtml(inst.description) + '</div>';
        }

        html += '<div style="display:flex;flex-wrap:wrap;gap:' + (compact ? '6px' : '10px') + ';font-size:0.6rem;' +
            'border-top:1px solid var(--border-light);padding-top:' + (compact ? '6px' : '8px') + ';">';
        html += '<span>' + _getIcon('PERSON') + ' ' + inst.currentStudentCount + ' students</span>';
        html += '<span>' + _getIconOr('TEACHER', 'PERSON') + ' ' + inst.teacherCount + ' teachers</span>';
        html += '<span>' + _getIconOr('GRADUATE', 'CHECK_SIMPLE') + ' ' + inst.graduateCount + ' graduates</span>';
        html += '<span style="color:' + repColor + ';">' + _getIcon('STAR_4') + ' ' + inst.reputation + ' reputation</span>';
        html += '<span>' + _getIcon('LOCATION') + ' ' + _escapeHtml(inst.locationName) + '</span>';
        if (inst.headmasterName) {
            html += '<span>' + _getIcon('CROWN') + ' ' + _escapeHtml(inst.headmasterName) + '</span>';
        }
        if (inst.maxStudents > 0) {
            html += '<span>' + _getIcon('HOME') + ' ' + inst.utilization + '% capacity</span>';
        }
        if (inst.curriculumCount) {
            html += '<span>' + _getIcon('GEAR') + ' ' + inst.curriculumCount + ' subjects</span>';
        }
        if (inst.isSpecialized && inst.specializationCategory) {
            html += '<span>' + _getIcon('CIRCLE_DOT') + ' Specialized: ' + _escapeHtml(inst.specializationCategory) + '</span>';
        }
        if (inst.taughtRoleCount) {
            html += '<span>' + _getIcon('CIRCLE_DOT') + ' ' + inst.taughtRoleCount + ' role(s) taught</span>';
        }
        html += '</div>';

        if (inst.foundedYear) {
            html += '<div style="font-size:0.5rem;color:var(--dim);">Founded: ' + _escapeHtml(String(inst.foundedYear)) + '</div>';
        }

        if (isDemolished && inst.demolishedAt) {
            html += '<div style="font-size:0.5rem;color:#b54a4a;">Demolished: ' + _escapeHtml(String(inst.demolishedAt)) +
                (inst.demolishedReason ? ' (' + _escapeHtml(inst.demolishedReason) + ')' : '') + '</div>';
        }

        if (showActions) {
            html += '<div style="display:flex;gap:6px;margin-top:' + (compact ? '4px' : '8px') + ';flex-wrap:wrap;">';
            html += '<button class="btn view-institution-btn" data-institution-id="' + _escapeHtml(inst.id) + '" style="' +
                'background:var(--bg3);border:1px solid var(--border);color:var(--text);' +
                'padding:4px 10px;border-radius:4px;font-size:0.5rem;cursor:pointer;">View Details</button>';
            if (!isDemolished) {
                html += '<button class="btn edit-institution-btn" data-institution-id="' + _escapeHtml(inst.id) + '" style="' +
                    'background:var(--bg3);border:1px solid var(--border);color:var(--text);' +
                    'padding:4px 10px;border-radius:4px;font-size:0.5rem;cursor:pointer;">Edit</button>';
                html += '<button class="btn enroll-student-btn" data-institution-id="' + _escapeHtml(inst.id) + '" style="' +
                    'background:var(--bg3);border:1px solid var(--border);color:var(--text);' +
                    'padding:4px 10px;border-radius:4px;font-size:0.5rem;cursor:pointer;">Enroll Student</button>';
                html += '<button class="btn hire-teacher-btn" data-institution-id="' + _escapeHtml(inst.id) + '" style="' +
                    'background:var(--bg3);border:1px solid var(--border);color:var(--text);' +
                    'padding:4px 10px;border-radius:4px;font-size:0.5rem;cursor:pointer;">Hire Teacher</button>';
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // =====================================================================
    // Institution table
    // =====================================================================

    function renderInstitutionTable(institutions, options) {
        options = options || {};
        var columns = options.columns || ['name', 'type', 'location', 'students', 'teachers', 'reputation', 'status', 'ownership'];
        var showActions = options.showActions !== false;

        var html = '<table class="institution-table" style="width:100%;border-collapse:collapse;font-size:0.7rem;">';
        html += '<thead style="border-bottom:2px solid var(--border);">';
        html += '<tr style="text-align:left;">';

        for (var i = 0; i < columns.length; i++) {
            html += '<th style="padding:6px 8px;font-weight:600;color:var(--dim);font-size:0.6rem;">' +
                _escapeHtml(_columnLabel(columns[i])) + '</th>';
        }

        if (showActions) {
            html += '<th style="padding:6px 8px;font-weight:600;color:var(--dim);font-size:0.6rem;">Actions</th>';
        }

        html += '</tr></thead><tbody>';

        for (var i = 0; i < institutions.length; i++) {
            var inst = institutions[i];
            var isDemolished = inst.status === 'demolished';

            html += '<tr style="' + (isDemolished ? 'opacity:0.5;' : '') + 'border-bottom:1px solid var(--border-light);">';

            for (var j = 0; j < columns.length; j++) {
                html += '<td style="padding:6px 8px;font-size:0.6rem;">' + _columnCell(columns[j], inst) + '</td>';
            }

            if (showActions) {
                html += '<td style="padding:6px 8px;"><div style="display:flex;gap:4px;">';
                html += '<button class="btn view-institution-btn" data-institution-id="' + _escapeHtml(inst.id) + '" style="' +
                    'background:var(--bg3);border:1px solid var(--border);color:var(--text);' +
                    'padding:2px 6px;border-radius:4px;font-size:0.45rem;cursor:pointer;">View</button>';
                if (!isDemolished) {
                    html += '<button class="btn edit-institution-btn" data-institution-id="' + _escapeHtml(inst.id) + '" style="' +
                        'background:var(--bg3);border:1px solid var(--border);color:var(--text);' +
                        'padding:2px 6px;border-radius:4px;font-size:0.45rem;cursor:pointer;">Edit</button>';
                }
                html += '</div></td>';
            }

            html += '</tr>';
        }

        html += '</tbody></table>';
        return html;
    }

    function _columnLabel(col) {
        switch (col) {
            case 'name': return 'Name';
            case 'type': return 'Type';
            case 'location': return 'Location';
            case 'students': return 'Students';
            case 'teachers': return 'Teachers';
            case 'graduates': return 'Graduates';
            case 'reputation': return 'Reputation';
            case 'status': return 'Status';
            case 'ownership': return 'Ownership';
            case 'religion': return 'Religion';
            case 'headmaster': return 'Headmaster';
            default: return col.charAt(0).toUpperCase() + col.slice(1);
        }
    }

    function _columnCell(col, inst) {
        switch (col) {
            case 'name':
                return _getIconOr('HOME', 'CIRCLE_DOT') + ' ' + _escapeHtml(inst.name);
            case 'type':
                return _escapeHtml(inst.typeName || 'Unknown');
            case 'location':
                return _escapeHtml(inst.locationName);
            case 'students':
                return String(inst.currentStudentCount);
            case 'teachers':
                return String(inst.teacherCount);
            case 'graduates':
                return String(inst.graduateCount);
            case 'reputation':
                return '<span style="color:' + _getReputationColor(inst.reputation) + ';">' + inst.reputation + '</span>';
            case 'status':
                return _getStatusBadge(inst.status);
            case 'ownership':
                return _getOwnershipBadge(inst.ownershipType, inst.ownerName);
            case 'religion':
                return (inst.religionId && inst.religionName)
                    ? '<span style="color:#4a9e6a;">' + _escapeHtml(inst.religionName) + '</span>'
                    : '<span style="color:var(--dim);">—</span>';
            case 'headmaster':
                return inst.headmasterName
                    ? _escapeHtml(inst.headmasterName)
                    : '<span style="color:var(--dim);">None</span>';
            default:
                return '—';
        }
    }

    // =====================================================================
    // Location education summary
    // =====================================================================

    function renderEducationSummary(containerId, locationId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return false;

        var summary = _queries().getLocationEducationSummary(locationId, false);
        if (!summary) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--dim);">No education data available</div>';
            return true;
        }

        var health = _queries().getEducationHealthScore(locationId);

        var html = '<div class="education-summary" style="display:flex;flex-direction:column;gap:8px;">';

        html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;padding:10px;background:var(--bg);border-radius:6px;">';
        html += _statCell('Institutions', summary.institutionCount);
        html += _statCell('Students', summary.currentStudents);
        html += _statCell('Teachers', summary.totalTeachers);
        html += _statCell('Graduates', summary.totalGraduates);
        html += _statCell('Avg Reputation', summary.averageReputation);
        html += _statCell('Capacity Used', summary.capacityUsed + '%');
        if (summary.educationBudget !== null && summary.educationBudget !== undefined) {
            html += _statCell('Budget', summary.educationBudget + 'g');
        }
        html += '</div>';

        if (health) {
            var healthColor = health.score >= 80 ? '#4a9e6a'
                : health.score >= 60 ? '#6a9e6a'
                : health.score >= 40 ? '#b58a4a'
                : '#b54a4a';

            html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg);border-radius:6px;font-size:0.6rem;flex-wrap:wrap;">';
            html += '<span style="font-weight:bold;">Health Score:</span>';
            html += '<span style="color:' + healthColor + ';font-weight:bold;">' + health.score + '/100</span>';
            html += '<span style="color:var(--dim);">— ' + _escapeHtml(health.recommendation || '') + '</span>';
            if (health.needsMoreSchools) {
                html += '<span style="color:#b58a4a;font-weight:bold;">' + _getIcon('WARNING') + ' Needs more schools</span>';
            }
            html += '</div>';
        }

        if (summary.institutions && summary.institutions.length > 0) {
            html += '<div style="font-weight:bold;font-size:0.65rem;margin-top:4px;">Institutions:</div>';
            html += '<div style="display:flex;flex-direction:column;gap:4px;">';

            var maxDisplay = options.maxInstitutions || 5;
            var displayInst = summary.institutions.slice(0, maxDisplay);

            for (var i = 0; i < displayInst.length; i++) {
                var inst = displayInst[i];
                var repColor = _getReputationColor(inst.reputation);
                var ownershipLabel = _ownershipLabel(inst.ownershipType);

                html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--bg3);border-radius:4px;font-size:0.55rem;">';
                html += '<span>' + _getIconOr('HOME', 'CIRCLE_DOT') + ' ' + _escapeHtml(inst.name) + '</span>';
                html += '<span style="color:var(--dim);">' + inst.currentStudentCount + ' students · ' +
                    '<span style="color:' + repColor + ';">Rep: ' + inst.reputation + '</span> · ' +
                    _escapeHtml(ownershipLabel) + '</span>';
                html += '</div>';
            }

            if (summary.institutions.length > maxDisplay) {
                html += '<div style="text-align:center;font-size:0.5rem;color:var(--dim);">+ ' +
                    (summary.institutions.length - maxDisplay) + ' more</div>';
            }

            html += '</div>';
        }

        html += '</div>';
        container.innerHTML = html;
        return true;
    }

    function _statCell(label, value) {
        return '<div style="text-align:center;">' +
            '<div style="font-size:0.5rem;color:var(--dim);">' + _escapeHtml(label) + '</div>' +
            '<div style="font-size:0.9rem;font-weight:bold;">' + _escapeHtml(String(value)) + '</div>' +
            '</div>';
    }

    function _ownershipLabel(ownershipType) {
        switch (ownershipType) {
            case 'public': return 'Public';
            case 'private': return 'Private';
            case 'religious': return 'Religious';
            default: return 'Unknown';
        }
    }

    // =====================================================================
    // Religious schools list
    // =====================================================================

    function renderReligiousSchoolsList(containerId, religionId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return false;

        var schools = _queries().getReligiousInstitutions(religionId);

        if (!schools || schools.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.7rem;">No religious schools found</div>';
            return true;
        }

        var html = '<div class="religious-schools-list" style="display:flex;flex-direction:column;gap:6px;">';

        for (var i = 0; i < schools.length; i++) {
            var inst = schools[i];
            var isDemolished = inst.status === 'demolished';

            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg3);border-radius:4px;' +
                (isDemolished ? 'opacity:0.5;' : '') + '">';

            html += '<div style="display:flex;align-items:center;gap:8px;">';
            html += '<span>' + _getIconOr('CHURCH', 'HOME') + '</span>';
            html += '<span style="font-size:0.7rem;' + (isDemolished ? 'text-decoration:line-through;' : '') + '">' +
                _escapeHtml(inst.name) + '</span>';
            html += _getOwnershipBadge(inst.ownershipType, inst.ownerName);
            html += _getStatusBadge(inst.status);
            html += '</div>';

            html += '<div style="display:flex;align-items:center;gap:12px;font-size:0.55rem;color:var(--dim);">';
            html += '<span>' + _getIcon('PERSON') + ' ' + inst.currentStudentCount + ' students</span>';
            html += '<span>' + _getIcon('LOCATION') + ' ' + _escapeHtml(inst.locationName) + '</span>';
            html += '<button class="btn view-institution-btn" data-institution-id="' + _escapeHtml(inst.id) + '" style="' +
                'background:var(--bg3);border:1px solid var(--border);color:var(--text);' +
                'padding:2px 8px;border-radius:4px;font-size:0.5rem;cursor:pointer;">View</button>';
            html += '</div>';

            html += '</div>';
        }

        html += '</div>';
        container.innerHTML = html;

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
    }

    // =====================================================================
    // History rendering
    // =====================================================================
    // Renders event timelines produced by EducationHistory. The domain
    // module returns structured events; these functions produce the markup.

    // Per-type label and color. Keyed by HISTORY_EVENT_TYPES values.
    function _eventStyle(type) {
        var T = _eventTypes();
        switch (type) {
            case T.TEACHER_HIRED:
                return { label: 'Teacher hired', color: '#4a9e6a', icon: _getIcon('PERSON') };
            case T.TEACHER_DEPARTED:
                return { label: 'Teacher departed', color: '#c84444', icon: _getIcon('PERSON') };
            case T.STUDENT_ENROLLED:
                return { label: 'Student enrolled', color: '#4a7db5', icon: _getIcon('PERSON') };
            case T.STUDENT_GRADUATED:
                return { label: 'Student graduated', color: '#c8a844', icon: _getIconOr('GRADUATE', 'CHECK_SIMPLE') };
            case T.STUDENT_WITHDREW:
                return { label: 'Student withdrew', color: '#c87040', icon: _getIcon('PERSON') };
            case T.STUDENT_BECAME_LITERATE:
                return { label: 'Became literate', color: '#6a9e6a', icon: _getIcon('PERSON') };
            case T.HEADMASTER_APPOINTED:
                return { label: 'Headmaster appointed', color: '#6a9ecf', icon: _getIcon('CROWN') };
            case T.HEADMASTER_ENDED:
                return { label: 'Headmaster term ended', color: '#8a5a20', icon: _getIcon('CROWN') };
            case T.INSTITUTION_RENAMED:
                return { label: 'Renamed', color: '#6a7a8a', icon: _getIcon('EDIT') };
            case T.INSTITUTION_MOVED:
                return { label: 'Relocated', color: '#6a7a8a', icon: _getIcon('LOCATION') };
            case T.INSTITUTION_DEMOLISHED:
                return { label: 'Demolished', color: '#b54a4a', icon: _getIcon('WARNING') };
            case T.INSTITUTION_REBUILT:
                return { label: 'Rebuilt', color: '#4a9e6a', icon: _getIconOr('HOME', 'CIRCLE_DOT') };
            case T.REPUTATION_CHANGED:
                return { label: 'Reputation changed', color: '#8a7a5a', icon: _getIcon('STAR_4') };
            default:
                return { label: type || 'Event', color: 'var(--border)', icon: _getIcon('CIRCLE_DOT') };
        }
    }

    // Renders one event row.
    function _eventRow(e) {
        var style = _eventStyle(e.type);
        var entityDisplay = e.entityName
            ? ' <strong>' + _escapeHtml(e.entityName) + '</strong>'
            : '';
        var details = e.details ? ' <span style="color:var(--dim);">— ' + _escapeHtml(e.details) + '</span>' : '';
        var reason = e.reason && e.reason !== e.details
            ? ' <span style="color:var(--dim);font-size:0.5rem;">(' + _escapeHtml(e.reason) + ')</span>'
            : '';

        var metaLine = '';
        if (e.metadata && typeof e.metadata === 'object') {
            var parts = [];
            for (var k in e.metadata) {
                if (!e.metadata.hasOwnProperty(k)) continue;
                var v = e.metadata[k];
                if (v === null || v === undefined || v === '') continue;
                parts.push(_escapeHtml(k) + ': ' + _escapeHtml(String(v)));
            }
            if (parts.length) {
                metaLine = '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">' +
                    parts.join(' · ') + '</div>';
            }
        }

        var valueLine = '';
        if (e.previousValue !== null && e.previousValue !== undefined &&
            e.newValue !== null && e.newValue !== undefined) {
            valueLine = ' <span style="color:var(--dim);font-size:0.55rem;">' +
                _escapeHtml(String(e.previousValue)) + ' → ' + _escapeHtml(String(e.newValue)) +
                '</span>';
        }

        return '<div class="education-history-event" style="' +
            'display:flex;align-items:flex-start;gap:8px;padding:6px 10px;' +
            'background:var(--bg3);border-left:3px solid ' + style.color + ';border-radius:4px;font-size:0.55rem;">' +
            '<span style="min-width:40px;color:var(--dim);font-weight:bold;">' + _escapeHtml(String(e.year)) + '</span>' +
            '<span style="color:' + style.color + ';">' + style.icon + '</span>' +
            '<span style="flex:1;">' +
            '<span style="color:var(--accent);">' + _escapeHtml(style.label) + '</span>' +
            entityDisplay + details + valueLine + reason +
            metaLine +
            '</span></div>';
    }

    // Renders a list of events, optionally grouped by year.
    function _renderEventList(events, options) {
        options = options || {};
        var emptyMessage = options.emptyMessage || 'No recorded events';

        if (!events || events.length === 0) {
            return '<div style="color:var(--dim);font-size:0.55rem;padding:8px;text-align:center;">' +
                _escapeHtml(emptyMessage) + '</div>';
        }

        if (options.groupByYear === false) {
            var flat = '<div style="display:flex;flex-direction:column;gap:4px;">';
            for (var i = 0; i < events.length; i++) {
                flat += _eventRow(events[i]);
            }
            flat += '</div>';
            return flat;
        }

        // Group by year, preserving sort order (events already sorted).
        var byYear = {};
        var yearOrder = [];
        for (var i = 0; i < events.length; i++) {
            var y = events[i].year;
            if (!byYear[y]) { byYear[y] = []; yearOrder.push(y); }
            byYear[y].push(events[i]);
        }

        var html = '<div style="display:flex;flex-direction:column;gap:12px;">';
        for (var yi = 0; yi < yearOrder.length; yi++) {
            var year = yearOrder[yi];
            html += '<div>';
            html += '<div style="font-size:0.6rem;font-weight:bold;color:var(--accent);margin-bottom:4px;">' +
                _escapeHtml(String(year)) + '</div>';
            html += '<div style="display:flex;flex-direction:column;gap:4px;">';
            for (var i = 0; i < byYear[year].length; i++) {
                html += _eventRow(byYear[year][i]);
            }
            html += '</div></div>';
        }
        html += '</div>';
        return html;
    }

    /**
     * Render institution history timeline into a container.
     *
     * Options:
     *   maxEvents    Max events to display. Default 50.
     *   type         Filter by event type.
     *   groupByYear  Group events under year headers. Default true.
     *   emptyMessage Message when no events.
     */
    function renderInstitutionHistory(containerId, institutionId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return false;

        var limit = options.maxEvents || 50;
        var events = _history().getInstitutionHistory(institutionId, {
            type: options.type,
            limit: limit
        });

        container.innerHTML = _renderEventList(events, {
            groupByYear: options.groupByYear !== false,
            emptyMessage: options.emptyMessage || 'No recorded events'
        });
        return true;
    }

    /**
     * Render a character's teaching employment history.
     *
     * Options:
     *   maxEvents    Max events. Default 50.
     *   groupByYear  Default false (typically short).
     */
    function renderTeacherHistory(containerId, characterId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return false;

        var events = _history().getTeacherEmploymentHistory(characterId);
        if (options.maxEvents && events.length > options.maxEvents) {
            events = events.slice(0, options.maxEvents);
        }

        // Attach institution context for the row renderer.
        container.innerHTML = _renderEventList(events, {
            groupByYear: options.groupByYear === true,
            emptyMessage: options.emptyMessage || 'No teaching history'
        });
        return true;
    }

    /**
     * Render a character's education history as a student.
     *
     * Options:
     *   maxEvents    Max events. Default 50.
     *   groupByYear  Default true.
     */
    function renderStudentHistory(containerId, characterId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return false;

        var events = _history().getStudentEducationHistory(characterId);
        if (options.maxEvents && events.length > options.maxEvents) {
            events = events.slice(0, options.maxEvents);
        }

        container.innerHTML = _renderEventList(events, {
            groupByYear: options.groupByYear !== false,
            emptyMessage: options.emptyMessage || 'No education history'
        });
        return true;
    }

    /**
     * Render a character's combined education history:
     * as student, as teacher, and as headmaster.
     *
     * Options:
     *   maxEvents    Max events. Default 50.
     *   groupByYear  Default true.
     */
    function renderCharacterHistory(containerId, characterId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return false;

        var combined = _history().getCharacterEducationHistory(characterId);

        // Merge all three streams into one chronological list.
        var merged = [];
        for (var i = 0; i < combined.asStudent.length; i++) merged.push(combined.asStudent[i]);
        for (var i = 0; i < combined.asTeacher.length; i++) merged.push(combined.asTeacher[i]);
        for (var i = 0; i < combined.asHeadmaster.length; i++) merged.push(combined.asHeadmaster[i]);

        merged.sort(function(a, b) {
            if (a.year !== b.year) return b.year - a.year;
            if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
            return a.id < b.id ? 1 : (a.id > b.id ? -1 : 0);
        });

        if (options.maxEvents && merged.length > options.maxEvents) {
            merged = merged.slice(0, options.maxEvents);
        }

        if (merged.length === 0) {
            container.innerHTML = '<div style="color:var(--dim);font-size:0.55rem;padding:8px;text-align:center;">' +
                _escapeHtml(options.emptyMessage || 'No education history') + '</div>';
            return true;
        }

        container.innerHTML = _renderEventList(merged, {
            groupByYear: options.groupByYear !== false,
            emptyMessage: options.emptyMessage || 'No education history'
        });
        return true;
    }

    // =====================================================================
    // Refresh scheduling
    // =====================================================================

    var _refreshTimeouts = {};

    function refreshEducationList(containerId, options) {
        if (_refreshTimeouts[containerId]) clearTimeout(_refreshTimeouts[containerId]);
        _refreshTimeouts[containerId] = setTimeout(function() {
            delete _refreshTimeouts[containerId];
            renderInstitutionList(containerId, options);
        }, 50);
    }

    function debouncedRefresh(containerId, options) {
        refreshEducationList(containerId, options);
    }

    // =====================================================================
    // Exports
    // =====================================================================

    window.EducationUI = {
        // Institution views
        renderInstitutionList: renderInstitutionList,
        renderInstitutionCard: renderInstitutionCard,
        renderInstitutionTable: renderInstitutionTable,
        renderEducationSummary: renderEducationSummary,
        renderReligiousSchoolsList: renderReligiousSchoolsList,

        // History views
        renderInstitutionHistory: renderInstitutionHistory,
        renderTeacherHistory: renderTeacherHistory,
        renderStudentHistory: renderStudentHistory,
        renderCharacterHistory: renderCharacterHistory,

        // Refresh
        refreshEducationList: refreshEducationList,
        debouncedRefresh: debouncedRefresh,

        // Helpers
        getStatusBadge: _getStatusBadge,
        getOwnershipBadge: _getOwnershipBadge,
        getReputationColor: _getReputationColor
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationUI;
    }
})();
