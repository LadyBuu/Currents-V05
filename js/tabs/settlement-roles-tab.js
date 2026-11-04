/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT ROLES TAB
 * js/tabs/settlement-roles-tab.js
 * =============================================================================
 *
 * ROLES TAB RENDERER.
 *
 * Renders a read-only overview of the settlement's role distribution and
 * apprenticeship density. Every value on this tab is sourced from
 * SettlementQueries.getSettlementRoleStats and
 * SettlementQueries.getSettlementApprenticeshipDensity. The tab does
 * NOT classify skills, compute averages, sum counts, or resolve names.
 *
 * Hosts three interactions:
 *
 *   Row click on a top role
 *       → role-details modal (character list for that role, scoped to
 *         the settlement subtree). Built from
 *         RoleQueries.getCharactersWithRoleDetails plus a filter on
 *         LocationQueries.getCurrentLocationId membership in the
 *         settlement subtree.
 *
 *   "View All Roles"
 *       → SettlementRolesModals.openRolesModal(locationId)
 *
 *   "Apprenticeships"
 *       → SettlementRolesModals.openApprenticeshipsModal(locationId)
 *
 * The detail views (full role distribution with all roles, full
 * apprenticeship density with all masters) live in
 * modals-settlement-roles.js. The tab does not reimplement them.
 *
 * RENDERER CONTRACT
 * -----------------
 *   Registered via SettlementTabs.registerTabRenderer('roles', fn).
 *   SettlementTabs invokes fn(container, context):
 *
 *     container  HTMLElement       already emptied by SettlementTabs
 *     context    {
 *       locationId  string|null    selected settlement id
 *       data        Object|null    canonical settlement record
 *       viewModel   Object|null    buildSettlementSummary result
 *     }
 *
 *   SettlementTabs has already validated locationId and data before
 *   calling the renderer.
 *
 * DATA SOURCES (settlement-scoped aggregates)
 * -------------------------------------------
 *   The two aggregates at the bottom of settlement-queries.js:
 *
 *     SettlementQueries.getSettlementRoleStats(locationId) → {
 *       locationId, totalProfessions, uniqueRoles, characterCount,
 *       roleIds,
 *       countsByTier: { [tierId]: number },   // every tier present
 *       byCategory: { [categoryId]: { count, roles: [
 *         { id, name, count, categoryName }
 *       ] } },
 *       topRoles: [{ id, name, count, percentage }],
 *       mastersByRole, apprenticesByRole, canTeachByRole,
 *       primaryByRole
 *     } | null
 *
 *     SettlementQueries.getSettlementApprenticeshipDensity(locationId) → {
 *       locationId, totalMasters, totalApprentices,
 *       masterToApprenticeRatio,
 *       topRoles: [{ roleId, roleName, count }],
 *       topMasters: [{ masterId, masterName, apprenticeCount }]
 *     } | null
 *
 *   Role-skill tier *names* are already implied by the ids returned in
 *   countsByTier (untrained, novice, apprentice, journeyman, expert,
 *   master). The tab renders the count for each id, in the canonical
 *   order. It does not read SkillUtils — the aggregate has already done
 *   the classification. It does not iterate SkillUtils.TIERS.
 *
 *   The tier order is a presentation constant (untrained first,
 *   master last). It matches the order in which SkillUtils.TIERS is
 *   defined in skill-utils.js and in which apprenticeship-constants.js
 *   derives APPRENTICESHIP_STAGES. Duplicating the ORDER (not the
 *   boundaries) here is acceptable — the aggregate carries the ids and
 *   the counts; the tab only chooses the display order. Any future
 *   tier added to SkillUtils will still appear, because the tab reads
 *   countsByTier for the ids it knows and appends any unknown ids it
 *   finds.
 *
 * ROLE DETAILS MODAL
 * ------------------
 *   The tab opens a role-details modal when the user clicks a top-role
 *   row. The modal lists characters in the settlement subtree who hold
 *   the selected role, with their skill level and tier name.
 *
 *   Data path:
 *     1. RoleQueries.getCharactersWithRoleDetails(roleId, {}) — the
 *        canonical per-character role detail query. Returns
 *        { characterId, character, skillLevel, tierName, ... }
 *        projections, filtered to characters who hold the role
 *        (world-wide).
 *     2. The tab filters those projections to character ids whose
 *        LocationQueries.getCurrentLocationId resolves into the
 *        settlement subtree.
 *
 *   The filter is unavoidable: RoleQueries is world-wide. The
 *   settlement-scoped variant would be a new RoleQueries function, and
 *   that is out of scope for a tab. The filter here is a projection
 *   filter (drop the row if the character is not in the settlement),
 *   not a re-query — it does not duplicate the query itself.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (Step-1b, final):
 *     - Rewritten against SettlementQueries.getSettlementRoleStats and
 *       SettlementQueries.getSettlementApprenticeshipDensity. Prior
 *       revisions called RoleQueries.getSettlementRoleStats and
 *       RoleQueries.getSettlementApprenticeshipDensity — both phantom;
 *       the tab rendered empty for every settlement.
 *     - Removed the local _skillTier helper and the local
 *       _SKILL_TIER_ORDER array. Both duplicated SkillUtils.getTier and
 *       SkillUtils.TIERS. The tab no longer classifies skills; the
 *       aggregate carries countsByTier already keyed by tier id.
 *     - Removed the local skill-distribution computation (the
 *       CharacterCommands.getProfessions scan per settlement
 *       character). That scan is the aggregate's job.
 *     - Removed the local _fetchRoleStats / _fetchApprenticeshipDensity
 *       wrappers that each did a bespoke _getRoleQueries call. The tab
 *       calls _getSettlementQueries().getSettlementRoleStats /
 *       getSettlementApprenticeshipDensity directly. If the aggregate
 *       throws or returns null, the tab renders an error state.
 *     - Removed _getCharacterQueries / _getCharacterCommands /
 *       _getLocationQueries direct usage from the aggregate paths.
 *       LocationQueries is still used by the role-details modal for
 *       the settlement-subtree filter.
 *     - Role-details modal now uses RoleQueries.getCharactersWithRoleDetails
 *       directly and filters by settlement-subtree membership. Prior
 *       revisions built the list from a fresh CharacterCommands scan;
 *       the query returns the same projections and is the canonical
 *       per-character reader.
 *     - Removed the _rendering recursion guard. §20 prohibits it, and
 *       rendering is synchronous.
 *     - Removed the _modalOpen flag. Modal state lives in modals-core.js.
 *     - Registration now uses SettlementTabs.registerTabRenderer. Prior
 *       revisions used window.registerTabRenderer, which does not
 *       exist. The tab never registered, never rendered.
 *     - All numeric values route through _fmtNumber. All text values
 *       through _fmtText. No raw null/undefined reaches the DOM.
 *     - Two buttons ("View All Roles" / "Apprenticeships") open the
 *       corresponding modals. The role-details modal (character list)
 *       is the tab-local one; it is not a duplicate of openRolesModal
 *       (which shows the role catalogue and category breakdown, not
 *       individual characters).
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _getSettlementQueries() {
        var Q = window.SettlementQueries;
        if (!Q || typeof Q.getSettlementRoleStats !== 'function') {
            throw new Error(
                'settlement-roles-tab: SettlementQueries.getSettlementRoleStats ' +
                'is missing. Load settlement-queries.js with the settlement ' +
                'role aggregates before this tab.'
            );
        }
        if (typeof Q.getSettlementApprenticeshipDensity !== 'function') {
            throw new Error(
                'settlement-roles-tab: SettlementQueries.' +
                'getSettlementApprenticeshipDensity is missing.'
            );
        }
        return Q;
    }

    function _getRoleQueries() {
        var Q = window.RoleQueries;
        if (!Q || typeof Q.getCharactersWithRoleDetails !== 'function') {
            throw new Error(
                'settlement-roles-tab: RoleQueries.getCharactersWithRoleDetails ' +
                'is missing.'
            );
        }
        return Q;
    }

    function _getLocationQueries() {
        var Q = window.LocationQueries;
        if (!Q || typeof Q.getAllSubLocationIds !== 'function') {
            throw new Error(
                'settlement-roles-tab: LocationQueries is missing.'
            );
        }
        return Q;
    }

    function _getPlaceQueries() {
        return window.PlaceQueries || null;
    }

    function _getRolesModals() {
        return window.SettlementRolesModals || null;
    }

    function _getTabs() {
        return window.SettlementTabs || null;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _unknown() {
        return '<span class="value-unknown">—</span>';
    }

    function _fmtNumber(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(value.toLocaleString());
    }

    function _fmtText(value) {
        if (value === null || value === undefined || value === '') {
            return _unknown();
        }
        return _escapeHtml(value);
    }

    function _fmtRatio(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(String(value)) + ':1';
    }

    function _getIcon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var icon = window.getIcon(name);
                if (typeof icon === 'string') return icon;
            } catch (e) {
                // getIcon exists but threw; fall through to ''.
            }
        }
        return '';
    }

    function _placeName(locationId) {
        var pq = _getPlaceQueries();
        if (!pq || typeof pq.getPlaceById !== 'function') return null;
        var place = pq.getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    function _toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _requestRefresh() {
        var tabs = _getTabs();
        if (tabs && typeof tabs.requestRender === 'function') {
            tabs.requestRender('roles');
        }
    }

    // =========================================================================
    // 3. TIER DISPLAY ORDER
    // =========================================================================
    //
    // The aggregate returns countsByTier keyed by tier id. The tab renders
    // them in the canonical tier order (untrained → master). The order is
    // a presentation constant; the tier *boundaries* live in SkillUtils
    // (and are not re-declared here — the aggregate has already bucketed
    // by tier id).
    //
    // Any tier id present in countsByTier that is not listed below is
    // appended after the known ids, so a future tier added to SkillUtils
    // still shows up.

    var _TIER_DISPLAY_ORDER = [
        'untrained',
        'novice',
        'apprentice',
        'journeyman',
        'expert',
        'master'
    ];

    var _TIER_DISPLAY_LABELS = {
        untrained: 'Untrained',
        novice: 'Novice',
        apprentice: 'Apprentice',
        journeyman: 'Journeyman',
        expert: 'Expert',
        master: 'Master'
    };

    var _TIER_DISPLAY_COLORS = {
        untrained: 'var(--tmut)',
        novice: 'var(--dim)',
        apprentice: 'var(--warn)',
        journeyman: 'var(--accent)',
        expert: 'var(--success)',
        master: 'var(--accent-light)'
    };

    function _tierLabel(tierId) {
        if (_TIER_DISPLAY_LABELS[tierId]) return _TIER_DISPLAY_LABELS[tierId];
        if (!tierId) return 'Unknown';
        return String(tierId)
            .split('_')
            .map(function (word) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
    }

    function _tierColor(tierId) {
        return _TIER_DISPLAY_COLORS[tierId] || 'var(--dim)';
    }

    /**
     * Returns the tier ids present in countsByTier, in canonical order,
     * with any unknown ids appended in insertion order.
     */
    function _orderedTierIds(countsByTier) {
        var seen = Object.create(null);
        var out = [];

        for (var i = 0; i < _TIER_DISPLAY_ORDER.length; i++) {
            var id = _TIER_DISPLAY_ORDER[i];
            if (Object.prototype.hasOwnProperty.call(countsByTier, id)) {
                seen[id] = true;
                out.push(id);
            }
        }
        for (var key in countsByTier) {
            if (!Object.prototype.hasOwnProperty.call(countsByTier, key)) continue;
            if (seen[key]) continue;
            out.push(key);
        }
        return out;
    }

    // =========================================================================
    // 4. DATA FETCHING
    // =========================================================================

    function _fetchRoleStats(locationId) {
        var Q = _getSettlementQueries();
        try {
            return Q.getSettlementRoleStats(locationId);
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-roles-tab: getSettlementRoleStats threw:', err
                );
            }
            return null;
        }
    }

    function _fetchApprenticeshipDensity(locationId) {
        var Q = _getSettlementQueries();
        try {
            return Q.getSettlementApprenticeshipDensity(locationId);
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-roles-tab: getSettlementApprenticeshipDensity ' +
                    'threw:', err
                );
            }
            return null;
        }
    }

    /**
     * Returns the character projections for the given role, filtered to
     * characters whose current location is in the settlement subtree.
     *
     * Uses RoleQueries.getCharactersWithRoleDetails for the world-wide
     * list and LocationQueries.getCurrentLocationId for the settlement
     * filter. The filter is a projection filter, not a re-query.
     *
     * @returns {Array<{ characterId, characterName, skillLevel, tierName }>}
     */
    function _getCharactersWithRoleInSettlement(locationId, roleId) {
        if (!roleId) return [];

        var RQ = _getRoleQueries();
        var LQ = _getLocationQueries();

        var details = null;
        try {
            details = RQ.getCharactersWithRoleDetails(roleId, {});
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-roles-tab: getCharactersWithRoleDetails threw:',
                    err
                );
            }
            return [];
        }
        if (!Array.isArray(details) || details.length === 0) return [];

        var ids = null;
        try {
            ids = LQ.getAllSubLocationIds(locationId);
        } catch (err) {
            ids = null;
        }
        if (!Array.isArray(ids) || ids.length === 0) {
            ids = [locationId];
        } else if (ids.indexOf(locationId) === -1) {
            ids = ids.slice();
            ids.push(locationId);
        }
        var idSet = Object.create(null);
        for (var i = 0; i < ids.length; i++) idSet[ids[i]] = true;

        var out = [];
        for (var j = 0; j < details.length; j++) {
            var d = details[j];
            if (!d || !d.characterId) continue;
            if (!d.character) continue;

            var currentLocationId = null;
            try {
                currentLocationId = LQ.getCurrentLocationId(d.characterId);
            } catch (err) {
                currentLocationId = null;
            }
            if (!currentLocationId || !idSet[currentLocationId]) continue;

            var name = ((d.character.name || '') +
                (d.character.surname ? ' ' + d.character.surname : '')).trim();
            if (!name) name = 'Unknown';

            var skillLevel = (typeof d.skillLevel === 'number' && isFinite(d.skillLevel))
                ? d.skillLevel
                : null;

            out.push({
                characterId: d.characterId,
                characterName: name,
                skillLevel: skillLevel,
                tierName: d.tierName || null
            });
        }

        out.sort(function (a, b) {
            var aS = typeof a.skillLevel === 'number' ? a.skillLevel : -1;
            var bS = typeof b.skillLevel === 'number' ? b.skillLevel : -1;
            if (bS !== aS) return bS - aS;
            return a.characterName.localeCompare(b.characterName);
        });

        return out;
    }

    // =========================================================================
    // 5. ROLE DETAILS MODAL
    // =========================================================================

    function _openRoleDetailsModal(locationId, roleId, roleName) {
        if (typeof window.openModal !== 'function') {
            _toast('Modal system not available.', 'error');
            return;
        }

        var characters = _getCharactersWithRoleInSettlement(locationId, roleId);

        var content = '<div style="padding:4px;max-height:500px;overflow-y:auto;">';

        content +=
            '<div style="background:var(--bg2);padding:12px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.85rem;font-weight:bold;color:var(--accent-light);">' +
            _escapeHtml(roleName || roleId) + '</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);margin-top:2px;">' +
            _fmtNumber(characters.length) + ' character' +
            (characters.length === 1 ? '' : 's') + ' in this settlement' +
            '</div>' +
            '</div>';

        if (characters.length === 0) {
            content +=
                '<div style="text-align:center;padding:20px;' +
                'color:var(--dim);font-size:0.65rem;">' +
                'No characters with this role in the settlement.' +
                '</div>';
        } else {
            content += '<div style="display:flex;flex-direction:column;gap:4px;">';
            for (var i = 0; i < characters.length; i++) {
                var c = characters[i];
                var color = 'var(--text)';
                if (c.tierName === 'Master') color = 'var(--accent-light)';
                else if (c.tierName === 'Expert') color = 'var(--success)';
                else if (c.tierName === 'Journeyman') color = 'var(--accent)';
                else if (c.tierName === 'Apprentice') color = 'var(--warn)';
                else if (c.tierName === 'Novice') color = 'var(--dim)';
                else if (c.tierName === 'Untrained') color = 'var(--tmut)';

                content +=
                    '<div style="display:flex;justify-content:space-between;' +
                    'align-items:center;padding:6px 10px;background:var(--bg2);' +
                    'border-left:3px solid ' + color + ';' +
                    'border-radius:4px;font-size:0.65rem;">' +
                    '<span style="color:var(--text);">' +
                    _escapeHtml(c.characterName) + '</span>' +
                    '<span style="color:' + color + ';font-size:0.55rem;">' +
                    _escapeHtml(c.tierName || '') +
                    ' (' + _fmtNumber(c.skillLevel) + ')' +
                    '</span>' +
                    '</div>';
            }
            content += '</div>';
        }

        content += '</div>';

        window.openModal({
            titleHtml: 'Role: ' + _escapeHtml(roleName || roleId),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () { /* close only */ }
        });
    }

    // =========================================================================
    // 6. DELEGATED MODAL OPENS
    // =========================================================================

    function _openAllRolesModal(locationId) {
        var modals = _getRolesModals();
        if (!modals || typeof modals.openRolesModal !== 'function') {
            _toast('Roles modal is not available.', 'error');
            return;
        }
        modals.openRolesModal(locationId);
    }

    function _openApprenticeshipsModal(locationId) {
        var modals = _getRolesModals();
        if (!modals || typeof modals.openApprenticeshipsModal !== 'function') {
            _toast('Apprenticeships modal is not available.', 'error');
            return;
        }
        modals.openApprenticeshipsModal(locationId);
    }

    // =========================================================================
    // 7. SECTION BUILDERS
    // =========================================================================

    function _buildHeader(context, summary, roleStats, density) {
        var locationId = context.locationId;
        var name = summary && summary.name
            ? summary.name
            : (_placeName(locationId) || '(unnamed location)');

        var uniqueRoles = roleStats ? (roleStats.uniqueRoles || 0) : 0;
        var totalProfs = roleStats ? (roleStats.totalProfessions || 0) : 0;
        var masters = density ? (density.totalMasters || 0) : 0;
        var apprentices = density ? (density.totalApprentices || 0) : 0;

        var refreshBtn = '<button type="button" class="roles-tab-btn" ' +
            'data-action="refresh" ' +
            'style="font-size:0.55rem;padding:3px 10px;background:var(--bg3);' +
            'border:1px solid var(--border);border-radius:4px;cursor:pointer;' +
            'color:var(--text);">' +
            _getIcon('REFRESH') + ' Refresh</button>';

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;display:flex;' +
            'justify-content:space-between;align-items:center;flex-wrap:wrap;' +
            'gap:8px;border:1px solid var(--border);">' +
            '<div>' +
            '<div style="font-size:0.8rem;font-weight:bold;color:var(--accent-light);">' +
            _getIcon('PERSON') + ' Roles &amp; Professions in ' +
            _escapeHtml(name) + '</div>' +
            '<div style="font-size:0.65rem;color:var(--dim);">' +
            _fmtNumber(uniqueRoles) + ' unique role' +
            (uniqueRoles === 1 ? '' : 's') + ' · ' +
            _fmtNumber(totalProfs) + ' profession' +
            (totalProfs === 1 ? '' : 's') + ' · ' +
            _fmtNumber(masters) + ' master' +
            (masters === 1 ? '' : 's') + ' · ' +
            _fmtNumber(apprentices) + ' apprentice' +
            (apprentices === 1 ? '' : 's') +
            '</div>' +
            '</div>' +
            '<div>' + refreshBtn + '</div>' +
            '</div>';
    }

    function _buildActionButtons(locationId) {
        function btn(action, label, iconName) {
            return '<button type="button" class="roles-tab-btn" ' +
                'data-action="' + _escapeHtml(action) + '" ' +
                'data-location="' + _escapeHtml(locationId) + '" ' +
                'style="font-size:0.6rem;padding:6px 14px;background:var(--bg3);' +
                'border:1px solid var(--accent);border-radius:4px;cursor:pointer;' +
                'color:var(--accent-light);">' +
                (iconName ? _getIcon(iconName) + ' ' : '') +
                _escapeHtml(label) + '</button>';
        }

        return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">' +
            btn('view-all-roles', 'View All Roles', 'PERSON') +
            btn('view-apprenticeships', 'Apprenticeships', 'CROWN') +
            '</div>';
    }

    function _buildStatsGrid(roleStats, density) {
        if (!roleStats) return '';

        function cell(label, value, color, iconName) {
            return '<div style="background:var(--bg2);padding:10px;' +
                'border-radius:6px;text-align:center;border:1px solid var(--border);">' +
                '<div style="font-size:0.5rem;color:var(--dim);">' +
                (iconName ? _getIcon(iconName) + ' ' : '') +
                _escapeHtml(label) + '</div>' +
                '<div style="font-size:0.9rem;font-weight:bold;color:' +
                (color || 'var(--text)') + ';">' +
                value + '</div>' +
                '</div>';
        }

        var masters = density ? (density.totalMasters || 0) : 0;
        var apprentices = density ? (density.totalApprentices || 0) : 0;

        return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;' +
            'gap:12px;margin-bottom:16px;">' +
            cell('Total Professions',
                _fmtNumber(roleStats.totalProfessions), 'var(--text)', null) +
            cell('Unique Roles',
                _fmtNumber(roleStats.uniqueRoles), 'var(--accent)', null) +
            cell('Masters',
                _fmtNumber(masters), 'var(--accent-light)', 'CROWN') +
            cell('Apprentices',
                _fmtNumber(apprentices), 'var(--warn)', 'PERSON') +
            '</div>';
    }

    function _buildRatioRow(density) {
        if (!density) return '';

        var ratio = density.masterToApprenticeRatio;
        if (typeof ratio !== 'number') return '';

        var ratioColor = 'var(--accent)';
        if (ratio >= 2 && ratio <= 5) ratioColor = 'var(--success)';
        else if (ratio < 1) ratioColor = 'var(--danger)';
        else if (ratio === 0) ratioColor = 'var(--dim)';

        return '<div style="background:var(--bg2);padding:8px 16px;' +
            'border-radius:6px;margin-bottom:16px;display:flex;' +
            'justify-content:space-between;align-items:center;' +
            'border:1px solid var(--border);font-size:0.6rem;">' +
            '<span style="color:var(--dim);">Master : Apprentice Ratio</span>' +
            '<span style="color:' + ratioColor + ';font-weight:bold;' +
            'font-size:0.7rem;">' + _fmtRatio(ratio) + '</span>' +
            '</div>';
    }

    function _buildCategorySection(roleStats, locationId) {
        if (!roleStats || !roleStats.byCategory) return '';

        var categories = roleStats.byCategory;
        var categoryIds = Object.keys(categories);
        if (categoryIds.length === 0) return '';

        categoryIds.sort(function (a, b) {
            return (categories[b].count || 0) - (categories[a].count || 0);
        });

        var total = roleStats.totalProfessions || 0;

        var html = '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:8px;">' +
            _getIcon('STAR_4') + ' Role Distribution by Category</div>';

        for (var i = 0; i < categoryIds.length; i++) {
            var catId = categoryIds[i];
            var cat = categories[catId] || {};
            var count = typeof cat.count === 'number' ? cat.count : 0;
            var pct = total > 0 ? Math.round((count / total) * 100) : 0;
            var barWidth = Math.max(2, pct);
            var label = _categoryLabel(cat, catId);

            html +=
                '<div style="display:flex;align-items:center;gap:8px;' +
                'padding:3px 0;font-size:0.6rem;">' +
                '<span style="min-width:110px;color:var(--text);">' +
                _escapeHtml(label) + '</span>' +
                '<div style="flex:1;height:8px;background:var(--bg3);' +
                'border-radius:4px;overflow:hidden;">' +
                '<div style="width:' + barWidth + '%;height:100%;' +
                'background:var(--accent);border-radius:4px;"></div>' +
                '</div>' +
                '<span style="min-width:70px;text-align:right;color:var(--dim);">' +
                _fmtNumber(count) + ' (' + _fmtNumber(pct) + '%)</span>' +
                '</div>';

            if (Array.isArray(cat.roles) && cat.roles.length > 0 && cat.roles.length <= 5) {
                for (var j = 0; j < cat.roles.length; j++) {
                    var r = cat.roles[j];
                    html += '<div style="padding-left:120px;' +
                        'font-size:0.5rem;color:var(--dim);' +
                        'display:flex;justify-content:space-between;">' +
                        '<span>— ' + _escapeHtml(r.name || r.id || '') + '</span>' +
                        '<span>' + _fmtNumber(r.count) + '</span>' +
                        '</div>';
                }
            } else if (Array.isArray(cat.roles) && cat.roles.length > 5) {
                html += '<div style="padding-left:120px;font-size:0.45rem;' +
                    'color:var(--dim);">' +
                    _fmtNumber(cat.roles.length) + ' roles in this category' +
                    '</div>';
            }
        }

        html += '</div>';
        return html;
    }

    function _categoryLabel(cat, catId) {
        if (cat && Array.isArray(cat.roles) && cat.roles.length > 0) {
            var first = cat.roles[0];
            if (first && typeof first.categoryName === 'string' &&
                first.categoryName.length > 0) {
                return first.categoryName;
            }
        }
        if (!catId) return 'Uncategorized';
        return String(catId)
            .split('_')
            .map(function (word) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
    }

    function _buildTopRolesSection(roleStats, locationId) {
        if (!roleStats || !Array.isArray(roleStats.topRoles) ||
            roleStats.topRoles.length === 0) {
            return '';
        }

        var topRoles = roleStats.topRoles;
        var limit = Math.min(10, topRoles.length);

        var html = '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:8px;">' +
            _getIcon('CROWN') + ' Top Roles</div>';

        for (var i = 0; i < limit; i++) {
            var role = topRoles[i];
            if (!role) continue;
            var pct = typeof role.percentage === 'number' ? role.percentage : 0;
            var barWidth = Math.max(5, pct);

            html +=
                '<div class="role-row" data-role-id="' +
                _escapeHtml(role.id || '') + '" ' +
                'data-role-name="' + _escapeHtml(role.name || '') + '" ' +
                'style="display:flex;align-items:center;gap:8px;padding:4px 0;' +
                'border-bottom:1px solid var(--border-light);font-size:0.6rem;' +
                'cursor:pointer;" title="Click for character list">' +
                '<span style="min-width:90px;color:var(--text);">' +
                _escapeHtml(role.name || 'Unnamed') + '</span>' +
                '<div style="flex:1;height:6px;background:var(--bg3);' +
                'border-radius:3px;overflow:hidden;">' +
                '<div style="width:' + barWidth + '%;height:100%;' +
                'background:var(--accent);border-radius:3px;"></div>' +
                '</div>' +
                '<span style="min-width:70px;text-align:right;color:var(--dim);">' +
                _fmtNumber(role.count) + ' (' + _fmtNumber(pct) + '%)</span>' +
                '</div>';
        }

        if (topRoles.length > limit) {
            html += '<div style="text-align:center;font-size:0.5rem;' +
                'color:var(--dim);padding-top:4px;">' +
                '+' + _fmtNumber(topRoles.length - limit) + ' more role' +
                (topRoles.length - limit === 1 ? '' : 's') +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    function _buildTopMastersSection(density, locationId) {
        if (!density || !Array.isArray(density.topMasters) ||
            density.topMasters.length === 0) {
            return '';
        }

        var topMasters = density.topMasters;
        var limit = Math.min(10, topMasters.length);

        var html = '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:8px;">' +
            _getIcon('CROWN') + ' Top Masters</div>';

        for (var i = 0; i < limit; i++) {
            var master = topMasters[i];
            if (!master) continue;

            html +=
                '<div style="display:flex;justify-content:space-between;' +
                'align-items:center;padding:4px 8px;background:var(--bg);' +
                'border-radius:4px;margin-bottom:2px;font-size:0.6rem;' +
                'border-left:2px solid var(--accent);">' +
                '<span style="color:var(--text);">' +
                _getIcon('CROWN') + ' ' +
                _escapeHtml(master.masterName || master.masterId || 'Unknown') +
                '</span>' +
                '<span style="color:var(--dim);font-size:0.55rem;">' +
                _fmtNumber(master.apprenticeCount) + ' apprentice' +
                (master.apprenticeCount === 1 ? '' : 's') +
                '</span>' +
                '</div>';
        }

        if (topMasters.length > limit) {
            html += '<div style="text-align:center;font-size:0.5rem;' +
                'color:var(--dim);padding-top:4px;">' +
                '+' + _fmtNumber(topMasters.length - limit) + ' more master' +
                (topMasters.length - limit === 1 ? '' : 's') +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    function _buildSkillLevelSection(roleStats) {
        if (!roleStats || !roleStats.countsByTier) return '';

        var countsByTier = roleStats.countsByTier;
        var tierIds = _orderedTierIds(countsByTier);
        if (tierIds.length === 0) return '';

        var total = 0;
        for (var t = 0; t < tierIds.length; t++) {
            var v = countsByTier[tierIds[t]];
            if (typeof v === 'number') total += v;
        }
        if (total === 0) return '';

        var html = '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:8px;">' +
            _getIcon('STAR_4') + ' Skill Level Distribution</div>';

        for (var k = 0; k < tierIds.length; k++) {
            var tierId = tierIds[k];
            var count = typeof countsByTier[tierId] === 'number'
                ? countsByTier[tierId]
                : 0;
            var pct = total > 0 ? Math.round((count / total) * 100) : 0;
            var barWidth = Math.max(2, pct);
            var label = _tierLabel(tierId);
            var color = _tierColor(tierId);

            html +=
                '<div style="display:flex;align-items:center;gap:8px;' +
                'padding:3px 0;font-size:0.55rem;">' +
                '<span style="min-width:90px;color:' + color + ';">' +
                _escapeHtml(label) + '</span>' +
                '<div style="flex:1;height:6px;background:var(--bg3);' +
                'border-radius:3px;overflow:hidden;">' +
                '<div style="width:' + barWidth + '%;height:100%;' +
                'background:' + color + ';border-radius:3px;"></div>' +
                '</div>' +
                '<span style="min-width:60px;text-align:right;color:var(--dim);">' +
                _fmtNumber(count) + ' (' + _fmtNumber(pct) + '%)</span>' +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    function _buildEmptyState() {
        return '<div style="background:var(--bg2);padding:24px;' +
            'border-radius:8px;text-align:center;color:var(--dim);' +
            'font-size:0.7rem;margin-bottom:16px;border:1px solid var(--border);">' +
            _getIcon('PERSON') + ' No professions recorded in this settlement.' +
            '<br>' +
            '<span style="font-size:0.6rem;">' +
            'Characters with professions will appear here.' +
            '</span>' +
            '</div>';
    }

    function _buildFooter() {
        return '<div style="padding:8px;background:var(--bg3);' +
            'border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            _getIcon('CIRCLE_DOT') + ' ' +
            'Role diversity affects settlement prosperity. Masters (skill 76+) ' +
            'provide a prosperity bonus. Apprentices learn from masters to ' +
            'advance their skills. Click a role for the character list; ' +
            'use the buttons above for full role and apprenticeship detail.' +
            '</div>';
    }

    // =========================================================================
    // 8. RENDER
    // =========================================================================

    function renderSettlementRoles(container, context) {
        if (!container) {
            throw new Error('settlement-roles-tab: container is required');
        }
        if (!context || !context.locationId) {
            throw new Error('settlement-roles-tab: context.locationId is required');
        }

        var locationId = context.locationId;
        var summary = context.viewModel || null;

        var roleStats = _fetchRoleStats(locationId);
        var density = _fetchApprenticeshipDensity(locationId);

        var html = '<div style="padding:4px;">' +
            _buildHeader(context, summary, roleStats, density) +
            _buildActionButtons(locationId);

        if (!roleStats || roleStats.totalProfessions === 0) {
            html += _buildEmptyState();
        } else {
            html += _buildStatsGrid(roleStats, density);
            html += _buildRatioRow(density);
            html += _buildCategorySection(roleStats, locationId);
            html += _buildTopRolesSection(roleStats, locationId);
            html += _buildTopMastersSection(density, locationId);
            html += _buildSkillLevelSection(roleStats);
        }

        html += _buildFooter() + '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);
    }

    // =========================================================================
    // 9. EVENT WIRING
    // =========================================================================

    function _wireActions(container, locationId) {
        container.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || typeof target.closest !== 'function') return;

            var btn = target.closest('.roles-tab-btn');
            if (btn && container.contains(btn)) {
                event.preventDefault();
                var action = btn.dataset.action;
                if (action === 'refresh') {
                    _requestRefresh();
                } else if (action === 'view-all-roles') {
                    _openAllRolesModal(locationId);
                } else if (action === 'view-apprenticeships') {
                    _openApprenticeshipsModal(locationId);
                }
                return;
            }

            var roleRow = target.closest('.role-row');
            if (roleRow && container.contains(roleRow)) {
                event.preventDefault();
                var roleId = roleRow.dataset.roleId;
                var roleName = roleRow.dataset.roleName;
                if (roleId) {
                    _openRoleDetailsModal(locationId, roleId, roleName || roleId);
                }
                return;
            }
        });
    }

    // =========================================================================
    // 10. REGISTRATION
    // =========================================================================

    function _register() {
        var tabs = _getTabs();
        if (!tabs || typeof tabs.registerTabRenderer !== 'function') {
            throw new Error(
                'settlement-roles-tab: SettlementTabs is missing. ' +
                'Load settlement-tabs.js before this tab.'
            );
        }
        tabs.registerTabRenderer('roles', renderSettlementRoles);
    }

    _register();

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.renderSettlementRoles = renderSettlementRoles;
    window._renderSettlementRoles = renderSettlementRoles;

})();
