/**
 * =============================================================================
 * HOUSEHOLD HOLDINGS TAB (household-holdings-tab.js)
 * =============================================================================
 * 
 * PURPOSE: Modular holdings tab for the Household Manager tool.
 *          Displays all industries (enterprises), private schools, and
 *          owned residences with rental income owned by the household.
 * 
 * UPDATED: Added residences section with rental income display
 *          Uses existing ResidenceSystem for data
 * 
 * DEPENDS ON:
 *   - HouseholdState (household-state.js)
 *   - HouseholdQueries (household-queries.js)
 *   - IndustryState (industry-state.js)
 *   - IndustryQueries (industry-queries.js)
 *   - IndustryCommands (industry-commands.js)
 *   - EducationState (education-state.js)
 *   - EducationQueries (education-queries.js)
 *   - EducationCommands (education-commands.js)
 *   - ResidenceSystem (residence-system.js) - FOR RESIDENCES
 *   - modals-core.js (for modal wrappers)
 *   - ui.js (for toast notifications)
 *   - icons.js (for icons)
 * 
 * ICON POLICY: Uses icons.js - NO emojis
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;
    var _processingAction = false;

    // =========================================================================
    // 2. GET CURRENT HOUSEHOLD ID
    // =========================================================================

    function _getCurrentHouseholdId() {
        if (window._currentHouseholdId) return window._currentHouseholdId;
        if (window.currentHouseholdId) return window.currentHouseholdId;
        if (window.selectedHouseholdId) return window.selectedHouseholdId;
        return null;
    }

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.HouseholdState !== 'undefined' ? window.HouseholdState : null;
    }

    function _getQueries() {
        return typeof window.HouseholdQueries !== 'undefined' ? window.HouseholdQueries : null;
    }

    function _getIndustryState() {
        return typeof window.IndustryState !== 'undefined' ? window.IndustryState : null;
    }

    function _getIndustryQueries() {
        return typeof window.IndustryQueries !== 'undefined' ? window.IndustryQueries : null;
    }

    function _getIndustryCommands() {
        return typeof window.IndustryCommands !== 'undefined' ? window.IndustryCommands : null;
    }

    function _getEducationState() {
        return typeof window.EducationState !== 'undefined' ? window.EducationState : null;
    }

    function _getEducationQueries() {
        return typeof window.EducationQueries !== 'undefined' ? window.EducationQueries : null;
    }

    function _getEducationCommands() {
        return typeof window.EducationCommands !== 'undefined' ? window.EducationCommands : null;
    }

    function _getResidenceSystem() {
        return typeof window.ResidenceSystem !== 'undefined' ? window.ResidenceSystem : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        if (typeof window._openModal === 'function') {
            return window._openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
        if (typeof window._closeTopModal === 'function') {
            window._closeTopModal();
        }
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm);
        }
        if (typeof window._confirmDialog === 'function') {
            return window._confirmDialog(message, title, onConfirm);
        }
        if (confirm(message)) {
            onConfirm();
        }
    }

    // =========================================================================
    // 4. ICON HELPERS
    // =========================================================================

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 5. DATA FETCHER
    // =========================================================================

    function _getHoldingsData(householdId) {
        var HS = _getState();
        var HQ = _getQueries();
        var IS = _getIndustryState();
        var IQ = _getIndustryQueries();
        var ES = _getEducationState();
        var EQ = _getEducationQueries();
        var RS = _getResidenceSystem();

        if (!HS) {
            return { error: 'Household system not available' };
        }

        var household = HS.getHousehold(householdId);
        if (!household) {
            return { error: 'Household not found' };
        }

        // Get enterprises owned by household
        var enterprises = [];
        var enterpriseStats = null;
        var enterpriseSummaries = [];

        if (HQ && typeof HQ.getHouseholdEnterprises === 'function') {
            enterprises = HQ.getHouseholdEnterprises(householdId);
        }

        if (HQ && typeof HQ.getHouseholdEnterpriseSummaries === 'function') {
            enterpriseSummaries = HQ.getHouseholdEnterpriseSummaries(householdId);
        }

        if (HQ && typeof HQ.getHouseholdEnterpriseStats === 'function') {
            enterpriseStats = HQ.getHouseholdEnterpriseStats(householdId);
        }

        // Get private schools owned by household
        var privateSchools = [];
        if (ES && typeof ES.getInstitutionsByOwner === 'function') {
            privateSchools = ES.getInstitutionsByOwner(householdId, 'household');
        }

        // Also get private schools where ownership type is private
        if (ES && typeof ES.getPrivateSchools === 'function') {
            var allPrivate = ES.getPrivateSchools();
            for (var i = 0; i < allPrivate.length; i++) {
                var school = allPrivate[i];
                if (school.ownerId === householdId && school.ownerType === 'household') {
                    var exists = privateSchools.some(function(s) { return s.id === school.id; });
                    if (!exists) {
                        privateSchools.push(school);
                    }
                }
            }
        }

        // =====================================================================
        // GET RESIDENCES OWNED BY HOUSEHOLD (NEW)
        // =====================================================================
        var ownedResidences = [];
        var totalRentIncome = 0;
        var totalRentedProperties = 0;

        if (RS && typeof RS.getResidencesByOwner === 'function') {
            ownedResidences = RS.getResidencesByOwner(householdId, 'household');
            
            // Calculate total rent income
            if (RS && typeof RS.getTotalRentIncome === 'function') {
                totalRentIncome = RS.getTotalRentIncome(householdId, 'household');
            }
            
            // Count rented properties
            for (var i = 0; i < ownedResidences.length; i++) {
                if (ownedResidences[i].renterId) {
                    totalRentedProperties++;
                }
            }
        }

        // Get enterprise display data
        var enterpriseDisplayData = [];
        if (enterprises.length > 0 && IS) {
            for (var i = 0; i < enterprises.length; i++) {
                var e = enterprises[i];
                var summary = null;
                if (IQ && typeof IQ.getEnterpriseSummary === 'function') {
                    summary = IQ.getEnterpriseSummary(e.id);
                }
                enterpriseDisplayData.push({
                    enterprise: e,
                    summary: summary || {
                        id: e.id,
                        name: e.name,
                        type: e.typeName || 'Unknown',
                        category: e.category || 'Unknown',
                        wealth: e.wealth || 0,
                        debt: e.debt || 0,
                        annualProfit: (e.income || 0) - (e.expenses || 0) - ((e.workerList ? e.workerList.length : 0) * (e.wages || 8)),
                        workerCount: e.workerList ? e.workerList.length : 0,
                        status: e.status || 'active'
                    }
                });
            }
        }

        // Get school details
        var schoolDisplayData = [];
        if (privateSchools.length > 0) {
            for (var i = 0; i < privateSchools.length; i++) {
                var s = privateSchools[i];
                var details = null;
                if (EQ && typeof EQ.getInstitutionDetails === 'function') {
                    details = EQ.getInstitutionDetails(s.id);
                }
                schoolDisplayData.push({
                    school: s,
                    details: details || {
                        studentCount: s.students ? s.students.length : 0,
                        teacherCount: s.teachers ? s.teachers.length : 0,
                        graduateCount: s.graduates ? s.graduates.length : 0,
                        capacityUsed: s.maxStudents ? Math.round(((s.students ? s.students.length : 0) / s.maxStudents) * 100) : 0
                    }
                });
            }
        }

        // =====================================================================
        // RESIDENCE DISPLAY DATA (NEW)
        // =====================================================================
        var residenceDisplayData = [];
        for (var i = 0; i < ownedResidences.length; i++) {
            var r = ownedResidences[i];
            var renterName = r.renterName || 'Vacant';
            var rentAmount = r.rentAmount || 0;
            var isRented = !!r.renterId;
            var statusColor = isRented ? 'var(--success)' : 'var(--warn)';
            var statusText = isRented ? 'Rented' : 'Vacant';
            var locationName = r.locationName || 'Unknown';
            var typeName = r.typeName || r.typeId || 'Unknown';

            residenceDisplayData.push({
                residence: r,
                renterName: renterName,
                rentAmount: rentAmount,
                isRented: isRented,
                statusColor: statusColor,
                statusText: statusText,
                locationName: locationName,
                typeName: typeName
            });
        }

        return {
            household: household,
            enterprises: enterpriseDisplayData,
            enterpriseStats: enterpriseStats,
            enterpriseSummaries: enterpriseSummaries,
            privateSchools: schoolDisplayData,
            totalEnterprises: enterpriseDisplayData.length,
            totalSchools: schoolDisplayData.length,
            totalHoldings: enterpriseDisplayData.length + schoolDisplayData.length + residenceDisplayData.length,
            // NEW: Residence data
            ownedResidences: residenceDisplayData,
            totalResidences: residenceDisplayData.length,
            totalRentIncome: totalRentIncome,
            totalRentedProperties: totalRentedProperties
        };
    }

    // =========================================================================
    // 6. RENDER FUNCTIONS
    // =========================================================================

    function _renderStats(data) {
        var industryIcon = _getIconSafe('INDUSTRY');
        var homeIcon = _getIconSafe('HOME');
        var coinIcon = _getIconSafe('COIN');

        var totalProfit = data.enterpriseStats ? data.enterpriseStats.totalProfit || 0 : 0;
        var profitColor = totalProfit >= 0 ? 'var(--success)' : 'var(--warn)';

        return '' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">' + industryIcon + ' Enterprises</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + data.totalEnterprises + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">' + homeIcon + ' Private Schools</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + data.totalSchools + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">' + homeIcon + ' Residences</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + data.totalResidences + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">Total Holdings</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + data.totalHoldings + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">' + coinIcon + ' Rent Income</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;color:var(--success);">+' + data.totalRentIncome + 'g</div>' +
                '</div>' +
            '</div>';
    }

    function _renderEnterpriseCard(item, index, householdId) {
        var e = item.enterprise;
        var summary = item.summary;
        var editIcon = _getIconSafe('EDIT');
        var trashIcon = _getIconSafe('X_HEAVY');
        var industryIcon = _getIconSafe('INDUSTRY');
        var personIcon = _getIconSafe('PERSON');

        var profit = summary.annualProfit || 0;
        var profitColor = profit >= 0 ? 'var(--success)' : 'var(--warn)';
        var statusColor = summary.status === 'active' ? 'var(--success)' :
                         summary.status === 'bankrupt' ? 'var(--danger)' :
                         'var(--warn)';
        var statusLabel = summary.status || 'Active';

        var locationName = 'Unknown';
        if (e.locationId) {
            var place = _getPlaceById(e.locationId);
            if (place) locationName = place.displayName;
        }

        return '' +
            '<div class="holding-item enterprise-item" data-enterprise-id="' + e.id + '" style="' +
                'background:var(--bg3);' +
                'border:1px solid var(--border);' +
                'border-radius:6px;' +
                'padding:10px 12px;' +
                'margin-bottom:6px;' +
            '">' +
                '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:4px;">' +
                    '<div style="display:flex;align-items:center;gap:6px;">' +
                        '<span style="font-size:0.7rem;">' + industryIcon + '</span>' +
                        '<span style="font-size:0.75rem;font-weight:bold;">' + _escapeHtml(e.name) + '</span>' +
                        '<span style="font-size:0.5rem;color:var(--dim);">' + _escapeHtml(e.typeName || 'Unknown') + '</span>' +
                        '<span style="font-size:0.45rem;color:' + statusColor + ';">(' + statusLabel + ')</span>' +
                    '</div>' +
                    '<div style="display:flex;gap:4px;align-items:center;">' +
                        '<span style="font-size:0.55rem;color:' + profitColor + ';">' + (profit >= 0 ? '+' : '') + profit + 'g</span>' +
                        '<button class="enterprise-edit-btn" data-enterprise-id="' + e.id + '" style="padding:1px 6px;font-size:0.4rem;background:none;border:none;color:var(--accent);cursor:pointer;" title="Edit">' + editIcon + '</button>' +
                        '<button class="enterprise-delete-btn" data-enterprise-id="' + e.id + '" style="padding:1px 6px;font-size:0.4rem;background:none;border:none;color:var(--dim);cursor:pointer;" title="Delete">' + trashIcon + '</button>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:0.5rem;color:var(--dim);margin-top:4px;">' +
                    '<span>⌂ ' + _escapeHtml(locationName) + '</span>' +
                    '<span>💰 ' + (summary.wealth || 0) + 'g</span>' +
                    '<span>💸 ' + (summary.debt || 0) + 'g debt</span>' +
                    '<span>' + personIcon + ' ' + (summary.workerCount || 0) + ' workers</span>' +
                '</div>' +
            '</div>';
    }

    function _renderSchoolCard(item, index, householdId) {
        var s = item.school;
        var details = item.details;
        var editIcon = _getIconSafe('EDIT');
        var trashIcon = _getIconSafe('X_HEAVY');
        var homeIcon = _getIconSafe('HOME');
        var personIcon = _getIconSafe('PERSON');

        var studentCount = details.studentCount || 0;
        var teacherCount = details.teacherCount || 0;
        var capacityUsed = details.capacityUsed || 0;
        var reputation = s.reputation || 50;
        var repColor = reputation >= 80 ? 'var(--success)' :
                       reputation >= 60 ? 'var(--accent)' :
                       reputation >= 40 ? 'var(--warn)' :
                       'var(--danger)';

        var locationName = 'Unknown';
        if (s.locationId) {
            var place = _getPlaceById(s.locationId);
            if (place) locationName = place.displayName;
        }

        var statusLabel = s.status === 'active' ? 'Active' : (s.status === 'demolished' ? 'Demolished' : 'Inactive');
        var statusColor = s.status === 'active' ? 'var(--success)' :
                          s.status === 'demolished' ? 'var(--danger)' :
                          'var(--warn)';

        var tuitionDisplay = s.customTuition !== null && s.customTuition !== undefined ?
            s.customTuition + 'g' :
            (s.tuitionPerYear || 0) + 'g';

        return '' +
            '<div class="holding-item school-item" data-school-id="' + s.id + '" style="' +
                'background:var(--bg3);' +
                'border:1px solid var(--border);' +
                'border-radius:6px;' +
                'padding:10px 12px;' +
                'margin-bottom:6px;' +
                (s.status === 'demolished' ? 'opacity:0.5;' : '') +
            '">' +
                '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:4px;">' +
                    '<div style="display:flex;align-items:center;gap:6px;">' +
                        '<span style="font-size:0.7rem;">' + homeIcon + '</span>' +
                        '<span style="font-size:0.75rem;font-weight:bold;' + (s.status === 'demolished' ? 'text-decoration:line-through;' : '') + '">' + _escapeHtml(s.name) + '</span>' +
                        '<span style="font-size:0.45rem;color:' + statusColor + ';">(' + statusLabel + ')</span>' +
                        (s.ownershipType === 'private' ? '<span style="font-size:0.4rem;color:var(--accent);">Private</span>' : '') +
                        (s.ownershipType === 'religious' ? '<span style="font-size:0.4rem;color:#4a9e6a;">Religious</span>' : '') +
                    '</div>' +
                    '<div style="display:flex;gap:4px;align-items:center;">' +
                        '<span style="font-size:0.5rem;color:var(--dim);">Tuition: ' + tuitionDisplay + '</span>' +
                        '<button class="school-edit-btn" data-school-id="' + s.id + '" style="padding:1px 6px;font-size:0.4rem;background:none;border:none;color:var(--accent);cursor:pointer;" title="Edit">' + editIcon + '</button>' +
                        '<button class="school-delete-btn" data-school-id="' + s.id + '" style="padding:1px 6px;font-size:0.4rem;background:none;border:none;color:var(--dim);cursor:pointer;" title="Delete">' + trashIcon + '</button>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:0.5rem;color:var(--dim);margin-top:4px;">' +
                    '<span>⌂ ' + _escapeHtml(locationName) + '</span>' +
                    '<span>👤 ' + studentCount + ' students</span>' +
                    '<span>⌇ ' + teacherCount + ' teachers</span>' +
                    '<span>🎓 ' + (details.graduateCount || 0) + ' graduates</span>' +
                    '<span>◉ Reputation: <span style="color:' + repColor + ';">' + reputation + '</span></span>' +
                    '<span>⌂ ' + capacityUsed + '% capacity</span>' +
                    (s.isSpecialized ? '<span>◉ Specialized: ' + _escapeHtml(s.specializationCategory || '') + '</span>' : '') +
                '</div>' +
            '</div>';
    }

    // =========================================================================
    // 7. RESIDENCE CARD (NEW)
    // =========================================================================

    function _renderResidenceCard(item, index, householdId) {
        var r = item.residence;
        var editIcon = _getIconSafe('EDIT');
        var trashIcon = _getIconSafe('X_HEAVY');
        var homeIcon = _getIconSafe('HOME');
        var coinIcon = _getIconSafe('COIN');
        var personIcon = _getIconSafe('PERSON');

        var isRented = item.isRented;
        var rentAmount = item.rentAmount;
        var renterName = item.renterName;
        var statusColor = isRented ? 'var(--success)' : 'var(--warn)';
        var statusText = isRented ? 'Rented' : 'Vacant';
        var locationName = item.locationName;
        var typeName = item.typeName;

        var rentDisplay = isRented ? 
            '<span style="color:var(--success);">+' + rentAmount + 'g/year</span>' :
            '<span style="color:var(--dim);">No renter</span>';

        return '' +
            '<div class="holding-item residence-item" data-residence-id="' + r.id + '" style="' +
                'background:var(--bg3);' +
                'border:1px solid var(--border);' +
                'border-radius:6px;' +
                'padding:10px 12px;' +
                'margin-bottom:6px;' +
                (r.isDemolished ? 'opacity:0.5;' : '') +
            '">' +
                '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:4px;">' +
                    '<div style="display:flex;align-items:center;gap:6px;">' +
                        '<span style="font-size:0.7rem;">' + homeIcon + '</span>' +
                        '<span style="font-size:0.75rem;font-weight:bold;' + (r.isDemolished ? 'text-decoration:line-through;' : '') + '">' + _escapeHtml(r.name) + '</span>' +
                        '<span style="font-size:0.5rem;color:var(--dim);">' + _escapeHtml(typeName) + '</span>' +
                        '<span style="font-size:0.45rem;color:' + statusColor + ';">(' + statusText + ')</span>' +
                        (r.isMultiUnit ? '<span style="font-size:0.4rem;color:var(--accent);">Multi-unit</span>' : '') +
                    '</div>' +
                    '<div style="display:flex;gap:4px;align-items:center;">' +
                        '<span style="font-size:0.55rem;">' + rentDisplay + '</span>' +
                        '<button class="residence-view-btn" data-residence-id="' + r.id + '" style="padding:1px 6px;font-size:0.4rem;background:none;border:none;color:var(--accent);cursor:pointer;" title="View">' + editIcon + '</button>' +
                        '<button class="residence-delete-btn" data-residence-id="' + r.id + '" style="padding:1px 6px;font-size:0.4rem;background:none;border:none;color:var(--dim);cursor:pointer;" title="Remove from portfolio">' + trashIcon + '</button>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:8px;font-size:0.5rem;color:var(--dim);margin-top:4px;">' +
                    '<span>⌂ ' + _escapeHtml(locationName) + '</span>' +
                    '<span>💰 Value: ' + (r.estimatedValue || 0) + 'g</span>' +
                    (isRented ? '<span>' + personIcon + ' ' + _escapeHtml(renterName) + '</span>' : '') +
                    '<span>Condition: ' + _escapeHtml(r.condition || 'good') + '</span>' +
                    (r.ownerSince ? '<span>Owned since ' + r.ownerSince + '</span>' : '') +
                '</div>' +
            '</div>';
    }

    function _renderEmptyState(type) {
        var plusIcon = _getIconSafe('PLUS');
        var msg = type === 'enterprises' ? 'No enterprises owned' :
                  type === 'schools' ? 'No private schools owned' :
                  'No residences owned';

        return '' +
            '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.65rem;">' +
                msg +
            '</div>';
    }

    // =========================================================================
    // 8. MAIN RENDER FUNCTION
    // =========================================================================

    function renderHouseholdHoldingsTab(containerId, householdId) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                console.warn('[HoldingsTab] Container not found: ' + containerId);
                return;
            }

            if (!householdId) {
                householdId = _getCurrentHouseholdId();
            }

            if (!householdId) {
                container.innerHTML = '<div class="placeholder">No household selected</div>';
                return;
            }

            console.log('[HoldingsTab] Rendering for household:', householdId);

            var data = _getHoldingsData(householdId);

            if (data.error) {
                container.innerHTML = '<div class="placeholder" style="color:var(--danger);">' + _escapeHtml(data.error) + '</div>';
                return;
            }

            var plusIcon = _getIconSafe('PLUS');
            var industryIcon = _getIconSafe('INDUSTRY');
            var homeIcon = _getIconSafe('HOME');
            var coinIcon = _getIconSafe('COIN');

            var html = '' +
                '<div style="max-width:750px;margin:0 auto;">' +
                    '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px;">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">' +
                            '<h3 style="font-size:0.7rem;color:var(--accent);margin:0;">Holdings</h3>' +
                            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                                '<button id="holdingsAddEnterpriseBtn" class="btn" style="padding:3px 10px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">' + plusIcon + ' Add Enterprise</button>' +
                                '<button id="holdingsAddSchoolBtn" class="btn" style="padding:3px 10px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + plusIcon + ' Add School</button>' +
                                '<button id="holdingsAddResidenceBtn" class="btn" style="padding:3px 10px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + plusIcon + ' Add Residence</button>' +
                            '</div>' +
                        '</div>' +

                        _renderStats(data) +

                        '<div style="margin-bottom:12px;">' +
                            '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">' + industryIcon + ' Enterprises (' + data.totalEnterprises + ')</div>' +
                            (data.enterprises.length === 0 ?
                                _renderEmptyState('enterprises') :
                                data.enterprises.map(function(item, index) {
                                    return _renderEnterpriseCard(item, index, householdId);
                                }).join('')
                            ) +
                        '</div>' +

                        '<div style="margin-bottom:12px;">' +
                            '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">' + homeIcon + ' Private Schools (' + data.totalSchools + ')</div>' +
                            (data.privateSchools.length === 0 ?
                                _renderEmptyState('schools') :
                                data.privateSchools.map(function(item, index) {
                                    return _renderSchoolCard(item, index, householdId);
                                }).join('')
                            ) +
                        '</div>' +

                        // =============================================================
                        // RESIDENCES SECTION (NEW)
                        // =============================================================
                        '<div style="margin-bottom:12px;">' +
                            '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">' + homeIcon + ' Owned Residences (' + data.totalResidences + ')' +
                            (data.totalRentIncome > 0 ? ' <span style="color:var(--success);font-size:0.5rem;">' + coinIcon + ' +' + data.totalRentIncome + 'g/year</span>' : '') +
                            (data.totalRentedProperties > 0 ? ' <span style="font-size:0.45rem;color:var(--dim);">(' + data.totalRentedProperties + ' rented)</span>' : '') +
                            '</div>' +
                            (data.ownedResidences.length === 0 ?
                                _renderEmptyState('residences') :
                                data.ownedResidences.map(function(item, index) {
                                    return _renderResidenceCard(item, index, householdId);
                                }).join('')
                            ) +
                        '</div>' +
                    '</div>' +
                    '<div style="font-size:0.5rem;color:var(--dim);text-align:center;">' +
                        data.totalHoldings + ' total holdings · ' +
                        data.totalEnterprises + ' enterprises · ' +
                        data.totalSchools + ' schools · ' +
                        data.totalResidences + ' residences' +
                        (data.totalRentIncome > 0 ? ' · Rent income: +' + data.totalRentIncome + 'g' : '') +
                    '</div>' +
                '</div>';

            container.innerHTML = html;

            _attachEventHandlers(container, householdId);

        } catch (e) {
            console.error('[HoldingsTab] Error:', e);
            var container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div class="placeholder" style="color:var(--danger);">Error loading holdings data</div>';
            }
        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 9. EVENT HANDLERS
    // =========================================================================

    function _attachEventHandlers(container, householdId) {
        // Add Enterprise button
        var addEnterpriseBtn = container.querySelector('#holdingsAddEnterpriseBtn');
        if (addEnterpriseBtn) {
            addEnterpriseBtn.onclick = function() {
                _openAddEnterpriseModal(householdId);
            };
        }

        // Add School button
        var addSchoolBtn = container.querySelector('#holdingsAddSchoolBtn');
        if (addSchoolBtn) {
            addSchoolBtn.onclick = function() {
                _openAddSchoolModal(householdId);
            };
        }

        // Add Residence button (NEW)
        var addResidenceBtn = container.querySelector('#holdingsAddResidenceBtn');
        if (addResidenceBtn) {
            addResidenceBtn.onclick = function() {
                _openAddResidenceModal(householdId);
            };
        }

        // Enterprise Edit buttons
        var editBtns = container.querySelectorAll('.enterprise-edit-btn');
        editBtns.forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                var enterpriseId = this.dataset.enterpriseId;
                if (enterpriseId) {
                    _openEditEnterpriseModal(householdId, enterpriseId);
                }
            };
        });

        // Enterprise Delete buttons
        var deleteBtns = container.querySelectorAll('.enterprise-delete-btn');
        deleteBtns.forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                var enterpriseId = this.dataset.enterpriseId;
                if (enterpriseId) {
                    _confirmDeleteEnterprise(householdId, enterpriseId);
                }
            };
        });

        // School Edit buttons
        var schoolEditBtns = container.querySelectorAll('.school-edit-btn');
        schoolEditBtns.forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                var schoolId = this.dataset.schoolId;
                if (schoolId) {
                    _openEditSchoolModal(householdId, schoolId);
                }
            };
        });

        // School Delete buttons
        var schoolDeleteBtns = container.querySelectorAll('.school-delete-btn');
        schoolDeleteBtns.forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                var schoolId = this.dataset.schoolId;
                if (schoolId) {
                    _confirmDeleteSchool(householdId, schoolId);
                }
            };
        });

        // =============================================================
        // RESIDENCE EVENT HANDLERS (NEW)
        // =============================================================

        // Residence View buttons
        var residenceViewBtns = container.querySelectorAll('.residence-view-btn');
        residenceViewBtns.forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                var residenceId = this.dataset.residenceId;
                if (residenceId) {
                    _openViewResidenceModal(householdId, residenceId);
                }
            };
        });

        // Residence Delete buttons
        var residenceDeleteBtns = container.querySelectorAll('.residence-delete-btn');
        residenceDeleteBtns.forEach(function(btn) {
            btn.onclick = function(e) {
                e.stopPropagation();
                var residenceId = this.dataset.residenceId;
                if (residenceId) {
                    _confirmRemoveResidence(householdId, residenceId);
                }
            };
        });

        // Click on holding items to view details
        var holdingItems = container.querySelectorAll('.holding-item');
        holdingItems.forEach(function(item) {
            item.onclick = function(e) {
                if (e.target.closest('button')) return;
                
                var enterpriseId = this.dataset.enterpriseId;
                if (enterpriseId) {
                    if (typeof window.openEnterpriseDetailsModal === 'function') {
                        window.openEnterpriseDetailsModal(enterpriseId);
                    } else {
                        _showToast('Enterprise details not available', 'error');
                    }
                    return;
                }

                var schoolId = this.dataset.schoolId;
                if (schoolId) {
                    if (typeof window.openInstitutionDetailsModal === 'function') {
                        window.openInstitutionDetailsModal(schoolId);
                    } else {
                        _showToast('School details not available', 'error');
                    }
                    return;
                }

                var residenceId = this.dataset.residenceId;
                if (residenceId) {
                    if (typeof window.openResidenceDetailsModal === 'function') {
                        window.openResidenceDetailsModal(residenceId);
                    } else {
                        _showToast('Residence details not available', 'error');
                    }
                    return;
                }
            };
        });
    }

    // =========================================================================
    // 10. ADD ENTERPRISE MODAL
    // =========================================================================

    function _openAddEnterpriseModal(householdId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HS = _getState();
            var HQ = _getQueries();
            var household = HS ? HS.getHousehold(householdId) : null;
            if (!household) {
                _showToast('Household not found', 'error');
                _processingAction = false;
                return;
            }

            if (typeof window.openCreateEnterpriseModal === 'function') {
                window.openCreateEnterpriseModal(function(enterprise) {
                    if (enterprise) {
                        _showToast('Enterprise created: ' + enterprise.name, 'success');
                        _processingAction = false;
                        renderHouseholdHoldingsTab('tab-holdings', householdId);
                    } else {
                        _processingAction = false;
                    }
                }, {
                    ownerType: 'household',
                    ownerId: householdId,
                    ownerName: household.name,
                    locationId: household.locationId || null
                });
            } else {
                _showToast('Enterprise creation not available', 'error');
                _processingAction = false;
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error opening add enterprise modal', 'error');
        }
    }

    // =========================================================================
    // 11. ADD SCHOOL MODAL
    // =========================================================================

    function _openAddSchoolModal(householdId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HS = _getState();
            var household = HS ? HS.getHousehold(householdId) : null;
            if (!household) {
                _showToast('Household not found', 'error');
                _processingAction = false;
                return;
            }

            if (typeof window.openCreateInstitutionModal === 'function') {
                window.openCreateInstitutionModal(function(institution) {
                    if (institution) {
                        _showToast('School created: ' + institution.name, 'success');
                        _processingAction = false;
                        renderHouseholdHoldingsTab('tab-holdings', householdId);
                    } else {
                        _processingAction = false;
                    }
                }, {
                    ownershipType: 'private',
                    ownerId: householdId,
                    ownerType: 'household',
                    ownerName: household.name,
                    locationId: household.locationId || null
                });
            } else {
                _showToast('School creation not available', 'error');
                _processingAction = false;
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error opening add school modal', 'error');
        }
    }

    // =========================================================================
    // 12. ADD RESIDENCE MODAL (NEW)
    // =========================================================================

    function _openAddResidenceModal(householdId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HS = _getState();
            var household = HS ? HS.getHousehold(householdId) : null;
            if (!household) {
                _showToast('Household not found', 'error');
                _processingAction = false;
                return;
            }

            if (typeof window.openNewResidenceModal === 'function') {
                window.openNewResidenceModal(
                    household.locationId || null,
                    household.locationName || null,
                    function(residenceId) {
                        if (residenceId) {
                            // Set the household as owner of the residence
                            var RS = _getResidenceSystem();
                            if (RS && typeof RS.setResidenceOwner === 'function') {
                                RS.setResidenceOwner(residenceId, 'household', householdId, {
                                    ownerSince: _getCurrentYear(),
                                    ownerName: household.name
                                });
                            }
                            _showToast('Residence created and added to portfolio', 'success');
                            _processingAction = false;
                            renderHouseholdHoldingsTab('tab-holdings', householdId);
                        } else {
                            _processingAction = false;
                        }
                    }
                );
            } else {
                _showToast('Residence creation not available', 'error');
                _processingAction = false;
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error opening add residence modal', 'error');
        }
    }

    // =========================================================================
    // 13. EDIT ENTERPRISE MODAL
    // =========================================================================

    function _openEditEnterpriseModal(householdId, enterpriseId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var IS = _getIndustryState();
            if (!IS) {
                _showToast('Industry system not available', 'error');
                _processingAction = false;
                return;
            }

            var enterprise = IS.getEnterprise(enterpriseId);
            if (!enterprise) {
                _showToast('Enterprise not found', 'error');
                _processingAction = false;
                return;
            }

            if (typeof window.openEditEnterpriseModal === 'function') {
                window.openEditEnterpriseModal(enterpriseId, function() {
                    _processingAction = false;
                    renderHouseholdHoldingsTab('tab-holdings', householdId);
                });
            } else {
                _showToast('Enterprise edit not available', 'error');
                _processingAction = false;
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error opening edit enterprise modal', 'error');
        }
    }

    // =========================================================================
    // 14. DELETE ENTERPRISE
    // =========================================================================

    function _confirmDeleteEnterprise(householdId, enterpriseId) {
        var IS = _getIndustryState();
        if (!IS) {
            _showToast('Industry system not available', 'error');
            return;
        }

        var enterprise = IS.getEnterprise(enterpriseId);
        if (!enterprise) {
            _showToast('Enterprise not found', 'error');
            return;
        }

        _confirmDialog(
            'Remove enterprise "' + enterprise.name + '" from household?\n\nThis will only remove ownership, not delete the enterprise.',
            'Remove Enterprise',
            function() {
                _doDeleteEnterprise(householdId, enterpriseId);
            }
        );
    }

    function _doDeleteEnterprise(householdId, enterpriseId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HS = _getState();
            if (!HS) {
                _showToast('Household state not available', 'error');
                _processingAction = false;
                return;
            }

            // Remove from household's enterprise list
            var result = HS.removeEnterpriseFromHousehold(householdId, enterpriseId, _getCurrentYear());
            
            if (result) {
                // Also update the enterprise's owner if possible
                if (typeof window.IndustryCommands !== 'undefined') {
                    window.IndustryCommands.updateEnterprise(enterpriseId, {
                        ownerId: null,
                        ownerType: null,
                        ownerName: null
                    });
                }
                _showToast('Enterprise removed from household', 'info');
                _processingAction = false;
                renderHouseholdHoldingsTab('tab-holdings', householdId);
            } else {
                _showToast('Failed to remove enterprise', 'error');
                _processingAction = false;
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error removing enterprise', 'error');
        }
    }

    // =========================================================================
    // 15. EDIT SCHOOL MODAL
    // =========================================================================

    function _openEditSchoolModal(householdId, schoolId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var ES = _getEducationState();
            if (!ES) {
                _showToast('Education system not available', 'error');
                _processingAction = false;
                return;
            }

            var school = ES.getInstitution(schoolId);
            if (!school) {
                _showToast('School not found', 'error');
                _processingAction = false;
                return;
            }

            if (typeof window.openEditInstitutionModal === 'function') {
                window.openEditInstitutionModal(schoolId, function() {
                    _processingAction = false;
                    renderHouseholdHoldingsTab('tab-holdings', householdId);
                });
            } else {
                _showToast('School edit not available', 'error');
                _processingAction = false;
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error opening edit school modal', 'error');
        }
    }

    // =========================================================================
    // 16. DELETE SCHOOL
    // =========================================================================

    function _confirmDeleteSchool(householdId, schoolId) {
        var ES = _getEducationState();
        if (!ES) {
            _showToast('Education system not available', 'error');
            return;
        }

        var school = ES.getInstitution(schoolId);
        if (!school) {
            _showToast('School not found', 'error');
            return;
        }

        if (school.ownershipType !== 'private') {
            _showToast('Only private schools can be removed', 'error');
            return;
        }

        _confirmDialog(
            'Remove school "' + school.name + '" from household?\n\nThis will not delete the school, but will remove ownership.\nThe school will become public.',
            'Remove School',
            function() {
                _doDeleteSchool(householdId, schoolId);
            }
        );
    }

    function _doDeleteSchool(householdId, schoolId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var ES = _getEducationState();
            var EC = _getEducationCommands();

            if (!ES || !EC) {
                _showToast('Education system not available', 'error');
                _processingAction = false;
                return;
            }

            var result = EC.setSchoolOwnership(schoolId, 'public', null, null);
            if (result && result.success) {
                _showToast('School removed from household (now public)', 'info');
                _processingAction = false;
                renderHouseholdHoldingsTab('tab-holdings', householdId);
            } else {
                _showToast(result ? result.reason : 'Failed to remove school', 'error');
                _processingAction = false;
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error removing school', 'error');
        }
    }

    // =========================================================================
    // 17. VIEW RESIDENCE MODAL (NEW)
    // =========================================================================

    function _openViewResidenceModal(householdId, residenceId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var RS = _getResidenceSystem();
            if (!RS) {
                _showToast('Residence system not available', 'error');
                _processingAction = false;
                return;
            }

            var residence = RS.getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingAction = false;
                return;
            }

            if (typeof window.openResidenceDetailsModal === 'function') {
                window.openResidenceDetailsModal(residenceId, function() {
                    _processingAction = false;
                    renderHouseholdHoldingsTab('tab-holdings', householdId);
                });
            } else if (typeof window.openResidenceOwnerDetailsModal === 'function') {
                window.openResidenceOwnerDetailsModal(residenceId, function() {
                    _processingAction = false;
                    renderHouseholdHoldingsTab('tab-holdings', householdId);
                });
            } else {
                _showToast('Residence details not available', 'error');
                _processingAction = false;
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error opening residence view', 'error');
        }
    }

    // =========================================================================
    // 18. REMOVE RESIDENCE (NEW)
    // =========================================================================

    function _confirmRemoveResidence(householdId, residenceId) {
        var RS = _getResidenceSystem();
        if (!RS) {
            _showToast('Residence system not available', 'error');
            return;
        }

        var residence = RS.getResidenceById(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return;
        }

        var hasRenter = !!residence.renterId;
        var renterName = residence.renterName || 'Unknown';

        var msg = 'Remove residence "' + residence.name + '" from household portfolio?\n\n';
        if (hasRenter) {
            msg += 'Warning: This residence has a renter (' + renterName + ').\n';
            msg += 'Removing ownership will end the rental agreement.\n\n';
        }
        msg += 'The residence will become unowned.';

        _confirmDialog(
            msg,
            'Remove Residence',
            function() {
                _doRemoveResidence(householdId, residenceId);
            }
        );
    }

    function _doRemoveResidence(householdId, residenceId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var RS = _getResidenceSystem();
            if (!RS) {
                _showToast('Residence system not available', 'error');
                _processingAction = false;
                return;
            }

            var residence = RS.getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingAction = false;
                return;
            }

            // If there's a renter, end the rental
            if (residence.renterId) {
                var currentYear = _getCurrentYear();
                var result = RS.endResidenceRental(residenceId, currentYear, 'Ownership removed');
                if (!result) {
                    _showToast('Could not end rental agreement', 'warning');
                }
            }

            // Remove owner
            RS.setResidenceOwner(residenceId, null, null, {
                ownerSince: null,
                ownerName: null
            });

            _showToast('Residence removed from portfolio', 'info');
            _processingAction = false;
            renderHouseholdHoldingsTab('tab-holdings', householdId);

        } catch (e) {
            _processingAction = false;
            _showToast('Error removing residence', 'error');
        }
    }

    // =========================================================================
    // 19. REFRESH FUNCTION
    // =========================================================================

    function refreshHouseholdHoldingsTab(householdId) {
        var containerId = 'tab-holdings';
        var container = document.getElementById(containerId);
        if (!container) {
            var containers = document.querySelectorAll('.tab-pane[id*="holdings"]');
            for (var i = 0; i < containers.length; i++) {
                if (containers[i].id) {
                    containerId = containers[i].id;
                    container = containers[i];
                    break;
                }
            }
        }

        if (!container) {
            console.warn('[HoldingsTab] Container not found');
            return;
        }

        renderHouseholdHoldingsTab(containerId, householdId);
    }

    // =========================================================================
    // 20. TAB SYSTEM REGISTRATION
    // =========================================================================

    function registerHoldingsTabRenderer() {
        if (typeof window.registerTabRenderer === 'function') {
            window.registerTabRenderer('holdings', function(containerId, locationId, summary) {
                var householdId = _getCurrentHouseholdId();
                if (!householdId) {
                    var container = document.getElementById(containerId);
                    if (container) {
                        container.innerHTML = '<div class="placeholder">No household selected</div>';
                    }
                    return;
                }
                renderHouseholdHoldingsTab(containerId, householdId);
            }, true);
            console.log('[HouseholdHoldingsTab] Registered with tab system');
        }
    }

    // =========================================================================
    // 21. EXPORTS
    // =========================================================================

    window.renderHouseholdHoldingsTab = renderHouseholdHoldingsTab;
    window.refreshHouseholdHoldingsTab = refreshHouseholdHoldingsTab;
    window.registerHoldingsTabRenderer = registerHoldingsTabRenderer;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(registerHoldingsTabRenderer, 100);
        });
    } else {
        setTimeout(registerHoldingsTabRenderer, 100);
    }

})();