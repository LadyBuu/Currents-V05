/**
 * =============================================================================
 * SETTLEMENT EDUCATION TAB - UI for settlement education management
 * =============================================================================
 * 
 * This file provides the complete UI for the Settlement Education tab.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;
    var _modalOpen = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        }
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm);
        }
        if (confirm(message)) {
            onConfirm();
        }
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (window.Icons && window.Icons.CIRCLE) {
            return window.Icons.CIRCLE;
        }
        return '';
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
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _getSettlementSummary(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementSummary) {
            return SettlementQueries.getSettlementSummary(locationId);
        }
        return null;
    }

    function _getSettlementData(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementData) {
            return SettlementState.getSettlementData(locationId);
        }
        return null;
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    // Education wrappers
    function _getAllInstitutions() {
        if (typeof EducationState !== 'undefined' && EducationState.getAllInstitutions) {
            return EducationState.getAllInstitutions();
        }
        return [];
    }

    function _getInstitution(id) {
        if (typeof EducationState !== 'undefined' && EducationState.getInstitution) {
            return EducationState.getInstitution(id);
        }
        return null;
    }

    function _getInstitutionsByLocation(locationId) {
        if (typeof EducationState !== 'undefined' && EducationState.getInstitutionsByLocation) {
            return EducationState.getInstitutionsByLocation(locationId);
        }
        return [];
    }

    function _getInstitutionDetails(id) {
        if (typeof EducationQueries !== 'undefined' && EducationQueries.getInstitutionDetails) {
            return EducationQueries.getInstitutionDetails(id);
        }
        return null;
    }

    function _getLocationEducationSummary(locationId) {
        if (typeof EducationQueries !== 'undefined' && EducationQueries.getLocationEducationSummary) {
            return EducationQueries.getLocationEducationSummary(locationId);
        }
        return null;
    }

    function _getEducationHealthScore(locationId) {
        if (typeof EducationQueries !== 'undefined' && EducationQueries.getEducationHealthScore) {
            return EducationQueries.getEducationHealthScore(locationId);
        }
        return null;
    }

    function _getEducationLevel(characterId) {
        if (typeof EducationLearning !== 'undefined' && EducationLearning.getEducationLevel) {
            return EducationLearning.getEducationLevel(characterId);
        }
        return null;
    }

    function _isLiterate(characterId) {
        if (typeof EducationLearning !== 'undefined' && EducationLearning.isLiterate) {
            return EducationLearning.isLiterate(characterId);
        }
        return false;
    }

    function _getSchoolAgePopulation(locationId) {
        if (typeof EducationLearning !== 'undefined' && EducationLearning.getSchoolAgePopulation) {
            return EducationLearning.getSchoolAgePopulation(locationId);
        }
        return 0;
    }

    function _createInstitution(name, typeId, locationId, options) {
        if (typeof EducationCommands !== 'undefined' && EducationCommands.createInstitution) {
            return EducationCommands.createInstitution(name, typeId, locationId, options);
        }
        return null;
    }

    function _createReligiousSchool(religionId, name, locationId, options) {
        if (typeof EducationCommands !== 'undefined' && EducationCommands.createReligiousSchool) {
            return EducationCommands.createReligiousSchool(religionId, name, locationId, options);
        }
        return null;
    }

    function _updateInstitution(id, updates) {
        if (typeof EducationCommands !== 'undefined' && EducationCommands.updateInstitution) {
            return EducationCommands.updateInstitution(id, updates);
        }
        return false;
    }

    function _deleteInstitution(id, cascade) {
        if (typeof EducationCommands !== 'undefined' && EducationCommands.deleteInstitution) {
            return EducationCommands.deleteInstitution(id, cascade);
        }
        return false;
    }

    function _enrollStudent(institutionId, studentId, startYear) {
        if (typeof EducationCommands !== 'undefined' && EducationCommands.enrollStudent) {
            return EducationCommands.enrollStudent(institutionId, studentId, startYear);
        }
        return false;
    }

    function _graduateStudent(institutionId, studentId, graduationYear, selectedRoleId) {
        if (typeof EducationCommands !== 'undefined' && EducationCommands.graduateStudent) {
            return EducationCommands.graduateStudent(institutionId, studentId, graduationYear, selectedRoleId);
        }
        return false;
    }

    function _withdrawStudent(institutionId, studentId, reason) {
        if (typeof EducationCommands !== 'undefined' && EducationCommands.withdrawStudent) {
            return EducationCommands.withdrawStudent(institutionId, studentId, reason);
        }
        return false;
    }

    function _hireTeacher(institutionId, teacherId, subjectId) {
        if (typeof EducationCommands !== 'undefined' && EducationCommands.hireTeacher) {
            return EducationCommands.hireTeacher(institutionId, teacherId, subjectId);
        }
        return false;
    }

    function _fireTeacher(institutionId, teacherId, reason) {
        if (typeof EducationCommands !== 'undefined' && EducationCommands.fireTeacher) {
            return EducationCommands.fireTeacher(institutionId, teacherId, reason);
        }
        return false;
    }

    function _setHeadmaster(institutionId, characterId, title, startYear) {
        if (typeof EducationCommands !== 'undefined' && EducationCommands.setHeadmaster) {
            return EducationCommands.setHeadmaster(institutionId, characterId, title, startYear);
        }
        return false;
    }

    function _endHeadmasterTerm(institutionId, endYear, reason) {
        if (typeof EducationCommands !== 'undefined' && EducationCommands.endHeadmasterTerm) {
            return EducationCommands.endHeadmasterTerm(institutionId, endYear, reason);
        }
        return false;
    }

    function _getReligiousSchools(locationId) {
        if (typeof EducationState !== 'undefined' && EducationState.getReligiousSchools) {
            return EducationState.getReligiousSchools();
        }
        return [];
    }

    function _getReligion(id) {
        if (typeof ReligionState !== 'undefined' && ReligionState.getReligion) {
            return ReligionState.getReligion(id);
        }
        return null;
    }

    function _getAllReligions() {
        if (typeof ReligionState !== 'undefined' && ReligionState.getAllReligions) {
            return ReligionState.getAllReligions({ includeDeprecated: false });
        }
        return [];
    }

    function _getAllRoles() {
        if (typeof window.getRoles === 'function') {
            return window.getRoles();
        }
        return [];
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    // =========================================================================
    // 3. HELPER: GET ALL INSTITUTION TYPES
    // =========================================================================

    function _getAllInstitutionTypes() {
        if (typeof EducationConstants !== 'undefined' && EducationConstants.INSTITUTION_TYPES) {
            return EducationConstants.INSTITUTION_TYPES;
        }
        return [
            { id: 'village_school', name: 'Village School', maxStudents: 30, baseReputation: 30, requiredYears: 3, type: 'village_school' },
            { id: 'guild_hall', name: 'Guild Hall', maxStudents: 50, baseReputation: 50, requiredYears: 5, type: 'guild_hall' },
            { id: 'cathedral_school', name: 'Cathedral School', maxStudents: 40, baseReputation: 60, requiredYears: 4, type: 'cathedral_school' },
            { id: 'university', name: 'University', maxStudents: 200, baseReputation: 80, requiredYears: 6, type: 'university' },
            { id: 'military_academy', name: 'Military Academy', maxStudents: 100, baseReputation: 65, requiredYears: 4, type: 'military_academy' },
            { id: 'court_tutor', name: 'Court Tutor', maxStudents: 5, baseReputation: 90, requiredYears: 4, type: 'court_tutor' },
            { id: 'specialized_school', name: 'Specialized School', maxStudents: 40, baseReputation: 50, requiredYears: 4, type: 'specialized_school' },
            { id: 'religious_seminary', name: 'Religious Seminary', maxStudents: 30, baseReputation: 55, requiredYears: 4, type: 'religious_seminary' },
            { id: 'monastic_school', name: 'Monastic School', maxStudents: 20, baseReputation: 50, requiredYears: 3, type: 'monastic_school' }
        ];
    }

    // =========================================================================
    // 4. ICON HELPERS
    // =========================================================================

    function _icon(name) {
        return _getIcon(name);
    }

    // =========================================================================
    // 5. MAIN RENDER FUNCTION
    // =========================================================================

    function renderSettlementEducation(containerId, locationId, summary) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                _rendering = false;
                return;
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                if (typeof SettlementCrud !== 'undefined' && SettlementCrud.createSettlementData) {
                    data = SettlementCrud.createSettlementData(locationId);
                }
            }

            if (!data) {
                container.innerHTML = '<div class="empty-state">No settlement data found. Select a location with a settlement.</div>';
                _rendering = false;
                return;
            }

            var place = _getPlaceById(locationId);
            if (!place) {
                container.innerHTML = '<div class="empty-state">Location not found</div>';
                _rendering = false;
                return;
            }

            // Get education data
            var educationSummary = _getLocationEducationSummary(locationId);
            var healthScore = _getEducationHealthScore(locationId);
            var institutions = _getInstitutionsByLocation(locationId);
            var population = _getLocationPopulationCount(locationId);
            var schoolAgePop = _getSchoolAgePopulation(locationId);
            var settlementData = _getSettlementData(locationId);
            var educationBudget = settlementData ? settlementData.educationBudget || 0 : 0;

            // Separate by ownership type
            var publicSchools = [];
            var privateSchools = [];
            var religiousSchools = [];

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                if (inst.ownershipType === 'public') {
                    publicSchools.push(inst);
                } else if (inst.ownershipType === 'religious' || inst.isReligiousSchool) {
                    religiousSchools.push(inst);
                } else {
                    privateSchools.push(inst);
                }
            }

            var BOOK = _icon('BOOK');
            var PERSON = _icon('PERSON');
            var LOC = _icon('LOCATION');
            var INFO = _icon('CIRCLE_DOT');
            var STAR = _icon('STAR_4');
            var COIN = _icon('COIN');
            var CROWN = _icon('CROWN');
            var GEAR = _icon('GEAR');
            var REFRESH = _icon('REFRESH');
            var TRASH = _icon('TRASH');
            var EDIT = _icon('EDIT');

            var content = '<div style="padding: 4px;">';

            // HEADER
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border: 1px solid var(--border);">' +
                '<div>' +
                '<div style="font-size: 0.8rem; font-weight: bold; color: var(--accent-light);">' + BOOK + ' Education in ' + _escapeHtml(place.displayName) + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + institutions.length + ' institutions · ' + (educationSummary ? educationSummary.totalStudents || 0 : 0) + ' students</div>' +
                '</div>' +
                '<div style="text-align: right;">' +
                '<div style="font-size: 0.65rem; color: var(--text);">Literacy: <strong style="color: ' + (healthScore && healthScore.literacyRate >= 70 ? 'var(--success)' : healthScore && healthScore.literacyRate >= 40 ? 'var(--accent)' : 'var(--danger)') + ';">' + (healthScore ? healthScore.literacyRate || 0 : 0) + '%</strong></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Coverage: ' + (healthScore ? healthScore.coverageRatio || 0 : 0) + '%</div>' +
                '</div>' +
                '</div>';

            // ACTION BUTTONS
            content += '<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px;">' +
                '<button class="education-action-btn" data-action="create-public" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer; color: var(--accent-light);">' + BOOK + ' Public School</button>' +
                '<button class="education-action-btn" data-action="create-private" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + BOOK + ' Private School</button>' +
                '<button class="education-action-btn" data-action="create-religious" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--warn); border-radius: 4px; cursor: pointer; color: var(--warn);">' + BOOK + ' Religious School</button>' +
                '<button class="education-action-btn" data-action="refresh" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + REFRESH + ' Refresh</button>' +
                '</div>';

            // STATISTICS SUMMARY
            var totalStudents = educationSummary ? educationSummary.totalStudents || 0 : 0;
            var totalTeachers = educationSummary ? educationSummary.totalTeachers || 0 : 0;
            var totalGraduates = educationSummary ? educationSummary.totalGraduates || 0 : 0;
            var totalCapacity = educationSummary ? educationSummary.totalCapacity || 0 : 0;
            var avgReputation = educationSummary ? educationSummary.averageReputation || 0 : 0;
            var capacityUsed = totalCapacity > 0 ? Math.round((totalStudents / totalCapacity) * 100) : 0;
            var coverage = healthScore ? healthScore.coverageRatio || 0 : 0;

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 10px; border-radius: 6px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">' + BOOK + ' Students</div>' +
                '<div style="font-size: 0.9rem; font-weight: bold; color: var(--text);">' + totalStudents + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 10px; border-radius: 6px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">' + PERSON + ' Teachers</div>' +
                '<div style="font-size: 0.9rem; font-weight: bold; color: var(--text);">' + totalTeachers + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 10px; border-radius: 6px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Capacity</div>' +
                '<div style="font-size: 0.9rem; font-weight: bold; color: ' + (capacityUsed > 90 ? 'var(--danger)' : capacityUsed > 70 ? 'var(--warn)' : 'var(--success)') + ';">' + capacityUsed + '%</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 10px; border-radius: 6px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Coverage</div>' +
                '<div style="font-size: 0.9rem; font-weight: bold; color: ' + (coverage >= 80 ? 'var(--success)' : coverage >= 50 ? 'var(--accent)' : 'var(--danger)') + ';">' + coverage + '%</div>' +
                '</div>' +
                '</div>';

            // SCHOOL AGE POPULATION & DEMAND
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                '<span style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold;">' + BOOK + ' Education Demand</span>' +
                '<span style="font-size: 0.55rem; color: var(--dim);">Budget: ' + educationBudget + 'g</span>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 6px;">' +
                '<div style="background: var(--bg); padding: 6px 10px; border-radius: 4px; text-align: center; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.45rem; color: var(--dim);">School-Age</div>' +
                '<div style="font-size: 0.8rem; font-weight: bold; color: var(--text);">' + schoolAgePop + '</div>' +
                '</div>' +
                '<div style="background: var(--bg); padding: 6px 10px; border-radius: 4px; text-align: center; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.45rem; color: var(--dim);">Capacity</div>' +
                '<div style="font-size: 0.8rem; font-weight: bold; color: var(--text);">' + totalCapacity + '</div>' +
                '</div>' +
                '<div style="background: var(--bg); padding: 6px 10px; border-radius: 4px; text-align: center; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.45rem; color: var(--dim);">Gap</div>' +
                '<div style="font-size: 0.8rem; font-weight: bold; color: ' + (schoolAgePop > totalCapacity ? 'var(--danger)' : 'var(--success)') + ';">' + Math.max(0, schoolAgePop - totalCapacity) + '</div>' +
                '</div>' +
                '</div>' +
                (healthScore && healthScore.needsMoreSchools ? '<div style="margin-top: 6px; padding: 4px 8px; background: rgba(200, 112, 64, 0.15); border-radius: 4px; font-size: 0.5rem; color: var(--warn);">' + _icon('WARNING') + ' ' + (healthScore.recommendation || 'More schools needed') + '</div>' : '') +
                '</div>';

            // PUBLIC SCHOOLS
            if (publicSchools.length > 0) {
                content += _renderSchoolSection('Public Schools', publicSchools, locationId, 'public');
            }

            // RELIGIOUS SCHOOLS
            if (religiousSchools.length > 0) {
                content += _renderSchoolSection('Religious Schools', religiousSchools, locationId, 'religious');
            }

            // PRIVATE SCHOOLS
            if (privateSchools.length > 0) {
                content += _renderSchoolSection('Private Schools', privateSchools, locationId, 'private');
            }

            // NO SCHOOLS MESSAGE
            if (institutions.length === 0) {
                content += '<div style="background: var(--bg2); padding: 24px; border-radius: 8px; text-align: center; color: var(--dim); font-size: 0.7rem; margin-bottom: 16px; border: 1px solid var(--border);">' +
                    BOOK + ' No educational institutions in this settlement.<br>' +
                    '<span style="font-size: 0.6rem;">Use the buttons above to create schools.</span>' +
                    '</div>';
            }

            // INFO FOOTER
            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                INFO + ' Education improves literacy and prosperity. Public schools are free, private schools charge tuition, and religious schools are faith-based.' +
                '</div>';

            content += '</div>';

            container.innerHTML = content;

            _attachActionListeners(container, locationId);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 6. RENDER SCHOOL SECTION
    // =========================================================================

    function _renderSchoolSection(title, schools, locationId, type) {
        var BOOK = _icon('BOOK');
        var PERSON = _icon('PERSON');
        var CROWN = _icon('CROWN');
        var INFO = _icon('CIRCLE_DOT');
        var EDIT = _icon('EDIT');
        var TRASH = _icon('TRASH');

        var html = '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
            '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + BOOK + ' ' + title + ' (' + schools.length + ')</div>';

        for (var i = 0; i < schools.length; i++) {
            var s = schools[i];
            var studentCount = s.students ? s.students.length : 0;
            var teacherCount = s.teachers ? s.teachers.length : 0;
            var capacity = s.maxStudents || 0;
            var reputation = s.reputation || 50;
            var capacityUsed = capacity > 0 ? Math.round((studentCount / capacity) * 100) : 0;
            var statusColor = s.status === 'active' ? 'var(--success)' : 'var(--danger)';

            var religionInfo = '';
            if (s.isReligiousSchool && s.religionId) {
                var religion = _getReligion(s.religionId);
                religionInfo = ' · <span style="color: var(--warn);">' + (religion ? _escapeHtml(religion.name) : 'Unknown faith') + '</span>';
            }

            var headmasterName = 'None';
            if (s.headmaster && s.headmaster.characterId) {
                var hm = _getCharacterById(s.headmaster.characterId);
                if (hm) {
                    headmasterName = _escapeHtml(hm.name + (hm.surname ? ' ' + hm.surname : ''));
                }
            }

            html +=
                '<div class="school-item" data-school-id="' + s.id + '" style="' +
                'background: var(--bg); border: 1px solid var(--border); border-left: 3px solid ' + (type === 'public' ? 'var(--accent)' : type === 'religious' ? 'var(--warn)' : 'var(--bg4)') + ';' +
                'border-radius: 6px; padding: 10px 14px; margin-bottom: 6px;' +
                '">' +
                '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px;">' +
                '<div style="flex: 1; min-width: 0;">' +
                '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">' +
                '<span style="font-size: 0.7rem; font-weight: bold; color: var(--text);">' + _escapeHtml(s.name) + '</span>' +
                '<span style="font-size: 0.5rem; color: var(--dim); padding: 1px 6px; border: 1px solid var(--border); border-radius: 8px;">' + _escapeHtml(s.typeName || s.type || 'Unknown') + '</span>' +
                '<span style="font-size: 0.5rem; color: ' + statusColor + '; padding: 1px 6px; border: 1px solid ' + statusColor + '; border-radius: 8px;">' + (s.status === 'active' ? 'Active' : 'Demolished') + '</span>' +
                '<span style="font-size: 0.5rem; color: var(--dim); padding: 1px 6px; border: 1px solid var(--dim); border-radius: 8px;">' + STAR + ' ' + reputation + '</span>' +
                (s.isReligiousSchool ? '<span style="font-size: 0.5rem; color: var(--warn); padding: 1px 6px; border: 1px solid var(--warn); border-radius: 8px;">' + _icon('CIRCLE_DOT') + ' Religious</span>' : '') +
                (s.ownershipType === 'public' ? '<span style="font-size: 0.5rem; color: var(--accent); padding: 1px 6px; border: 1px solid var(--accent); border-radius: 8px;">Free</span>' : '') +
                (s.ownershipType === 'private' ? '<span style="font-size: 0.5rem; color: var(--success); padding: 1px 6px; border: 1px solid var(--success); border-radius: 8px;">' + COIN + ' ' + (s.tuitionPerYear || 0) + 'g</span>' : '') +
                religionInfo +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">' +
                PERSON + ' Students: ' + studentCount + '/' + capacity + ' (' + capacityUsed + '%)' +
                ' · Teachers: ' + teacherCount +
                ' · Headmaster: ' + headmasterName +
                (s.foundedYear ? ' · Founded: ' + s.foundedYear : '') +
                '</div>' +
                '</div>' +
                '<div style="display: flex; gap: 4px; flex-shrink: 0;">' +
                '<button class="school-detail-btn" data-school-id="' + s.id + '" style="background: none; border: none; color: var(--accent); cursor: pointer; font-size: 0.55rem; padding: 2px 6px;">' + INFO + ' Details</button>' +
                '<button class="school-edit-btn" data-school-id="' + s.id + '" style="background: none; border: none; color: var(--text); cursor: pointer; font-size: 0.55rem; padding: 2px 6px;">' + EDIT + ' Edit</button>' +
                '<button class="school-delete-btn" data-school-id="' + s.id + '" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 0.55rem; padding: 2px 6px;">' + TRASH + ' Delete</button>' +
                '</div>' +
                '</div>' +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 7. ACTION EVENT LISTENERS
    // =========================================================================

    function _attachActionListeners(container, locationId) {
        var actionBtns = container.querySelectorAll('.education-action-btn');
        for (var i = 0; i < actionBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var action = this.dataset.action;
                    switch (action) {
                        case 'create-public':
                            _openCreateSchoolModal(locationId, 'public');
                            break;
                        case 'create-private':
                            _openCreateSchoolModal(locationId, 'private');
                            break;
                        case 'create-religious':
                            _openCreateSchoolModal(locationId, 'religious');
                            break;
                        case 'refresh':
                            renderSettlementEducation('tab-education', locationId);
                            break;
                    }
                });
            })(actionBtns[i]);
        }

        var detailBtns = container.querySelectorAll('.school-detail-btn');
        for (var i = 0; i < detailBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var schoolId = this.dataset.schoolId;
                    _openSchoolDetailsModal(schoolId, locationId);
                });
            })(detailBtns[i]);
        }

        var editBtns = container.querySelectorAll('.school-edit-btn');
        for (var i = 0; i < editBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var schoolId = this.dataset.schoolId;
                    _openEditSchoolModal(schoolId, locationId);
                });
            })(editBtns[i]);
        }

        var deleteBtns = container.querySelectorAll('.school-delete-btn');
        for (var i = 0; i < deleteBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var schoolId = this.dataset.schoolId;
                    _deleteSchoolAction(schoolId, locationId);
                });
            })(deleteBtns[i]);
        }
    }

    // =========================================================================
    // 8. CREATE SCHOOL MODAL
    // =========================================================================

    function _openCreateSchoolModal(locationId, ownershipType) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var place = _getPlaceById(locationId);
            var institutionTypes = _getAllInstitutionTypes();
            var religions = _getAllReligions();

            var typeOptions = '';
            var displayOwnership = ownershipType.charAt(0).toUpperCase() + ownershipType.slice(1);
            var title = 'Create ' + displayOwnership + ' School';

            var filteredTypes = institutionTypes;
            if (ownershipType === 'religious') {
                filteredTypes = institutionTypes.filter(function(t) {
                    return t.type === 'religious_seminary' || t.type === 'monastic_school' || t.type === 'cathedral_school';
                });
            } else if (ownershipType === 'public') {
                filteredTypes = institutionTypes.filter(function(t) {
                    return t.type === 'village_school' || t.type === 'guild_hall' || t.type === 'university';
                });
            } else {
                filteredTypes = institutionTypes.filter(function(t) {
                    return t.type === 'court_tutor' || t.type === 'specialized_school' || t.type === 'guild_hall';
                });
            }

            if (filteredTypes.length === 0) {
                filteredTypes = institutionTypes;
            }

            for (var i = 0; i < filteredTypes.length; i++) {
                var t = filteredTypes[i];
                typeOptions += '<option value="' + t.id + '">' + _escapeHtml(t.name) + ' (Capacity: ' + t.maxStudents + ', Rep: ' + t.baseReputation + ')</option>';
            }

            if (!typeOptions) {
                typeOptions = '<option value="">No suitable types available</option>';
            }

            var religionOptions = '';
            if (ownershipType === 'religious') {
                if (religions.length === 0) {
                    religionOptions = '<option value="">No religions available</option>';
                } else {
                    for (var i = 0; i < religions.length; i++) {
                        religionOptions += '<option value="' + religions[i].id + '">' + _escapeHtml(religions[i].name) + '</option>';
                    }
                }
            }

            var INFO = _icon('CIRCLE_DOT');

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">' + title + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place ? place.displayName : 'Unknown') + '</div>' +
                '<div style="font-size: 0.55rem; color: ' + (ownershipType === 'public' ? 'var(--accent)' : ownershipType === 'religious' ? 'var(--warn)' : 'var(--success)') + '; margin-top: 4px;">' +
                (ownershipType === 'public' ? 'Public schools are free and funded by the settlement.' :
                 ownershipType === 'religious' ? 'Religious schools teach doctrine and are faith-based.' :
                 'Private schools charge tuition and generate profit for owners.') +
                '</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">School Name</label>' +
                '<input type="text" id="schoolName" placeholder="e.g., Royal Academy" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">School Type</label>' +
                '<select id="schoolType" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                typeOptions +
                '</select>' +
                '</div>';

            if (ownershipType === 'religious') {
                content +=
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Religion</label>' +
                    '<select id="schoolReligion" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                    religionOptions +
                    '</select>' +
                    '</div>' +

                    '<div class="form-group" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">' +
                    '<input type="checkbox" id="teachesDoctrine" checked style="width:16px;height:16px;">' +
                    '<label style="font-size:0.65rem; color:var(--dim); cursor:pointer;">Teaches Religious Doctrine</label>' +
                    '</div>' +

                    '<div class="form-group" style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">' +
                    '<input type="checkbox" id="hasMandatoryWorship" style="width:16px;height:16px;">' +
                    '<label style="font-size:0.65rem; color:var(--dim); cursor:pointer;">Has Mandatory Worship</label>' +
                    '</div>';
            }

            if (ownershipType === 'private') {
                content +=
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Tuition (gold/year)</label>' +
                    '<input type="number" id="schoolTuition" value="20" min="0" step="5" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                    '</div>';
            }

            content +=
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div><label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Max Students</label>' +
                '<input type="number" id="schoolMaxStudents" value="30" min="1" step="5" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:6px; font-size:0.65rem; color:var(--text);"></div>' +
                '<div><label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Starting Reputation</label>' +
                '<input type="number" id="schoolReputation" value="50" min="0" max="100" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:6px; font-size:0.65rem; color:var(--text);"></div>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                INFO + ' Schools improve literacy and prosperity. Public schools require settlement funding to operate effectively.' +
                '</div>' +
                '</div>';

            _openModal({
                title: title,
                content: content,
                confirmText: 'Create School',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('schoolName').value.trim();
                    if (!name) {
                        _showToast('School name is required', 'error');
                        return false;
                    }

                    var typeId = document.getElementById('schoolType').value;
                    if (!typeId) {
                        _showToast('Please select a school type', 'error');
                        return false;
                    }

                    var options = {
                        ownershipType: ownershipType,
                        maxStudents: parseInt(document.getElementById('schoolMaxStudents').value) || 30,
                        initialReputation: parseInt(document.getElementById('schoolReputation').value) || 50,
                        foundedYear: _getCurrentYear()
                    };

                    if (ownershipType === 'private') {
                        options.tuitionPerYear = parseInt(document.getElementById('schoolTuition').value) || 20;
                    }

                    if (ownershipType === 'religious') {
                        var religionId = document.getElementById('schoolReligion').value;
                        if (!religionId) {
                            _showToast('Please select a religion', 'error');
                            return false;
                        }
                        options.religionId = religionId;
                        options.teachesDoctrine = document.getElementById('teachesDoctrine').checked;
                        options.hasMandatoryWorship = document.getElementById('hasMandatoryWorship').checked;

                        var result = _createReligiousSchool(religionId, name, locationId, options);
                        if (result && result.success) {
                            _showToast('Religious school created: ' + result.data.name, 'success');
                            _closeTopModal();
                            _modalOpen = false;
                            renderSettlementEducation('tab-education', locationId);
                            return true;
                        } else {
                            _showToast('Failed to create religious school: ' + (result ? result.reason : 'Unknown error'), 'error');
                            _modalOpen = false;
                            return false;
                        }
                    } else {
                        var result = _createInstitution(name, typeId, locationId, options);
                        if (result && result.success) {
                            _showToast('School created: ' + result.data.name, 'success');
                            _closeTopModal();
                            _modalOpen = false;
                            renderSettlementEducation('tab-education', locationId);
                            return true;
                        } else {
                            _showToast('Failed to create school: ' + (result ? result.reason : 'Unknown error'), 'error');
                            _modalOpen = false;
                            return false;
                        }
                    }
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening modal', 'error');
        }
    }

    // =========================================================================
    // 9. EDIT SCHOOL MODAL
    // =========================================================================

    function _openEditSchoolModal(schoolId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var details = _getInstitutionDetails(schoolId);
            if (!details || !details.institution) {
                _showToast('School not found', 'error');
                _modalOpen = false;
                return;
            }

            var school = details.institution;
            var institutionTypes = _getAllInstitutionTypes();

            var typeOptions = '';
            for (var i = 0; i < institutionTypes.length; i++) {
                var t = institutionTypes[i];
                var selected = (t.id === school.type) ? 'selected' : '';
                typeOptions += '<option value="' + t.id + '" ' + selected + '>' + _escapeHtml(t.name) + '</option>';
            }

            var INFO = _icon('CIRCLE_DOT');

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">Edit School</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(school.name) + '</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">School Name</label>' +
                '<input type="text" id="editSchoolName" value="' + _escapeHtml(school.name) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">School Type</label>' +
                '<select id="editSchoolType" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                typeOptions +
                '</select>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div><label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Max Students</label>' +
                '<input type="number" id="editSchoolMaxStudents" value="' + (school.maxStudents || 30) + '" min="1" step="5" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:6px; font-size:0.65rem; color:var(--text);"></div>' +
                '<div><label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Reputation</label>' +
                '<input type="number" id="editSchoolReputation" value="' + (school.reputation || 50) + '" min="0" max="100" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:6px; font-size:0.65rem; color:var(--text);"></div>' +
                '</div>' +

                (school.ownershipType === 'private' ? '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Tuition (gold/year)</label>' +
                    '<input type="number" id="editSchoolTuition" value="' + (school.tuitionPerYear || 20) + '" min="0" step="5" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                    '</div>' : '') +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                INFO + ' Changes will take effect immediately. Student capacity changes may affect enrollment.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Edit School',
                content: content,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('editSchoolName').value.trim();
                    if (!name) {
                        _showToast('School name is required', 'error');
                        return false;
                    }

                    var updates = {
                        name: name,
                        type: document.getElementById('editSchoolType').value,
                        maxStudents: parseInt(document.getElementById('editSchoolMaxStudents').value) || 30,
                        reputation: parseInt(document.getElementById('editSchoolReputation').value) || 50
                    };

                    if (school.ownershipType === 'private') {
                        updates.tuitionPerYear = parseInt(document.getElementById('editSchoolTuition').value) || 20;
                    }

                    var result = _updateInstitution(schoolId, updates);
                    if (result) {
                        _showToast('School updated: ' + name, 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderSettlementEducation('tab-education', locationId);
                        return true;
                    } else {
                        _showToast('Failed to update school', 'error');
                        _modalOpen = false;
                        return false;
                    }
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening edit modal', 'error');
        }
    }

    // =========================================================================
    // 10. SCHOOL DETAILS MODAL
    // =========================================================================

    function _openSchoolDetailsModal(schoolId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var details = _getInstitutionDetails(schoolId);
            if (!details || !details.institution) {
                _showToast('School not found', 'error');
                _modalOpen = false;
                return;
            }

            var school = details.institution;
            var studentCount = details.studentCount || 0;
            var teacherCount = details.teacherCount || 0;
            var graduateCount = details.graduateCount || 0;
            var capacityUsed = details.capacityUsed || 0;

            var headmaster = details.headmaster ? details.headmaster.details : null;
            var headmasterChar = headmaster ? _getCharacterById(headmaster.characterId) : null;

            var BOOK = _icon('BOOK');
            var PERSON = _icon('PERSON');
            var CROWN = _icon('CROWN');
            var STAR = _icon('STAR_4');
            var INFO = _icon('CIRCLE_DOT');
            var COIN = _icon('COIN');

            var religionInfo = '';
            if (school.isReligiousSchool && school.religionId) {
                var religion = _getReligion(school.religionId);
                religionInfo = '<div style="background: var(--bg); padding: 8px 12px; border-radius: 4px; margin-bottom: 12px; border-left: 3px solid var(--warn); border: 1px solid var(--border);">' +
                    '<span style="font-size: 0.6rem; color: var(--warn); font-weight: bold;">' + _icon('CIRCLE_DOT') + ' Religious School</span>' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">' +
                    'Religion: ' + (religion ? _escapeHtml(religion.name) : 'Unknown') +
                    (school.teachesDoctrine ? ' · Teaches Doctrine' : '') +
                    (school.hasMandatoryWorship ? ' · Mandatory Worship' : '') +
                    '</div>' +
                    '</div>';
            }

            var ownershipLabel = school.ownershipType === 'public' ? 'Public (Free)' :
                                school.ownershipType === 'religious' ? 'Religious' :
                                'Private (' + (school.tuitionPerYear || 0) + 'g/yr)';

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">' + BOOK + ' ' + _escapeHtml(school.name) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(school.typeName || school.type || 'Unknown') + ' · ' + ownershipLabel + '</div>' +
                '</div>' +

                religionInfo +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 0.7rem; margin-bottom: 16px;">' +
                '<div><span style="color: var(--dim);">Status:</span> <span style="color: var(--text);">' + (school.status === 'active' ? 'Active' : 'Demolished') + '</span></div>' +
                '<div><span style="color: var(--dim);">Founded:</span> <span style="color: var(--text);">' + (school.foundedYear || 'Unknown') + '</span></div>' +
                '<div><span style="color: var(--dim);">Reputation:</span> <span style="color: ' + ((school.reputation || 50) >= 70 ? 'var(--success)' : (school.reputation || 50) >= 40 ? 'var(--accent)' : 'var(--danger)') + ';">' + (school.reputation || 50) + '</span></div>' +
                '<div><span style="color: var(--dim);">Capacity:</span> <span style="color: var(--text);">' + studentCount + '/' + (school.maxStudents || 0) + ' (' + capacityUsed + '%)</span></div>' +
                '<div><span style="color: var(--dim);">Teachers:</span> <span style="color: var(--text);">' + teacherCount + '</span></div>' +
                '<div><span style="color: var(--dim);">Graduates:</span> <span style="color: var(--text);">' + graduateCount + '</span></div>' +
                '<div><span style="color: var(--dim);">Headmaster:</span> <span style="color: var(--text);">' + (headmasterChar ? _escapeHtml(headmasterChar.name + (headmasterChar.surname ? ' ' + headmasterChar.surname : '')) : 'None') + '</span></div>' +
                '<div><span style="color: var(--dim);">Location:</span> <span style="color: var(--text);">' + _escapeHtml(school.locationName || 'Unknown') + '</span></div>' +
                '</div>';

            // Students list
            if (details.students && details.students.length > 0) {
                content += '<div style="background: var(--bg); padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; border: 1px solid var(--border);">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">' +
                    '<div style="font-size: 0.6rem; color: var(--accent-light); font-weight: bold;">' + PERSON + ' Students (' + details.students.length + ')</div>' +
                    '<button class="school-enroll-btn" data-school-id="' + schoolId + '" style="font-size: 0.5rem; padding: 2px 10px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + PERSON + ' Enroll</button>' +
                    '</div>';

                for (var i = 0; i < Math.min(5, details.students.length); i++) {
                    var s = details.students[i];
                    var student = _getCharacterById(s.studentId);
                    var name = student ? _escapeHtml(student.name + (student.surname ? ' ' + student.surname : '')) : 'Unknown';
                    var graduated = s.graduated || false;

                    content += '<div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 0; border-bottom: 1px solid var(--border-light); font-size: 0.55rem;">' +
                        '<span style="color: var(--text);">' + (graduated ? '🎓 ' : '') + name + '</span>' +
                        '<div style="display: flex; gap: 6px; align-items: center;">' +
                        (graduated ? '<span style="color: var(--success); font-size: 0.5rem;">Graduated</span>' : '<span style="color: var(--dim); font-size: 0.5rem;">Enrolled ' + (s.enrollmentYear || '?') + '</span>') +
                        (student && !graduated ? '<button class="student-graduate-btn" data-school-id="' + schoolId + '" data-student-id="' + s.studentId + '" style="background: none; border: none; color: var(--success); cursor: pointer; font-size: 0.5rem;">' + _icon('CHECK_SIMPLE') + ' Graduate</button>' : '') +
                        (student && !graduated ? '<button class="student-withdraw-btn" data-school-id="' + schoolId + '" data-student-id="' + s.studentId + '" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 0.5rem;">' + _icon('X_HEAVY') + ' Withdraw</button>' : '') +
                        '</div>' +
                        '</div>';
                }

                if (details.students.length > 5) {
                    content += '<div style="font-size: 0.5rem; color: var(--dim); padding-top: 4px;">+' + (details.students.length - 5) + ' more</div>';
                }

                content += '</div>';
            } else {
                content += '<div style="background: var(--bg); padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; border: 1px solid var(--border);">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">' +
                    '<div style="font-size: 0.6rem; color: var(--accent-light); font-weight: bold;">' + PERSON + ' Students</div>' +
                    '<button class="school-enroll-btn" data-school-id="' + schoolId + '" style="font-size: 0.5rem; padding: 2px 10px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + PERSON + ' Enroll</button>' +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim); padding: 4px 0;">No students enrolled</div>' +
                    '</div>';
            }

            // Teachers list
            if (details.teachers && details.teachers.length > 0) {
                content += '<div style="background: var(--bg); padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; border: 1px solid var(--border);">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">' +
                    '<div style="font-size: 0.6rem; color: var(--accent-light); font-weight: bold;">' + PERSON + ' Teachers (' + details.teachers.length + ')</div>' +
                    '<button class="school-hire-teacher-btn" data-school-id="' + schoolId + '" style="font-size: 0.5rem; padding: 2px 10px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + PERSON + ' Hire</button>' +
                    '</div>';

                for (var i = 0; i < Math.min(5, details.teachers.length); i++) {
                    var t = details.teachers[i];
                    var teacher = _getCharacterById(t.teacherId);
                    var name = teacher ? _escapeHtml(teacher.name + (teacher.surname ? ' ' + teacher.surname : '')) : 'Unknown';

                    content += '<div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 0; border-bottom: 1px solid var(--border-light); font-size: 0.55rem;">' +
                        '<span style="color: var(--text);">' + name + '</span>' +
                        '<div style="display: flex; gap: 6px; align-items: center;">' +
                        '<span style="color: var(--dim); font-size: 0.5rem;">' + _escapeHtml(t.subjectName || t.subjectId || 'General') + '</span>' +
                        '<button class="teacher-fire-btn" data-school-id="' + schoolId + '" data-teacher-id="' + t.teacherId + '" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 0.5rem;">' + _icon('X_HEAVY') + ' Fire</button>' +
                        '</div>' +
                        '</div>';
                }

                if (details.teachers.length > 5) {
                    content += '<div style="font-size: 0.5rem; color: var(--dim); padding-top: 4px;">+' + (details.teachers.length - 5) + ' more</div>';
                }

                content += '</div>';
            } else {
                content += '<div style="background: var(--bg); padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; border: 1px solid var(--border);">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">' +
                    '<div style="font-size: 0.6rem; color: var(--accent-light); font-weight: bold;">' + PERSON + ' Teachers</div>' +
                    '<button class="school-hire-teacher-btn" data-school-id="' + schoolId + '" style="font-size: 0.5rem; padding: 2px 10px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + PERSON + ' Hire</button>' +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim); padding: 4px 0;">No teachers hired</div>' +
                    '</div>';
            }

            // Headmaster management
            content += '<div style="background: var(--bg); padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; border: 1px solid var(--border);">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent-light); font-weight: bold;">' + CROWN + ' Headmaster</div>' +
                (headmasterChar ? '<button class="school-end-headmaster-btn" data-school-id="' + schoolId + '" style="font-size: 0.5rem; padding: 2px 10px; background: var(--bg3); border: 1px solid var(--danger); border-radius: 4px; cursor: pointer; color: var(--danger);">' + _icon('X_HEAVY') + ' End Term</button>' :
                                  '<button class="school-set-headmaster-btn" data-school-id="' + schoolId + '" style="font-size: 0.5rem; padding: 2px 10px; background: var(--bg3); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer; color: var(--accent-light);">' + CROWN + ' Appoint</button>') +
                '</div>' +
                '<div style="font-size: 0.65rem; color: var(--text);">' +
                (headmasterChar ? _escapeHtml(headmasterChar.name + (headmasterChar.surname ? ' ' + headmasterChar.surname : '')) + ' (' + (headmaster.title || 'Headmaster') + ' since ' + (headmaster.startYear || '?') + ')' : 'No headmaster appointed') +
                '</div>' +
                '</div>';

            // Actions
            content += '<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;">' +
                '<button class="school-process-btn" data-school-id="' + schoolId + '" style="font-size: 0.55rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer; color: var(--accent-light);">' + GEAR + ' Process Year</button>' +
                '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim); margin-top: 12px;">' +
                INFO + ' Process Year advances student learning and checks for graduation readiness.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'School Details: ' + school.name,
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _modalOpen = false;
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

            setTimeout(function() {
                var enrollBtn = document.querySelector('.school-enroll-btn');
                if (enrollBtn) {
                    enrollBtn.addEventListener('click', function() {
                        var id = this.dataset.schoolId;
                        _closeTopModal();
                        _modalOpen = false;
                        _openEnrollStudentModal(id, locationId);
                    });
                }

                var hireBtn = document.querySelector('.school-hire-teacher-btn');
                if (hireBtn) {
                    hireBtn.addEventListener('click', function() {
                        var id = this.dataset.schoolId;
                        _closeTopModal();
                        _modalOpen = false;
                        _openHireTeacherModal(id, locationId);
                    });
                }

                var setHeadBtn = document.querySelector('.school-set-headmaster-btn');
                if (setHeadBtn) {
                    setHeadBtn.addEventListener('click', function() {
                        var id = this.dataset.schoolId;
                        _closeTopModal();
                        _modalOpen = false;
                        _openSetHeadmasterModal(id, locationId);
                    });
                }

                var endHeadBtn = document.querySelector('.school-end-headmaster-btn');
                if (endHeadBtn) {
                    endHeadBtn.addEventListener('click', function() {
                        var id = this.dataset.schoolId;
                        _closeTopModal();
                        _modalOpen = false;
                        _endHeadmasterAction(id, locationId);
                    });
                }

                var gradBtns = document.querySelectorAll('.student-graduate-btn');
                for (var i = 0; i < gradBtns.length; i++) {
                    (function(btn) {
                        btn.addEventListener('click', function() {
                            var schoolId = this.dataset.schoolId;
                            var studentId = this.dataset.studentId;
                            _closeTopModal();
                            _modalOpen = false;
                            _openGraduateStudentModal(schoolId, studentId, locationId);
                        });
                    })(gradBtns[i]);
                }

                var withdrawBtns = document.querySelectorAll('.student-withdraw-btn');
                for (var i = 0; i < withdrawBtns.length; i++) {
                    (function(btn) {
                        btn.addEventListener('click', function() {
                            var schoolId = this.dataset.schoolId;
                            var studentId = this.dataset.studentId;
                            _closeTopModal();
                            _modalOpen = false;
                            _withdrawStudentAction(schoolId, studentId, locationId);
                        });
                    })(withdrawBtns[i]);
                }

                var fireBtns = document.querySelectorAll('.teacher-fire-btn');
                for (var i = 0; i < fireBtns.length; i++) {
                    (function(btn) {
                        btn.addEventListener('click', function() {
                            var schoolId = this.dataset.schoolId;
                            var teacherId = this.dataset.teacherId;
                            _closeTopModal();
                            _modalOpen = false;
                            _fireTeacherAction(schoolId, teacherId, locationId);
                        });
                    })(fireBtns[i]);
                }

                var processBtn = document.querySelector('.school-process-btn');
                if (processBtn) {
                    processBtn.addEventListener('click', function() {
                        var id = this.dataset.schoolId;
                        _closeTopModal();
                        _modalOpen = false;
                        _processSchoolAction(id, locationId);
                    });
                }
            }, 100);

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening details', 'error');
        }
    }

    // =========================================================================
    // 11. ENROLL STUDENT MODAL
    // =========================================================================

    function _openEnrollStudentModal(schoolId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var details = _getInstitutionDetails(schoolId);
            if (!details || !details.institution) {
                _showToast('School not found', 'error');
                _modalOpen = false;
                return;
            }

            var school = details.institution;
            var currentStudents = details.studentCount || 0;
            var maxStudents = school.maxStudents || 0;

            if (currentStudents >= maxStudents) {
                _showToast('School is at capacity (' + currentStudents + '/' + maxStudents + ')', 'warning');
                _modalOpen = false;
                return;
            }

            if (typeof window.openCharacterSelector === 'function') {
                window.openCharacterSelector({
                    title: 'Enroll Student in ' + school.name,
                    filters: {
                        status: 'all',
                        showDeceased: false,
                        location: locationId
                    },
                    onSelect: function(character) {
                        if (!character) {
                            _modalOpen = false;
                            return;
                        }

                        var result = _enrollStudent(schoolId, character.id, _getCurrentYear());
                        if (result) {
                            _showToast('Enrolled ' + character.name + ' in ' + school.name, 'success');
                            _closeTopModal();
                            _modalOpen = false;
                            renderSettlementEducation('tab-education', locationId);
                        } else {
                            _showToast('Failed to enroll student', 'error');
                            _modalOpen = false;
                        }
                    },
                    onCancel: function() {
                        _modalOpen = false;
                    }
                });
            } else {
                _showToast('Character selector not available', 'error');
                _modalOpen = false;
            }

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening enroll modal', 'error');
        }
    }

    // =========================================================================
    // 12. HIRE TEACHER MODAL
    // =========================================================================

    function _openHireTeacherModal(schoolId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var details = _getInstitutionDetails(schoolId);
            if (!details || !details.institution) {
                _showToast('School not found', 'error');
                _modalOpen = false;
                return;
            }

            var school = details.institution;

            if (typeof window.openCharacterSelector === 'function') {
                window.openCharacterSelector({
                    title: 'Hire Teacher for ' + school.name,
                    filters: {
                        status: 'all',
                        showDeceased: false,
                        location: locationId
                    },
                    onSelect: function(character) {
                        if (!character) {
                            _modalOpen = false;
                            return;
                        }

                        var subjectId = 'general';
                        if (character.professions && character.professions.length > 0) {
                            subjectId = character.professions[0].id || 'general';
                        }

                        var result = _hireTeacher(schoolId, character.id, subjectId);
                        if (result) {
                            _showToast('Hired ' + character.name + ' as a teacher', 'success');
                            _closeTopModal();
                            _modalOpen = false;
                            renderSettlementEducation('tab-education', locationId);
                        } else {
                            _showToast('Failed to hire teacher', 'error');
                            _modalOpen = false;
                        }
                    },
                    onCancel: function() {
                        _modalOpen = false;
                    }
                });
            } else {
                _showToast('Character selector not available', 'error');
                _modalOpen = false;
            }

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening hire modal', 'error');
        }
    }

    // =========================================================================
    // 13. SET HEADMASTER MODAL
    // =========================================================================

    function _openSetHeadmasterModal(schoolId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var details = _getInstitutionDetails(schoolId);
            if (!details || !details.institution) {
                _showToast('School not found', 'error');
                _modalOpen = false;
                return;
            }

            var school = details.institution;

            if (typeof window.openCharacterSelector === 'function') {
                window.openCharacterSelector({
                    title: 'Appoint Headmaster for ' + school.name,
                    filters: {
                        status: 'all',
                        showDeceased: false,
                        location: locationId
                    },
                    onSelect: function(character) {
                        if (!character) {
                            _modalOpen = false;
                            return;
                        }

                        var result = _setHeadmaster(schoolId, character.id, 'Headmaster', _getCurrentYear());
                        if (result) {
                            _showToast('Appointed ' + character.name + ' as Headmaster', 'success');
                            _closeTopModal();
                            _modalOpen = false;
                            renderSettlementEducation('tab-education', locationId);
                        } else {
                            _showToast('Failed to appoint headmaster', 'error');
                            _modalOpen = false;
                        }
                    },
                    onCancel: function() {
                        _modalOpen = false;
                    }
                });
            } else {
                _showToast('Character selector not available', 'error');
                _modalOpen = false;
            }

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening set headmaster modal', 'error');
        }
    }

    // =========================================================================
    // 14. GRADUATE STUDENT MODAL
    // =========================================================================

    function _openGraduateStudentModal(schoolId, studentId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var student = _getCharacterById(studentId);
            if (!student) {
                _showToast('Student not found', 'error');
                _modalOpen = false;
                return;
            }

            var details = _getInstitutionDetails(schoolId);
            if (!details || !details.institution) {
                _showToast('School not found', 'error');
                _modalOpen = false;
                return;
            }

            var roles = _getAllRoles();
            var roleOptions = '<option value="">No role (graduate without role)</option>';
            for (var i = 0; i < roles.length; i++) {
                roleOptions += '<option value="' + roles[i].id + '">' + _escapeHtml(roles[i].name) + '</option>';
            }

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">Graduate Student</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(student.name + (student.surname ? ' ' + student.surname : '')) + '</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Grant Role (optional)</label>' +
                '<select id="gradRole" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                roleOptions +
                '</select>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                'Graduation will grant the selected role (if any) and mark the student as graduated.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Graduate Student',
                content: content,
                confirmText: 'Graduate',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var roleId = document.getElementById('gradRole').value || null;

                    var result = _graduateStudent(schoolId, studentId, _getCurrentYear(), roleId);
                    if (result) {
                        _showToast(student.name + ' graduated!', 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderSettlementEducation('tab-education', locationId);
                        return true;
                    } else {
                        _showToast('Failed to graduate student', 'error');
                        _modalOpen = false;
                        return false;
                    }
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening graduate modal', 'error');
        }
    }

    // =========================================================================
    // 15. ACTION FUNCTIONS
    // =========================================================================

    function _processSchoolAction(schoolId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var details = _getInstitutionDetails(schoolId);
            if (!details || !details.institution) {
                _showToast('School not found', 'error');
                _modalOpen = false;
                return;
            }

            var school = details.institution;

            _confirmDialog(
                'Process ' + school.name + ' for the current year?\n\n' +
                'This will advance student learning and check for graduation readiness.',
                'Process School Year',
                function() {
                    if (typeof EducationAnnual !== 'undefined' && EducationAnnual.processAnnualInstitution) {
                        var result = EducationAnnual.processAnnualInstitution(schoolId, _getCurrentYear());
                        if (result) {
                            _showToast('Processed ' + school.name + ' (' + (result.graduations || 0) + ' graduations, ' + (result.skillGains || 0) + ' skill gains)', 'success');
                            _closeTopModal();
                            _modalOpen = false;
                            renderSettlementEducation('tab-education', locationId);
                        } else {
                            _showToast('Failed to process school', 'error');
                            _modalOpen = false;
                        }
                    } else {
                        _showToast('Annual processing not available', 'error');
                        _modalOpen = false;
                    }
                }
            );

        } catch(e) {
            _modalOpen = false;
            _showToast('Error processing school', 'error');
        }
    }

    function _endHeadmasterAction(schoolId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var details = _getInstitutionDetails(schoolId);
            if (!details || !details.institution) {
                _showToast('School not found', 'error');
                _modalOpen = false;
                return;
            }

            var school = details.institution;
            if (!school.headmaster) {
                _showToast('No headmaster to end', 'warning');
                _modalOpen = false;
                return;
            }

            _confirmDialog(
                'End the current headmaster\'s term?\n\n' +
                'This will remove the headmaster from their position.',
                'End Headmaster Term',
                function() {
                    var result = _endHeadmasterTerm(schoolId, _getCurrentYear(), 'Term ended');
                    if (result) {
                        _showToast('Headmaster term ended', 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderSettlementEducation('tab-education', locationId);
                    } else {
                        _showToast('Failed to end headmaster term', 'error');
                        _modalOpen = false;
                    }
                }
            );

        } catch(e) {
            _modalOpen = false;
            _showToast('Error ending headmaster term', 'error');
        }
    }

    function _withdrawStudentAction(schoolId, studentId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var student = _getCharacterById(studentId);
            var details = _getInstitutionDetails(schoolId);
            if (!details || !details.institution) {
                _showToast('School not found', 'error');
                _modalOpen = false;
                return;
            }

            _confirmDialog(
                'Withdraw ' + (student ? student.name : 'this student') + ' from ' + details.institution.name + '?',
                'Withdraw Student',
                function() {
                    var result = _withdrawStudent(schoolId, studentId, 'Withdrawn');
                    if (result) {
                        _showToast('Student withdrawn', 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderSettlementEducation('tab-education', locationId);
                    } else {
                        _showToast('Failed to withdraw student', 'error');
                        _modalOpen = false;
                    }
                }
            );

        } catch(e) {
            _modalOpen = false;
            _showToast('Error withdrawing student', 'error');
        }
    }

    function _fireTeacherAction(schoolId, teacherId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var teacher = _getCharacterById(teacherId);
            var details = _getInstitutionDetails(schoolId);
            if (!details || !details.institution) {
                _showToast('School not found', 'error');
                _modalOpen = false;
                return;
            }

            _confirmDialog(
                'Fire ' + (teacher ? teacher.name : 'this teacher') + ' from ' + details.institution.name + '?',
                'Fire Teacher',
                function() {
                    var result = _fireTeacher(schoolId, teacherId, 'Fired');
                    if (result) {
                        _showToast('Teacher fired', 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderSettlementEducation('tab-education', locationId);
                    } else {
                        _showToast('Failed to fire teacher', 'error');
                        _modalOpen = false;
                    }
                }
            );

        } catch(e) {
            _modalOpen = false;
            _showToast('Error firing teacher', 'error');
        }
    }

    function _deleteSchoolAction(schoolId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var details = _getInstitutionDetails(schoolId);
            if (!details || !details.institution) {
                _showToast('School not found', 'error');
                _modalOpen = false;
                return;
            }

            var school = details.institution;

            _confirmDialog(
                'Delete ' + school.name + '?\n\n' +
                'This will permanently remove the school.\n' +
                'All students, teachers, and history will be lost.\n\n' +
                'This action cannot be undone.',
                'Delete School',
                function() {
                    var result = _deleteInstitution(schoolId, true);
                    if (result) {
                        _showToast('School deleted: ' + school.name, 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderSettlementEducation('tab-education', locationId);
                    } else {
                        _showToast('Failed to delete school', 'error');
                        _modalOpen = false;
                    }
                }
            );

        } catch(e) {
            _modalOpen = false;
            _showToast('Error deleting school', 'error');
        }
    }

    // =========================================================================
    // 16. REGISTER WITH TAB SYSTEM
    // =========================================================================

    if (typeof window.registerTabRenderer === 'function') {
        window.registerTabRenderer('education', renderSettlementEducation, true);
    }

    // =========================================================================
    // 17. EXPORTS
    // =========================================================================

    window.renderSettlementEducation = renderSettlementEducation;
    window._renderSettlementEducation = renderSettlementEducation;

})();