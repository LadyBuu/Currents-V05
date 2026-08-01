/**
 * =============================================================================
 * STILL WATERS - WORLD EDUCATION TAB UI (systems/world/ui/worldEducationTabUI.js)
 * =============================================================================
 * 
 * Education tab for World Manager - shows institutions at the selected location.
 * Uses the same educationSystem.js as Roles Manager but filtered by location.
 * 
 * UPDATED:
 * - All icons from icons.js via _getIcon() - NO EMOJIS
 * - No console logs
 * - Proper integration with EducationState, EducationQueries, EducationCommands
 * - NO refresh loops (proper render guard and handler attachment)
 * - Better error handling when education system not loaded
 * - Single event handler with cleanup
 * - No recursive re-renders
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. ICON HELPERS - Using icons.js ONLY
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
    function _getBookIcon() { return _getIcon('BOOK'); }
    function _getGearIcon() { return _getIcon('GEAR'); }
    function _getPlusIcon() { return _getIcon('PLUS'); }
    function _getStarIcon() { return _getIcon('STAR'); }
    function _getLocationIcon() { return _getIcon('LOCATION'); }
    function _getCrownIcon() { return _getIcon('CROWN'); }
    function _getEditIcon() { return _getIcon('EDIT'); }
    function _getTrashIcon() { return _getIcon('TRASH'); }
    function _getWarningIcon() { return _getIcon('WARNING'); }

    // =========================================================================
    // 2. STATE - Prevent re-render loops
    // =========================================================================

    var worldEducationState = {
        selectedInstitutionId: null,
        expandedInstitutionId: null,
        _isRendering: false,
        _containerId: null,
        _handlersAttached: false
    };

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS WITH FALLBACKS
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

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    // =========================================================================
    // 4. EDUCATION SYSTEM WRAPPERS - Using modular system
    // =========================================================================

    function _isEducationSystemLoaded() {
        return typeof window.EducationState !== 'undefined' ||
               typeof window.getAllEducationalInstitutions === 'function';
    }

    function _getAllEducationalInstitutions() {
        if (typeof window.EducationState !== 'undefined' && 
            typeof window.EducationState.getAllInstitutions === 'function') {
            return window.EducationState.getAllInstitutions();
        }
        if (typeof window.getAllEducationalInstitutions === 'function') {
            return window.getAllEducationalInstitutions();
        }
        return [];
    }

    function _getEducationalInstitution(id) {
        if (typeof window.EducationState !== 'undefined' && 
            typeof window.EducationState.getInstitution === 'function') {
            return window.EducationState.getInstitution(id);
        }
        if (typeof window.getEducationalInstitution === 'function') {
            return window.getEducationalInstitution(id);
        }
        return null;
    }

    function _getInstitutionStudents(institutionId, includeCharacterData) {
        if (typeof window.EducationQueries !== 'undefined' && 
            typeof window.EducationQueries.getInstitutionStudents === 'function') {
            return window.EducationQueries.getInstitutionStudents(institutionId, includeCharacterData);
        }
        if (typeof window.getInstitutionStudents === 'function') {
            return window.getInstitutionStudents(institutionId, includeCharacterData);
        }
        return [];
    }

    function _getInstitutionTeachers(institutionId, includeCharacterData) {
        if (typeof window.EducationQueries !== 'undefined' && 
            typeof window.EducationQueries.getInstitutionTeachers === 'function') {
            return window.EducationQueries.getInstitutionTeachers(institutionId, includeCharacterData);
        }
        if (typeof window.getInstitutionTeachers === 'function') {
            return window.getInstitutionTeachers(institutionId, includeCharacterData);
        }
        return [];
    }

    function _getInstitutionGraduates(institutionId, includeCharacterData) {
        if (typeof window.EducationQueries !== 'undefined' && 
            typeof window.EducationQueries.getInstitutionGraduates === 'function') {
            return window.EducationQueries.getInstitutionGraduates(institutionId, includeCharacterData);
        }
        if (typeof window.getInstitutionGraduates === 'function') {
            return window.getInstitutionGraduates(institutionId, includeCharacterData);
        }
        return [];
    }

    function _getHeadmaster(institutionId) {
        if (typeof window.EducationQueries !== 'undefined' && 
            typeof window.EducationQueries.getHeadmaster === 'function') {
            return window.EducationQueries.getHeadmaster(institutionId);
        }
        if (typeof window.getHeadmaster === 'function') {
            return window.getHeadmaster(institutionId);
        }
        return null;
    }

    function _getEducationLevel(characterId) {
        if (typeof window.EducationLearning !== 'undefined' && 
            typeof window.EducationLearning.getEducationLevel === 'function') {
            return window.EducationLearning.getEducationLevel(characterId);
        }
        if (typeof window.getEducationLevel === 'function') {
            return window.getEducationLevel(characterId);
        }
        return { id: 'illiterate', name: 'Illiterate', icon: '✗', literacy: 0 };
    }

    function _isLiterate(characterId) {
        if (typeof window.EducationLearning !== 'undefined' && 
            typeof window.EducationLearning.isLiterate === 'function') {
            return window.EducationLearning.isLiterate(characterId);
        }
        if (typeof window.isLiterate === 'function') {
            return window.isLiterate(characterId);
        }
        return false;
    }

    function _getProficiency(characterId, curriculumItem) {
        if (typeof window.EducationLearning !== 'undefined' && 
            typeof window.EducationLearning.getProficiency === 'function') {
            return window.EducationLearning.getProficiency(characterId, curriculumItem);
        }
        if (typeof window.getProficiency === 'function') {
            return window.getProficiency(characterId, curriculumItem);
        }
        return 0;
    }

    // =========================================================================
    // 5. MODAL WRAPPERS - Using modular system
    // =========================================================================

    function _openCreateInstitutionModal(locationId, onSuccess) {
        if (typeof window.openCreateInstitutionModal === 'function') {
            window.openCreateInstitutionModal(locationId, function(newInstId) {
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
                if (typeof window.EducationState !== 'undefined' && 
                    typeof window.EducationState._rebuildCaches === 'function') {
                    window.EducationState._rebuildCaches();
                }
                if (onSuccess) onSuccess();
                setTimeout(function() { renderWorldEducationTab(); }, 100);
            });
            return;
        }
        _showToast('Create institution modal not available', 'error');
    }

    function _openInstitutionDetailsModal(institutionId, onRefresh) {
        if (typeof window.openInstitutionDetailsModal === 'function') {
            window.openInstitutionDetailsModal(institutionId, function() {
                if (onRefresh) onRefresh();
                setTimeout(function() { renderWorldEducationTab(); }, 100);
            });
        } else {
            _showToast('Institution details modal not available', 'error');
        }
    }

    function _openEditInstitutionModal(institutionId, onSuccess) {
        if (typeof window.openEditInstitutionModal === 'function') {
            window.openEditInstitutionModal(institutionId, function() {
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
                if (onSuccess) onSuccess();
                setTimeout(function() { renderWorldEducationTab(); }, 100);
            });
        } else {
            _showToast('Edit institution modal not available', 'error');
        }
    }

    function _openEditCurriculumModal(institutionId, onSuccess) {
        if (typeof window.openEditCurriculumModal === 'function') {
            window.openEditCurriculumModal(institutionId, function() {
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
                if (onSuccess) onSuccess();
                setTimeout(function() { renderWorldEducationTab(); }, 100);
            });
        } else {
            _showToast('Edit curriculum modal not available', 'error');
        }
    }

    function _openEnrollStudentModal(institutionId, onSuccess) {
        if (typeof window.openEnrollStudentModal === 'function') {
            window.openEnrollStudentModal(institutionId, function() {
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
                if (onSuccess) onSuccess();
                setTimeout(function() { renderWorldEducationTab(); }, 100);
            });
        } else {
            _showToast('Enroll student modal not available', 'error');
        }
    }

    function _openHireTeacherModal(institutionId, onSuccess) {
        if (typeof window.openHireTeacherModal === 'function') {
            window.openHireTeacherModal(institutionId, function() {
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
                if (onSuccess) onSuccess();
                setTimeout(function() { renderWorldEducationTab(); }, 100);
            });
        } else {
            _showToast('Hire teacher modal not available', 'error');
        }
    }

    function _openSetHeadmasterModal(institutionId, onSuccess) {
        if (typeof window.openSetHeadmasterModal === 'function') {
            window.openSetHeadmasterModal(institutionId, function() {
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
                if (onSuccess) onSuccess();
                setTimeout(function() { renderWorldEducationTab(); }, 100);
            });
        } else {
            _showToast('Set headmaster modal not available', 'error');
        }
    }

    function _openDeleteInstitutionModal(institutionId, onSuccess) {
        if (typeof window.openDeleteInstitutionModal === 'function') {
            window.openDeleteInstitutionModal(institutionId, function() {
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
                if (onSuccess) onSuccess();
                setTimeout(function() { renderWorldEducationTab(); }, 100);
            });
        } else {
            _showToast('Delete institution modal not available', 'error');
        }
    }

    function _openTuitionManagementModal(institutionId, onSuccess) {
        if (typeof window.openTuitionManagementModal === 'function') {
            window.openTuitionManagementModal(institutionId, function() {
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
                if (onSuccess) onSuccess();
                setTimeout(function() { renderWorldEducationTab(); }, 100);
            });
        } else {
            _showToast('Tuition management modal not available', 'error');
        }
    }

    function _openOwnershipManagementModal(institutionId, onSuccess) {
        if (typeof window.openOwnershipManagementModal === 'function') {
            window.openOwnershipManagementModal(institutionId, function() {
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
                if (onSuccess) onSuccess();
                setTimeout(function() { renderWorldEducationTab(); }, 100);
            });
        } else {
            _showToast('Ownership management modal not available', 'error');
        }
    }

    // =========================================================================
    // 6. HELPER FUNCTIONS
    // =========================================================================

    function getLocationId() {
        if (typeof window.worldManager !== 'undefined' && window.worldManager.getSelectedLocation) {
            return window.worldManager.getSelectedLocation();
        }
        return null;
    }

    function getInstitutionTypeIcon(typeId) {
        var icons = {
            village_school: _getIcon('HOME'),
            guild_hall: _getIcon('CIRCLE'),
            cathedral_school: _getIcon('CROSS'),
            university: _getIcon('HOME'),
            military_academy: _getIcon('SWORD'),
            court_tutor: _getIcon('CROWN'),
            specialized_school: _getIcon('STAR')
        };
        return icons[typeId] || _getIcon('HOME');
    }

    function getInstitutionTypeName(typeId) {
        var names = {
            village_school: 'Village School',
            guild_hall: 'Guild Hall',
            cathedral_school: 'Cathedral School',
            university: 'University',
            military_academy: 'Military Academy',
            court_tutor: 'Court Tutor',
            specialized_school: 'Specialized School'
        };
        return names[typeId] || typeId;
    }

    function getLocationName(locationId) {
        var place = _getPlaceById(locationId);
        return place ? place.displayName : 'Unknown';
    }

    function calculateAverageProficiency(students, institution) {
        if (!students || !students.length || !institution || !institution.curriculum || !institution.curriculum.length) return 0;
        var total = 0;
        var count = 0;
        for (var i = 0; i < students.length; i++) {
            var studentId = students[i].studentId || students[i].character?.id;
            if (!studentId) continue;
            for (var j = 0; j < institution.curriculum.length; j++) {
                total += _getProficiency(studentId, institution.curriculum[j]);
                count++;
            }
        }
        return count > 0 ? Math.round(total / count) : 0;
    }

    // =========================================================================
    // 7. MAIN RENDER FUNCTION - No refresh loops
    // =========================================================================

    function renderWorldEducationTab(containerId) {
        // Prevent concurrent renders
        if (worldEducationState._isRendering) {
            return;
        }
        worldEducationState._isRendering = true;

        var container = document.getElementById(containerId || 'educationContent');
        if (!container) {
            worldEducationState._isRendering = false;
            return;
        }

        worldEducationState._containerId = containerId || 'educationContent';

        var locationId = getLocationId();
        var place = locationId ? _getPlaceById(locationId) : null;
        var locationName = place ? place.displayName : 'No location selected';

        // Check if education system is loaded
        var isLoaded = _isEducationSystemLoaded();

        var homeIcon = _getHomeIcon();
        var bookIcon = _getBookIcon();
        var refreshIcon = _getRefreshIcon();
        var plusIcon = _getPlusIcon();
        var personIcon = _getPersonIcon();
        var gearIcon = _getGearIcon();
        var starIcon = _getStarIcon();
        var circleIcon = _getCircleIcon();
        var crossIcon = _getCrossIcon();
        var checkIcon = _getCheckIcon();

        if (!isLoaded) {
            container.innerHTML = 
                '<div class="empty-state" style="padding:40px;text-align:center;color:var(--warn);">' +
                bookIcon + ' Education system not loaded.<br>' +
                '<span style="font-size:0.6rem;color:var(--dim);">Make sure educationSystem.js is properly loaded.</span>' +
                '<br><br>' +
                '<button id="eduRetryBtn" class="btn primary small" style="padding:4px 12px;">' + refreshIcon + ' Retry</button>' +
                '</div>';
            
            var retryBtn = document.getElementById('eduRetryBtn');
            if (retryBtn && !retryBtn._clickAttached) {
                retryBtn._clickAttached = true;
                retryBtn.onclick = function() {
                    renderWorldEducationTab(containerId);
                };
            }
            worldEducationState._isRendering = false;
            return;
        }

        if (!locationId || !place) {
            container.innerHTML = 
                '<div class="empty-state" style="padding:40px;text-align:center;color:var(--dim);">' +
                homeIcon + ' Select a location from the sidebar to view its educational institutions.' +
                '</div>';
            worldEducationState._isRendering = false;
            return;
        }

        var allInstitutions = _getAllEducationalInstitutions();
        var institutions = allInstitutions.filter(function(inst) {
            return inst.locationId === locationId;
        });

        var hasEducationSystem = typeof window.EducationState !== 'undefined' ||
                                typeof window.getAllEducationalInstitutions === 'function';

        var html = 
            '<div class="world-education-tab" style="display:flex;flex-direction:column;height:100%;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;margin-bottom:12px;flex-shrink:0;">' +
            '<div>' +
            '<span style="font-size:0.7rem;font-weight:bold;color:var(--accent);">' + bookIcon + ' Education</span>' +
            '<span style="font-size:0.6rem;color:var(--dim);margin-left:8px;">' + homeIcon + ' ' + _escapeHtml(locationName) + '</span>' +
            '<span style="font-size:0.55rem;color:var(--dim);margin-left:8px;">(' + institutions.length + ' institutions)</span>' +
            '</div>' +
            '<div style="display:flex;gap:6px;">' +
            (hasEducationSystem ? 
                '<button id="worldEduCreateBtn" class="btn primary small" style="padding:4px 12px;font-size:0.55rem;">' + plusIcon + ' Create</button>' :
                ''
            ) +
            '<button id="worldEduRefreshBtn" class="btn small" style="padding:4px 8px;font-size:0.5rem;">' + refreshIcon + '</button>' +
            '</div></div>';

        if (!hasEducationSystem) {
            html += '<div class="empty-state" style="padding:40px;text-align:center;color:var(--warn);">Education system not loaded. Check that educationSystem.js is loaded.</div>';
            container.innerHTML = html;
            worldEducationState._isRendering = false;
            return;
        }

        if (institutions.length === 0) {
            html += 
                '<div class="empty-state" style="padding:40px;text-align:center;color:var(--dim);">' +
                bookIcon + ' No educational institutions in ' + _escapeHtml(locationName) + '<br>' +
                '<span style="font-size:0.6rem;">Click "Create" to add your first institution.</span>' +
                '</div>';
        } else {
            html += '<div style="display:flex;flex-direction:column;gap:8px;flex:1;overflow-y:auto;">';
            for (var i = 0; i < institutions.length; i++) {
                html += renderInstitutionCard(institutions[i]);
            }
            html += '</div>';
        }

        html += '</div>';
        container.innerHTML = html;
        
        // Attach handlers only once
        attachWorldEducationHandlers(container, locationId);
        
        worldEducationState._isRendering = false;
    }

    // =========================================================================
    // 8. RENDER INSTITUTION CARD
    // =========================================================================

    function renderInstitutionCard(institution) {
        var students = _getInstitutionStudents(institution.id, true) || [];
        var teachers = _getInstitutionTeachers(institution.id, true) || [];
        var graduates = _getInstitutionGraduates(institution.id, true) || [];
        var headmaster = _getHeadmaster(institution.id);
        var typeIcon = institution.icon || getInstitutionTypeIcon(institution.type);
        var typeName = institution.typeName || getInstitutionTypeName(institution.type);
        var isExpanded = worldEducationState.expandedInstitutionId === institution.id;
        var reputation = institution.reputation || 50;
        var curriculumCount = institution.curriculum?.length || 0;
        var avgProficiency = calculateAverageProficiency(students, institution);

        var studentCount = students.length;
        var teacherCount = teachers.length;
        var graduateCount = graduates.length;

        var bookIcon = _getBookIcon();
        var personIcon = _getPersonIcon();
        var gearIcon = _getGearIcon();
        var starIcon = _getStarIcon();
        var circleIcon = _getCircleIcon();
        var crossIcon = _getCrossIcon();
        var crownIcon = _getCrownIcon();

        var reputationColor = reputation >= 70 ? '#4a9060' : (reputation >= 40 ? '#c8a844' : '#c87040');
        var reputationIcon = reputation >= 70 ? starIcon : (reputation >= 40 ? circleIcon : crossIcon);

        var html = 
            '<div class="world-edu-institution" data-institution-id="' + institution.id + '" style="' +
            'background:var(--bg2);' +
            'border:1px solid var(--border);' +
            'border-radius:8px;' +
            'overflow:hidden;' +
            'transition:all 0.2s;' +
            '">' +
            '<div class="world-edu-header" style="' +
            'padding:10px 14px;' +
            'display:flex;' +
            'justify-content:space-between;' +
            'align-items:center;' +
            'flex-wrap:wrap;' +
            'gap:6px;' +
            'cursor:pointer;' +
            'background:var(--bg3);' +
            '">' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
            '<span style="font-size:1.1rem;">' + typeIcon + '</span>' +
            '<strong style="font-size:0.75rem;color:var(--accent);">' + _escapeHtml(institution.name) + '</strong>' +
            '<span style="font-size:0.5rem;color:var(--dim);background:var(--bg);padding:2px 6px;border-radius:8px;">' + typeName + '</span>' +
            (institution.isSpecialized ? '<span style="font-size:0.5rem;color:var(--accent-dim);background:var(--bg);padding:2px 6px;border-radius:8px;">◉ Specialized</span>' : '') +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;font-size:0.55rem;color:var(--dim);">' +
            '<span title="Students">' + personIcon + ' ' + studentCount + '</span>' +
            '<span title="Teachers">' + gearIcon + ' ' + teacherCount + '</span>' +
            '<span title="Reputation" style="color:' + reputationColor + ';">' + reputationIcon + ' ' + reputation + '</span>' +
            '<span class="expand-toggle" style="cursor:pointer;font-size:0.6rem;color:var(--accent);">' + (isExpanded ? '▲' : '▼') + '</span>' +
            '</div></div>';

        if (isExpanded) {
            html += 
                '<div class="world-edu-details" style="padding:12px 14px;border-top:1px solid var(--border);">' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:8px;margin-bottom:12px;">' +
                '<div style="text-align:center;background:var(--bg);padding:6px;border-radius:4px;"><div style="font-size:0.7rem;font-weight:bold;color:var(--accent);">' + studentCount + '</div><div style="font-size:0.5rem;color:var(--dim);">Students</div></div>' +
                '<div style="text-align:center;background:var(--bg);padding:6px;border-radius:4px;"><div style="font-size:0.7rem;font-weight:bold;color:var(--accent);">' + teacherCount + '</div><div style="font-size:0.5rem;color:var(--dim);">Teachers</div></div>' +
                '<div style="text-align:center;background:var(--bg);padding:6px;border-radius:4px;"><div style="font-size:0.7rem;font-weight:bold;color:var(--accent);">' + graduateCount + '</div><div style="font-size:0.5rem;color:var(--dim);">Graduates</div></div>' +
                '<div style="text-align:center;background:var(--bg);padding:6px;border-radius:4px;"><div style="font-size:0.7rem;font-weight:bold;color:var(--accent);">' + avgProficiency + '%</div><div style="font-size:0.5rem;color:var(--dim);">Avg Progress</div></div>' +
                '</div>' +

                '<div style="margin-bottom:12px;">' +
                '<div style="font-size:0.6rem;font-weight:bold;color:var(--accent);margin-bottom:4px;">' + bookIcon + ' Curriculum (' + curriculumCount + ')</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:4px;">' +
                (institution.curriculum && institution.curriculum.length > 0 ? 
                    institution.curriculum.map(function(c) {
                        var icon = c.icon || (c.type === 'role' ? '◉' : '⌇');
                        return '<span style="background:var(--bg);padding:2px 8px;border-radius:10px;font-size:0.55rem;border:1px solid var(--border);">' + 
                            icon + ' ' + _escapeHtml(c.name) + 
                            '</span>';
                    }).join('') :
                    '<span style="font-size:0.55rem;color:var(--dim);">No curriculum defined</span>'
                ) +
                '</div></div>' +

                (headmaster && headmaster.character ? 
                    '<div style="margin-bottom:12px;font-size:0.6rem;"><span style="color:var(--dim);">' + crownIcon + ' Headmaster:</span> <span style="color:var(--accent);">' + _escapeHtml(headmaster.character.name) + ' ' + _escapeHtml(headmaster.character.surname || '') + '</span>' + 
                    (headmaster.details && headmaster.details.startYear ? ' (since ' + headmaster.details.startYear + ')' : '') +
                    '</div>' :
                    '<div style="margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' + crossIcon + ' No headmaster appointed</div>'
                ) +

                (studentCount > 0 ? 
                    '<div style="margin-bottom:12px;">' +
                    '<div style="font-size:0.6rem;font-weight:bold;color:var(--accent);margin-bottom:4px;">' + personIcon + ' Students</div>' +
                    students.slice(0, 5).map(function(s) {
                        var char = s.character || _getCharacterById(s.studentId || (s.record && s.record.studentId));
                        if (!char) return '';
                        var eduLevel = _getEducationLevel(char.id);
                        return '<div style="font-size:0.55rem;padding:2px 4px;display:flex;justify-content:space-between;border-bottom:1px solid var(--border-light);">' +
                            '<span>' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</span>' +
                            '<span style="color:var(--dim);">' + (eduLevel.icon || '⌇') + ' ' + eduLevel.name + '</span>' +
                            '</div>';
                    }).join('') +
                    (studentCount > 5 ? '<div style="font-size:0.5rem;color:var(--dim);padding:2px 4px;">... and ' + (studentCount - 5) + ' more</div>' : '') +
                    '</div>' : ''
                ) +

                (teacherCount > 0 ? 
                    '<div style="margin-bottom:12px;">' +
                    '<div style="font-size:0.6rem;font-weight:bold;color:var(--accent);margin-bottom:4px;">' + gearIcon + ' Teachers</div>' +
                    teachers.slice(0, 5).map(function(t) {
                        var char = t.character || _getCharacterById(t.teacherId || (t.record && t.record.teacherId));
                        var name = char ? char.name + ' ' + (char.surname || '') : (t.teacherName || 'Unknown');
                        var subjectName = t.record ? t.record.subjectName : (t.subjectName || 'Unknown');
                        return '<div style="font-size:0.55rem;padding:2px 4px;display:flex;justify-content:space-between;border-bottom:1px solid var(--border-light);">' +
                            '<span>' + _escapeHtml(name) + '</span>' +
                            '<span style="color:var(--dim);">' + _escapeHtml(subjectName) + '</span>' +
                            '</div>';
                    }).join('') +
                    (teacherCount > 5 ? '<div style="font-size:0.5rem;color:var(--dim);padding:2px 4px;">... and ' + (teacherCount - 5) + ' more</div>' : '') +
                    '</div>' : ''
                ) +

                '<div style="display:flex;gap:6px;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--border);">' +
                '<button class="world-edu-view-btn btn small" data-inst-id="' + institution.id + '" style="padding:3px 10px;font-size:0.5rem;">' + bookIcon + ' Details</button>' +
                '<button class="world-edu-curriculum-btn btn small" data-inst-id="' + institution.id + '" style="padding:3px 10px;font-size:0.5rem;">' + gearIcon + ' Curriculum</button>' +
                '<button class="world-edu-enroll-btn btn small" data-inst-id="' + institution.id + '" style="padding:3px 10px;font-size:0.5rem;">' + personIcon + ' Enroll</button>' +
                '<button class="world-edu-hire-btn btn small" data-inst-id="' + institution.id + '" style="padding:3px 10px;font-size:0.5rem;">' + _getPlusIcon() + ' Hire</button>' +
                '<button class="world-edu-headmaster-btn btn small" data-inst-id="' + institution.id + '" style="padding:3px 10px;font-size:0.5rem;">' + crownIcon + ' Headmaster</button>' +
                '<button class="world-edu-tuition-btn btn small" data-inst-id="' + institution.id + '" style="padding:3px 10px;font-size:0.5rem;">💰 Tuition</button>' +
                '<button class="world-edu-ownership-btn btn small" data-inst-id="' + institution.id + '" style="padding:3px 10px;font-size:0.5rem;">🏛️ Ownership</button>' +
                '<button class="world-edu-delete-btn btn small danger" data-inst-id="' + institution.id + '" data-inst-name="' + _escapeHtml(institution.name) + '" style="padding:3px 10px;font-size:0.5rem;">' + _getTrashIcon() + '</button>' +
                '</div>' +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 9. EVENT HANDLERS - Single handler, no loops
    // =========================================================================

    function attachWorldEducationHandlers(container, locationId) {
        var containerId = container.id || 'educationContent';

        // Refresh button
        var refreshBtn = document.getElementById('worldEduRefreshBtn');
        if (refreshBtn && !refreshBtn._clickAttached) {
            refreshBtn._clickAttached = true;
            refreshBtn.onclick = function() {
                if (typeof window.EducationState !== 'undefined' && 
                    typeof window.EducationState._rebuildCaches === 'function') {
                    window.EducationState._rebuildCaches();
                }
                renderWorldEducationTab(containerId);
                _showToast(_getRefreshIcon() + ' Refreshed', 'success');
            };
        }

        // Create button
        var createBtn = document.getElementById('worldEduCreateBtn');
        if (createBtn && !createBtn._clickAttached) {
            createBtn._clickAttached = true;
            createBtn.onclick = function() {
                _openCreateInstitutionModal(locationId, function() {
                    renderWorldEducationTab(containerId);
                });
            };
        }

        // Remove any existing click handler to prevent duplicates
        if (container._eduClickHandler) {
            container.removeEventListener('click', container._eduClickHandler);
        }

        // Single delegated click handler
        container._eduClickHandler = function(e) {
            // Header click - expand/collapse
            var header = e.target.closest('.world-edu-header');
            if (header && !e.target.closest('.expand-toggle') && !e.target.closest('button')) {
                var card = header.closest('.world-edu-institution');
                if (card) {
                    e.stopPropagation();
                    var instId = card.dataset.institutionId;
                    if (worldEducationState.expandedInstitutionId === instId) {
                        worldEducationState.expandedInstitutionId = null;
                    } else {
                        worldEducationState.expandedInstitutionId = instId;
                    }
                    renderWorldEducationTab(containerId);
                }
                return;
            }

            // Expand toggle
            var toggle = e.target.closest('.expand-toggle');
            if (toggle) {
                e.stopPropagation();
                var card = toggle.closest('.world-edu-institution');
                if (card) {
                    var instId = card.dataset.institutionId;
                    if (worldEducationState.expandedInstitutionId === instId) {
                        worldEducationState.expandedInstitutionId = null;
                    } else {
                        worldEducationState.expandedInstitutionId = instId;
                    }
                    renderWorldEducationTab(containerId);
                }
                return;
            }

            // View Details
            var viewBtn = e.target.closest('.world-edu-view-btn');
            if (viewBtn) {
                e.stopPropagation();
                var instId = viewBtn.dataset.instId;
                _openInstitutionDetailsModal(instId, function() {
                    renderWorldEducationTab(containerId);
                });
                return;
            }

            // Curriculum
            var curriculumBtn = e.target.closest('.world-edu-curriculum-btn');
            if (curriculumBtn) {
                e.stopPropagation();
                var instId = curriculumBtn.dataset.instId;
                _openEditCurriculumModal(instId, function() {
                    renderWorldEducationTab(containerId);
                });
                return;
            }

            // Enroll
            var enrollBtn = e.target.closest('.world-edu-enroll-btn');
            if (enrollBtn) {
                e.stopPropagation();
                var instId = enrollBtn.dataset.instId;
                _openEnrollStudentModal(instId, function() {
                    renderWorldEducationTab(containerId);
                });
                return;
            }

            // Hire
            var hireBtn = e.target.closest('.world-edu-hire-btn');
            if (hireBtn) {
                e.stopPropagation();
                var instId = hireBtn.dataset.instId;
                _openHireTeacherModal(instId, function() {
                    renderWorldEducationTab(containerId);
                });
                return;
            }

            // Headmaster
            var headmasterBtn = e.target.closest('.world-edu-headmaster-btn');
            if (headmasterBtn) {
                e.stopPropagation();
                var instId = headmasterBtn.dataset.instId;
                _openSetHeadmasterModal(instId, function() {
                    renderWorldEducationTab(containerId);
                });
                return;
            }

            // Tuition
            var tuitionBtn = e.target.closest('.world-edu-tuition-btn');
            if (tuitionBtn) {
                e.stopPropagation();
                var instId = tuitionBtn.dataset.instId;
                _openTuitionManagementModal(instId, function() {
                    renderWorldEducationTab(containerId);
                });
                return;
            }

            // Ownership
            var ownershipBtn = e.target.closest('.world-edu-ownership-btn');
            if (ownershipBtn) {
                e.stopPropagation();
                var instId = ownershipBtn.dataset.instId;
                _openOwnershipManagementModal(instId, function() {
                    renderWorldEducationTab(containerId);
                });
                return;
            }

            // Delete
            var deleteBtn = e.target.closest('.world-edu-delete-btn');
            if (deleteBtn) {
                e.stopPropagation();
                var instId = deleteBtn.dataset.instId;
                var instName = deleteBtn.dataset.instName;
                if (confirm('Delete institution "' + instName + '" permanently?')) {
                    _openDeleteInstitutionModal(instId, function() {
                        renderWorldEducationTab(containerId);
                    });
                }
                return;
            }
        };

        container.addEventListener('click', container._eduClickHandler);
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.renderWorldEducationTab = renderWorldEducationTab;
    window._isEducationSystemLoaded = _isEducationSystemLoaded;

})();