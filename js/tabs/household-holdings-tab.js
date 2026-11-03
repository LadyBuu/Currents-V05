/**
 * =============================================================================
 * HOUSEHOLD HOLDINGS TAB (household-holdings-tab.js)
 * =============================================================================
 * 
 * PURPOSE: Modular holdings tab for the Household Manager tool.
 *          Displays all industries (enterprises), private schools, and
 *          owned residences with rental income owned by the household.
 * 
 * DEPENDS ON:
 *   - HouseholdState (household-state.js)
 *   - HouseholdQueries (household-queries.js)
 *   - IndustryState (industry-state.js)
 *   - IndustryQueries (industry-queries.js)
 *   - IndustryCommands (industry-commands.js)
 *   - EducationState (education-state.js) — optional
 *   - EducationQueries (education-queries.js) — optional
 *   - EducationCommands (education-commands.js) — optional
 *   - ResidenceSystem (residence-system.js)
 *   - modals-core.js (for modal wrappers)
 *   - ui.js (for toast notifications)
 *   - icons.js (for icons)
 * 
 * ICON POLICY: Uses icons.js - NO emojis
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _getCurrentYear uses getCurrentYear (canonical accessor in
 *       time.js) instead of the deprecated getCurrentYearSafe alias,
 *       and throws on missing time.js instead of falling back to 1250.
 *     - _getCurrentHouseholdId now prefers
 *       HouseholdState.getUIState().selectedHouseholdId.
 *     - _doDeleteEnterprise now calls
 *       IndustryCommands.updateEnterprise(id, { ownerType: 'none',
 *       ownerId: null }) and checks the result. Prior revisions called
 *       HS.removeEnterpriseFromHousehold — a method that does not exist
 *       on HouseholdState; the call returned undefined and the guard
 *       silently skipped it. The subsequent updateEnterprise call
 *       passed { ownerId: null, ownerType: null, ownerName: null },
 *       which updateEnterprise rejects on three grounds: ownerName is
 *       not in the allowlist, ownerType: null fails the coherence
 *       check, and ownerId: null with ownerType: null also fails
 *       coherence. So every "delete enterprise" click ran to completion
 *       with no mutation and a success toast. A reload confirmed
 *       nothing changed.
 *     - _doRemoveResidence now uses ResidenceSystem.deleteResidence(id,
 *       { force: true }) instead of RS.setResidenceOwner(id, null,
 *       null). setResidenceOwner rejects ownerType: null with
 *       INVALID_OWNER_TYPE (it only accepts 'household' or
 *       'character'); there is no "clear owner" primitive. The button
 *       text should be considered a "delete residence" action, and the
 *       confirm message names the destruction explicitly.
 *     - The fallback summary in _renderEnterpriseCard now uses
 *       IndustryQueries.resolveTypeMetadata(e) instead of reading
 *       e.typeName / e.category directly. Those are DERIVED_FIELDS
 *       stripped by migration; they are always undefined on the clone
 *       returned by IndustryState.getEnterprise(id). Prior revisions
 *       showed "Unknown" for type/category on every enterprise
 *       whenever the summary lookup failed.
 *     - _doDeleteSchool and _doRemoveResidence check the mutation
 *       result and surface the reason on failure. Prior revisions
 *       showed "Removed" regardless of outcome.
 *     - Every successful mutation now calls
 *       window.refreshHouseholdList() so the sidebar's enterprise /
 *       residence / school counts update immediately.
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
    // 2. DEPENDENCY WRAPPERS
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

    /**
     * Returns the current simulation year.
     *
     * Delegates to the canonical accessor in time.js. The deprecated
     * getCurrentYearSafe alias is NOT used, and there is NO 1250
     * fallback.
     *
     * @throws {Error} if time.js is not loaded
     */
    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                '[HouseholdHoldingsTab] requires time.js (getCurrentYear). ' +
                'Load js/core/time.js before this tab.'
            );
        }
        return window.getCurrentYear();
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
    // 3. ICON HELPERS
    // =========================================================================

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 4. GET CURRENT HOUSEHOLD ID
    // =========================================================================

    function _getCurrentHouseholdId() {
        var HS = _getState();
        if (HS && typeof HS.getUIState === 'function') {
            try {
                var s = HS.getUIState();
                if (s && typeof s.selectedHouseholdId === 'string'
                    && s.selectedHouseholdId.length > 0) {
                    return s.selectedHouseholdId;
                }
            } catch (e) { /* fall through */ }
        }
        if (window._currentHouseholdId) return window._currentHouseholdId;
        if (window.currentHouseholdId) return window.currentHouseholdId;
        if (window.selectedHouseholdId) return window.selectedHouseholdId;
        return null;
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

        // --- Enterprises owned by household ---
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

        // --- Private schools owned by household ---
        var privateSchools = [];
        if (ES && typeof ES.getInstitutionsByOwner === 'function') {
            privateSchools = ES.getInstitutionsByOwner(householdId, 'household');
        }

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

        // --- Residences owned by household ---
        var ownedResidences = [];
        var totalRentIncome = 0;
        var totalRentedProperties = 0;

        if (RS && typeof RS.getResidencesByOwner === 'function') {
            ownedResidences = RS.getResidencesByOwner(householdId, 'household');

            if (RS && typeof RS.getTotalRentIncome === 'function') {
                totalRentIncome = RS.getTotalRentIncome(householdId, 'household');
            }

            for (var r = 0; r < ownedResidences.length; r++) {
                if (ownedResidences[r].renterId) {
                    totalRentedProperties++;
                }
            }
        }

        // --- Enterprise display data ---
        var enterpriseDisplayData = [];
        if (enterprises.length > 0 && IS) {
            for (var e = 0; e < enterprises.length; e++) {
                var ent = enterprises[e];
                var summary = null;
                if (IQ && typeof IQ.getEnterpriseSummary === 'function') {
                    summary = IQ.getEnterpriseSummary(ent.id);
                }
                if (!summary) {
                    // Fallback shape.
                    //
                    // typeName / category are DERIVED_FIELDS — they are
                    // stripped by industry-migration.js and are not
                    // present on the clone returned by
                    // IndustryState.getEnterprise(id). Reading them
                    // directly yields undefined. The correct resolution
                    // path is IndustryQueries.resolveTypeMetadata.
                    var typeMeta = (IQ && typeof IQ.resolveTypeMetadata === 'function')
                        ? IQ.resolveTypeMetadata(ent)
                        : { typeName: null, category: null };
                    var workerList = Array.isArray(ent.workerList) ? ent.workerList : [];
                    summary = {
                        id: ent.id,
                        name: ent.name,
                        type: typeMeta.typeName || 'Unknown',
                        category: typeMeta.category || 'Unknown',
                        wealth: ent.wealth || 0,
                        debt: ent.debt || 0,
                        annualProfit: (ent.income || 0) - (ent.expenses || 0) - (workerList.length * (ent.wages || 8)),
                        workerCount: workerList.length,
                        status: ent.status || 'active'
                    };
                }
                enterpriseDisplayData.push({
                    enterprise: ent,
                    summary: summary
                });
            }
        }

        // --- School display data ---
        var schoolDisplayData = [];
        if (privateSchools.length > 0) {
            for (var s = 0; s < privateSchools.length; s++) {
                var sch = privateSchools[s];
                var details = null;
                if (EQ && typeof EQ.getInstitutionDetails === 'function') {
                    details = EQ.getInstitutionDetails(sch.id);
                }
                schoolDisplayData.push({
                    school: sch,
                    details: details || {
                        studentCount: sch.students ? sch.students.length : 0,
                        teacherCount: sch.teachers ? sch.teachers.length : 0,
                        graduateCount: sch.graduates ? sch.graduates.length : 0,
                        capacityUsed: sch.maxStudents ? Math.round(((sch.students ? sch.students.length : 0) / sch.maxStudents) * 100) : 0
                    }
                });
            }
        }

        // --- Residence display data ---
        var residenceDisplayData = [];
        for (var rr = 0; rr < ownedResidences.length; rr++) {
            var res = ownedResidences[rr];
            var isRented = !!res.renterId;
            residenceDisplayData.push({
                residence: res,
                renterName: res.renterName || 'Vacant',
                rentAmount: res.rentAmount || 0,
                isRented: isRented,
                statusColor: isRented ? 'var(--success)' : 'var(--warn)',
                statusText: isRented ? 'Rented' : 'Vacant',
                locationName: res.locationName || 'Unknown',
                typeName: res.typeName || res.typeId || 'Unknown'
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
                        '<span style="font-size:0.5rem;color:var(--dim);">' + _escapeHtml(summary.type || 'Unknown') + '</span>' +
                        '<span style="font-size:0.45rem;color:' + statusColor + ';">(' + _escapeHtml(statusLabel) + ')</span>' +
                    '</div>' +
                    '<div style="display:flex;gap:4px;align-items:center;">' +
                        '<span style="font-size:0.55rem;color:' + profitColor + ';">' + (profit >= 0 ? '+' : '') + profit + 'g</span>' +
                        '<button type="button" class="enterprise-edit-btn" data-enterprise-id="' + e.id + '" style="padding:1px 6px;font-size:0.4rem;background:none;border:none;color:var(--accent);cursor:pointer;" title="Edit">' + editIcon + '</button>' +
                        '<button type="button" class="enterprise-delete-btn" data-enterprise-id="' + e.id + '" style="padding:1px 6px;font-size:0.4rem;background:none;border:none;color:var(--dim);cursor:pointer;" title="Delete">' + trashIcon + '</button>' +
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
                        '<button type="button" class="school-edit-btn" data-school-id="' + s.id + '" style="padding:1px 6px;font-size:0.4rem;background:none;border:none;color:var(--accent);cursor:pointer;" title="Edit">' + editIcon + '</button>' +
                        '<button type="button" class="school-delete-btn" data-school-id="' + s.id + '" style="padding:1px 6px;font-size:0.4rem;background:none;border:none;color:var(--dim);cursor:pointer;" title="Delete">' + trashIcon + '</button>' +
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
                        '<button type="button" class="residence-view-btn" data-residence-id="' + r.id + '" style="padding:1px 6px;font-size:0.4rem;background:none;border:none;color:var(--accent);cursor:pointer;" title="View">' + editIcon + '</button>' +
                        '<button type="button" class="residence-delete-btn" data-residence-id="' + r.id + '" style="padding:1px 6px;font-size:0.4rem;background:none;border:none;color:var(--dim);cursor:pointer;" title="Delete residence">' + trashIcon + '</button>' +
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
        var msg = type === 'enterprises' ? 'No enterprises owned' :
                  type === 'schools' ? 'No private schools owned' :
                  'No residences owned';

        return '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.65rem;">' +
            msg +
        '</div>';
    }

    // =========================================================================
    // 7. MAIN RENDER FUNCTION
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
                                '<button type="button" id="holdingsAddEnterpriseBtn" class="btn" style="padding:3px 10px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">' + plusIcon + ' Add Enterprise</button>' +
                                '<button type="button" id="holdingsAddSchoolBtn" class="btn" style="padding:3px 10px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + plusIcon + ' Add School</button>' +
                                '<button type="button" id="holdingsAddResidenceBtn" class="btn" style="padding:3px 10px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + plusIcon + ' Add Residence</button>' +
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
    // 8. EVENT HANDLERS — DELEGATED
    // =========================================================================
    //
    // One click listener per container, attached once. Re-renders reuse
    // the listener; the data-* attributes on the buttons let it dispatch
    // to the correct handler without re-binding.
    //
    // The marker `__holdingsHandlersAttached` prevents duplicate
    // registration across re-renders.

    function _attachEventHandlers(container, householdId) {
        if (!container) return;
        if (container.__holdingsHandlersAttached) return;
        container.__holdingsHandlersAttached = true;

        container.addEventListener('click', function (event) {
            var target = event.target.closest ? event.target.closest('button') : null;
            if (!target) return;

            // Header buttons
            if (target.id === 'holdingsAddEnterpriseBtn') {
                event.preventDefault();
                event.stopPropagation();
                _openAddEnterpriseModal(householdId);
                return;
            }
            if (target.id === 'holdingsAddSchoolBtn') {
                event.preventDefault();
                event.stopPropagation();
                _openAddSchoolModal(householdId);
                return;
            }
            if (target.id === 'holdingsAddResidenceBtn') {
                event.preventDefault();
                event.stopPropagation();
                _openAddResidenceModal(householdId);
                return;
            }

            // Enterprise row buttons
            if (target.classList.contains('enterprise-edit-btn')) {
                event.preventDefault();
                event.stopPropagation();
                var entId = target.getAttribute('data-enterprise-id');
                if (entId) _openEditEnterpriseModal(householdId, entId);
                return;
            }
            if (target.classList.contains('enterprise-delete-btn')) {
                event.preventDefault();
                event.stopPropagation();
                var entId = target.getAttribute('data-enterprise-id');
                if (entId) _confirmDeleteEnterprise(householdId, entId);
                return;
            }

            // School row buttons
            if (target.classList.contains('school-edit-btn')) {
                event.preventDefault();
                event.stopPropagation();
                var schId = target.getAttribute('data-school-id');
                if (schId) _openEditSchoolModal(householdId, schId);
                return;
            }
            if (target.classList.contains('school-delete-btn')) {
                event.preventDefault();
                event.stopPropagation();
                var schId = target.getAttribute('data-school-id');
                if (schId) _confirmDeleteSchool(householdId, schId);
                return;
            }

            // Residence row buttons
            if (target.classList.contains('residence-view-btn')) {
                event.preventDefault();
                event.stopPropagation();
                var resId = target.getAttribute('data-residence-id');
                if (resId) _openViewResidenceModal(householdId, resId);
                return;
            }
            if (target.classList.contains('residence-delete-btn')) {
                event.preventDefault();
                event.stopPropagation();
                var resId = target.getAttribute('data-residence-id');
                if (resId) _confirmRemoveResidence(householdId, resId);
                return;
            }
        });

        // Row click → details (rows use .holding-item with data-* id)
        container.addEventListener('click', function (event) {
            if (event.target.closest && event.target.closest('button')) return;
            var row = event.target.closest ? event.target.closest('.holding-item') : null;
            if (!row) return;

            var entId = row.getAttribute('data-enterprise-id');
            if (entId) {
                if (typeof window.openEnterpriseDetailsModal === 'function') {
                    window.openEnterpriseDetailsModal(entId);
                } else {
                    _showToast('Enterprise details not available', 'error');
                }
                return;
            }

            var schId = row.getAttribute('data-school-id');
            if (schId) {
                if (typeof window.openInstitutionDetailsModal === 'function') {
                    window.openInstitutionDetailsModal(schId);
                } else {
                    _showToast('School details not available', 'error');
                }
                return;
            }

            var resId = row.getAttribute('data-residence-id');
            if (resId) {
                if (typeof window.openResidenceDetailsModal === 'function') {
                    window.openResidenceDetailsModal(resId);
                } else {
                    _showToast('Residence details not available', 'error');
                }
                return;
            }
        });
    }

    // =========================================================================
    // 9. ADD ENTERPRISE MODAL
    // =========================================================================

    function _openAddEnterpriseModal(householdId) {
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

            if (typeof window.openCreateEnterpriseModal === 'function') {
                window.openCreateEnterpriseModal(function(enterprise) {
                    _processingAction = false;
                    if (enterprise) {
                        _showToast('Enterprise created: ' + enterprise.name, 'success');
                        renderHouseholdHoldingsTab('tab-holdings', householdId);
                        if (typeof window.refreshHouseholdList === 'function') {
                            window.refreshHouseholdList();
                        }
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
    // 10. ADD SCHOOL MODAL
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
                    _processingAction = false;
                    if (institution) {
                        _showToast('School created: ' + institution.name, 'success');
                        renderHouseholdHoldingsTab('tab-holdings', householdId);
                        if (typeof window.refreshHouseholdList === 'function') {
                            window.refreshHouseholdList();
                        }
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
    // 11. ADD RESIDENCE MODAL
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
                        _processingAction = false;
                        if (residenceId) {
                            var RS = _getResidenceSystem();
                            if (RS && typeof RS.setResidenceOwner === 'function') {
                                var ownerResult = RS.setResidenceOwner(
                                    residenceId, 'household', householdId, {
                                        ownerSince: _getCurrentYear(),
                                        ownerName: household.name
                                    }
                                );
                                if (!ownerResult || ownerResult.success !== true) {
                                    _showToast(
                                        'Residence created but could not be linked to household: ' +
                                        (ownerResult && ownerResult.reason ? ownerResult.reason : 'unknown'),
                                        'error'
                                    );
                                    renderHouseholdHoldingsTab('tab-holdings', householdId);
                                    return;
                                }
                            }
                            _showToast('Residence created and added to portfolio', 'success');
                            renderHouseholdHoldingsTab('tab-holdings', householdId);
                            if (typeof window.refreshHouseholdList === 'function') {
                                window.refreshHouseholdList();
                            }
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
    // 12. EDIT ENTERPRISE MODAL
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
                    if (typeof window.refreshHouseholdList === 'function') {
                        window.refreshHouseholdList();
                    }
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
    // 13. DELETE ENTERPRISE
    // =========================================================================
    //
    // Removes the enterprise from the household's portfolio by clearing
    // the owner fields. The enterprise record itself is preserved — it
    // becomes unowned, still visible in the global enterprise list, but
    // no longer in this household's holdings.
    //
    // IndustryCommands.updateEnterprise is the sole write path. Per its
    // own header, it reconciles the household reverse index automatically
    // when ownerType / ownerId change — so the tab does NOT need to call
    // HouseholdCommands.removeEnterpriseFromHousehold separately.
    //
    // The correct patch is { ownerType: 'none', ownerId: null }. Three
    // fields the prior revision sent are rejected:
    //   - ownerName: not in _ALLOWED_UPDATE_FIELDS
    //   - ownerType: null fails the coherence check
    //   - ownerId: null with ownerType: null fails coherence
    // The prior revision also called HS.removeEnterpriseFromHousehold —
    // a method that does not exist on HouseholdState — and never
    // checked any result, so every "delete" click showed a success
    // toast without mutating anything.

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
            'Remove enterprise "' + enterprise.name + '" from this household?\n\n' +
            'The enterprise will become unowned but will not be deleted from the world.',
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
            var IC = _getIndustryCommands();
            if (!IC) {
                _showToast('Industry commands not available', 'error');
                _processingAction = false;
                return;
            }

            var result = IC.updateEnterprise(enterpriseId, {
                ownerType: 'none',
                ownerId: null
            });

            if (!result || result.success !== true) {
                _showToast(
                    'Failed to remove enterprise: ' +
                    (result && result.reason ? result.reason : 'unknown error'),
                    'error'
                );
                _processingAction = false;
                return;
            }

            var persisted = IC.persist();
            if (persisted && persisted.success === false) {
                _showToast(
                    'Enterprise removed in memory; storage write failed: ' +
                    (persisted.reason || 'unknown'),
                    'warning'
                );
            } else {
                _showToast('Enterprise removed from household', 'info');
            }

            _processingAction = false;
            renderHouseholdHoldingsTab('tab-holdings', householdId);
            if (typeof window.refreshHouseholdList === 'function') {
                window.refreshHouseholdList();
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error removing enterprise', 'error');
        }
    }

    // =========================================================================
    // 14. EDIT SCHOOL MODAL
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
                    if (typeof window.refreshHouseholdList === 'function') {
                        window.refreshHouseholdList();
                    }
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
    // 15. DELETE SCHOOL
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
            'Remove school "' + school.name + '" from household?\n\n' +
            'The school will become public.',
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
            if (!result || result.success !== true) {
                _showToast(
                    'Failed to remove school: ' +
                    (result && result.reason ? result.reason : 'unknown error'),
                    'error'
                );
                _processingAction = false;
                return;
            }

            var persisted = (typeof EC.persist === 'function') ? EC.persist() : null;
            if (persisted === false) {
                _showToast(
                    'School removed in memory; storage write failed',
                    'warning'
                );
            } else {
                _showToast('School removed from household (now public)', 'info');
            }

            _processingAction = false;
            renderHouseholdHoldingsTab('tab-holdings', householdId);
            if (typeof window.refreshHouseholdList === 'function') {
                window.refreshHouseholdList();
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error removing school', 'error');
        }
    }

    // =========================================================================
    // 16. VIEW RESIDENCE MODAL
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
    // 17. REMOVE RESIDENCE
    // =========================================================================
    //
    // "Remove from portfolio" here means DELETE THE RESIDENCE. There is no
    // "detach the owner, keep the residence" primitive in ResidenceSystem.
    // setResidenceOwner only accepts 'household' or 'character' — passing
    // null for ownerType fails with INVALID_OWNER_TYPE. The prior revision
    // called setResidenceOwner(id, null, null, ...) which always failed,
    // and never checked the result, so the residence always stayed in the
    // portfolio while the tab showed a success toast.
    //
    // deleteResidence(id, { force: true }) is the only way to release a
    // residence from ownership. It destroys the record.
    //
    // If a "transfer ownership" or "detach and leave vacant" action is
    // ever needed, that is a new ResidenceSystem command, not a tab fix.

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

        var msg = 'Delete residence "' + residence.name + '"?\n\n';
        if (hasRenter) {
            msg += 'Warning: This residence has a renter (' + renterName + ').\n';
            msg += 'Deleting will end the rental agreement.\n\n';
        }
        msg += 'This action cannot be undone.';

        _confirmDialog(
            msg,
            'Delete Residence',
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

            var result = RS.deleteResidence(residenceId, { force: true });

            if (!result || result.success !== true) {
                _showToast(
                    'Failed to delete residence: ' +
                    (result && result.reason ? result.reason : 'unknown error'),
                    'error'
                );
                _processingAction = false;
                return;
            }

            var persisted = (typeof RS.persist === 'function') ? RS.persist() : null;
            if (persisted && persisted.success === false) {
                _showToast(
                    'Residence deleted in memory; storage write failed: ' +
                    (persisted.reason || 'unknown'),
                    'warning'
                );
            } else {
                _showToast('Residence deleted', 'info');
            }

            _processingAction = false;
            renderHouseholdHoldingsTab('tab-holdings', householdId);
            if (typeof window.refreshHouseholdList === 'function') {
                window.refreshHouseholdList();
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error deleting residence', 'error');
        }
    }

    // =========================================================================
    // 18. REFRESH FUNCTION
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
    // 19. TAB SYSTEM REGISTRATION
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
    // 20. EXPORTS
    // =========================================================================

    window.renderHouseholdHoldingsTab = renderHouseholdHoldingsTab;
    window.refreshHouseholdHoldings
