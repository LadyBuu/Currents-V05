/**
 * =============================================================================
 * SETTLEMENT ROLES TAB
 * js/tabs/settlement-roles-tab.js
 * =============================================================================
 *
 * Read-only overview of the settlement's role distribution and
 * apprenticeship density.
 *
 * RENDERER CONTRACT:
 *   fn(container, context) with context = { locationId, data, viewModel }
 *
 * DATA SOURCES:
 *   - SettlementQueries.getSettlementRoleStats(locationId)
 *   - SettlementQueries.getSettlementApprenticeshipDensity(locationId)
 *   - RoleQueries.getCharactersWithRoleDetails(roleId, {}) (for the
 *     role-details modal)
 *   - LocationQueries.getAllSubLocationIds / getCurrentLocationId
 *
 * INTERACTIONS:
 *   - Click a top role row  → role-details modal (character list scoped
 *                              to the settlement subtree)
 *   - "View All Roles"      → SettlementRolesModals.openRolesModal
 *   - "Apprenticeships"     → SettlementRolesModals.openApprenticeshipsModal
 *
 * The full role distribution and apprenticeship detail modals live in
 * modals-settlement-roles.js. This tab hosts the summary + the
 * character-list mini-modal.
 *
 * TIER DISPLAY ORDER:
 *   Presentation constant (untrained → master). The aggregate already
 *   buckets counts by tier id; this tab only chooses the display order.
 *   Unknown tier ids are appended after the known ones.
 *
 * NO CSS. Class-only rendering.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'roles';
    var SCOPE  = 'settlement';

    function H() { return window.SettlementTabHelpers; }
    function esc(v)        { return H().esc(v); }
    function icon(n)       { return H().icon(n); }
    function fmtNum(v)     { return H().fmtNumber(v); }
    function fmtText(v)    { return H().fmtText(v); }
    function fmtRatio(v)   { return H().fmtNumber(v) + ':1'; }
    function unknown()     { return H().unknown(); }
    function refresh()     { H().requestRefresh(SCOPE, TAB_ID); }

    function _getSettlementQueries() {
        var Q = window.SettlementQueries;
        if (!Q || typeof Q.getSettlementRoleStats !== 'function'
            || typeof Q.getSettlementApprenticeshipDensity !== 'function') {
            return null;
        }
        return Q;
    }

    function _getRoleQueries() {
        var Q = window.RoleQueries;
        if (!Q || typeof Q.getCharactersWithRoleDetails !== 'function') {
            return null;
        }
        return Q;
    }

    function _getLocationQueries() {
        var Q = window.LocationQueries;
        if (!Q || typeof Q.getAllSubLocationIds !== 'function') {
            return null;
        }
        return Q;
    }

    function _getRolesModals() { return window.SettlementRolesModals; }

    function _placeName(locationId) {
        var pq = window.PlaceQueries;
        if (!pq || typeof pq.getPlaceById !== 'function') return null;
        var place = pq.getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    // -------------------------------------------------------------------
    // Tier display order
    // -------------------------------------------------------------------

    var _TIER_DISPLAY_ORDER = [
        'untrained', 'novice', 'apprentice', 'journeyman', 'expert', 'master'
    ];

    var _TIER_DISPLAY_LABELS = {
        untrained: 'Untrained',
        novice: 'Novice',
        apprentice: 'Apprentice',
        journeyman: 'Journeyman',
        expert: 'Expert',
        master: 'Master'
    };

    var _TIER_DISPLAY_CLASSES = {
        untrained: 'st-stat__value',
        novice: 'st-stat__value',
        apprentice: 'st-stat__value st-stat__value--warn',
        journeyman: 'st-stat__value st-stat__value--accent',
        expert: 'st-stat__value st-stat__value--pos',
        master: 'st-stat__value st-stat__value--accent'
    };

    function _tierLabel(tierId) {
        if (_TIER_DISPLAY_LABELS[tierId]) return _TIER_DISPLAY_LABELS[tierId];
        if (!tierId) return 'Unknown';
        return String(tierId).split('_').map(function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1);
        }).join(' ');
    }

    function _tierClass(tierId) {
        return _TIER_DISPLAY_CLASSES[tierId] || 'st-stat__value';
    }

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

    // -------------------------------------------------------------------
    // Data fetching
    // -------------------------------------------------------------------

    function _fetchRoleStats(locationId) {
        var Q = _getSettlementQueries();
        if (!Q) return null;
        try { return Q.getSettlementRoleStats(locationId); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-roles-tab: getSettlementRoleStats threw:', err);
            }
            return null;
        }
    }

    function _fetchApprenticeshipDensity(locationId) {
        var Q = _getSettlementQueries();
        if (!Q) return null;
        try { return Q.getSettlementApprenticeshipDensity(locationId); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-roles-tab: getSettlementApprenticeshipDensity ' +
                    'threw:', err);
            }
            return null;
        }
    }

    function _getCharactersWithRoleInSettlement(locationId, roleId) {
        if (!roleId) return [];

        var RQ = _getRoleQueries();
        var LQ = _getLocationQueries();
        if (!RQ || !LQ) return [];

        var details;
        try { details = RQ.getCharactersWithRoleDetails(roleId, {}); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-roles-tab: getCharactersWithRoleDetails threw:',
                    err);
            }
            return [];
        }
        if (!Array.isArray(details) || details.length === 0) return [];

        var ids;
        try { ids = LQ.getAllSubLocationIds(locationId); }
        catch (err) { ids = null; }
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
            if (!d || !d.characterId || !d.character) continue;

            var currentLocationId = null;
            try {
                currentLocationId = LQ.getCurrentLocationId(d.characterId);
            } catch (e) {
                currentLocationId = null;
            }
            if (!currentLocationId || !idSet[currentLocationId]) continue;

            var name = ((d.character.name || '') +
                (d.character.surname ? ' ' + d.character.surname : '')).trim();
            if (!name) name = 'Unknown';

            out.push({
                characterId: d.characterId,
                characterName: name,
                skillLevel: (typeof d.skillLevel === 'number'
                    && isFinite(d.skillLevel)) ? d.skillLevel : null,
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

    // -------------------------------------------------------------------
    // Role details modal
    // -------------------------------------------------------------------

    function _openRoleDetailsModal(locationId, roleId, roleName) {
        if (typeof window.openModal !== 'function') {
            H().toast('Modal system not available.', 'error');
            return;
        }

        var characters = _getCharactersWithRoleInSettlement(locationId, roleId);

        var content = '<div class="st-tab">';

        content += '<div class="st-header">' +
            '<div>' +
            '<div class="st-header__title">' +
            esc(roleName || roleId) + '</div>' +
            '<div class="st-header__subtitle">' +
            fmtNum(characters.length) + ' character' +
            (characters.length === 1 ? '' : 's') +
            ' in this settlement</div>' +
            '</div>' +
            '</div>';

        if (characters.length === 0) {
            content += '<div class="st-empty">' +
                'No characters with this role in the settlement.</div>';
        } else {
            var rows = '<div class="st-rows">';
            for (var i = 0; i < characters.length; i++) {
                var c = characters[i];
                var cls = 'st-row';
                if (c.tierName === 'Master' || c.tierName === 'Expert') cls += ' st-row--success';
                else if (c.tierName === 'Journeyman') cls += ' st-row--accent';
                else if (c.tierName === 'Apprentice') cls += ' st-row--warn';
                else cls += ' st-row--dim';

                rows += '<div class="' + cls + '">' +
                    '<div class="st-row__body">' +
                    '<div class="st-row__title">' +
                    esc(c.characterName) + '</div>' +
                    '</div>' +
                    '<div class="st-row__meta">' +
                    esc(c.tierName || '') +
                    ' (' + fmtNum(c.skillLevel) + ')' +
                    '</div>' +
                    '</div>';
            }
            rows += '</div>';
            content += rows;
        }

        content += '</div>';

        try {
            window.openModal({
                titleHtml: 'Role: ' + esc(roleName || roleId),
                contentHtml: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function () { /* close only */ }
            });
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-roles-tab: openModal threw:', err);
            }
            H().toast('Could not open role details.', 'error');
        }
    }

    // -------------------------------------------------------------------
    // Delegated modals
    // -------------------------------------------------------------------

    function _openAllRolesModal(locationId) {
        var M = _getRolesModals();
        if (!M || typeof M.openRolesModal !== 'function') {
            H().toast('Roles modal is not available.', 'error');
            return;
        }
        try { M.openRolesModal(locationId); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-roles-tab: openRolesModal threw:', err);
            }
            H().toast('Could not open roles modal.', 'error');
        }
    }

    function _openApprenticeshipsModal(locationId) {
        var M = _getRolesModals();
        if (!M || typeof M.openApprenticeshipsModal !== 'function') {
            H().toast('Apprenticeships modal is not available.', 'error');
            return;
        }
        try { M.openApprenticeshipsModal(locationId); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-roles-tab: openApprenticeshipsModal threw:', err);
            }
            H().toast('Could not open apprenticeships modal.', 'error');
        }
    }

    // -------------------------------------------------------------------
    // Sections
    // -------------------------------------------------------------------

    function _buildHeader(context, roleStats, density) {
        var name = context.viewModel && context.viewModel.name
            ? context.viewModel.name
            : (_placeName(context.locationId) || '(unnamed location)');

        var uniqueRoles = roleStats ? (roleStats.uniqueRoles || 0) : 0;
        var totalProfs = roleStats ? (roleStats.totalProfessions || 0) : 0;
        var masters = density ? (density.totalMasters || 0) : 0;
        var apprentices = density ? (density.totalApprentices || 0) : 0;

        return '<div class="st-header">' +
            '<div>' +
            '<div class="st-header__title">' +
            icon('PERSON') + ' Roles &amp; Professions in ' +
            esc(name) + '</div>' +
            '<div class="st-header__subtitle">' +
            fmtNum(uniqueRoles) + ' unique role' +
            (uniqueRoles === 1 ? '' : 's') + ' \u00b7 ' +
            fmtNum(totalProfs) + ' profession' +
            (totalProfs === 1 ? '' : 's') + ' \u00b7 ' +
            fmtNum(masters) + ' master' +
            (masters === 1 ? '' : 's') + ' \u00b7 ' +
            fmtNum(apprentices) + ' apprentice' +
            (apprentices === 1 ? '' : 's') +
            '</div>' +
            '</div>' +
            '</div>';
    }

    function _buildActionButtons() {
        function btn(action, label, iconName) {
            return '<button type="button" class="st-btn st-btn--accent" ' +
                'data-action="' + esc(action) + '">' +
                (iconName ? icon(iconName) + ' ' : '') +
                esc(label) + '</button>';
        }
        return '<div class="st-header__actions">' +
            btn('view-all-roles', 'View All Roles', 'PERSON') +
            btn('view-apprenticeships', 'Apprenticeships', 'CROWN') +
            '</div>';
    }

    function _buildStatsGrid(roleStats, density) {
        if (!roleStats) return '';

        var masters = density ? (density.totalMasters || 0) : 0;
        var apprentices = density ? (density.totalApprentices || 0) : 0;

        function cell(label, valueHtml, cls, ic) {
            return '<div class="st-stat">' +
                '<div class="st-stat__label">' +
                (ic ? icon(ic) + ' ' : '') + esc(label) + '</div>' +
                '<div class="' + (cls || 'st-stat__value') + '">' +
                valueHtml + '</div>' +
                '</div>';
        }

        return '<div class="st-stats">' +
            cell('Total Professions',
                fmtNum(roleStats.totalProfessions), 'st-stat__value', null) +
            cell('Unique Roles',
                fmtNum(roleStats.uniqueRoles), 'st-stat__value st-stat__value--accent', null) +
            cell('Masters',
                fmtNum(masters), 'st-stat__value st-stat__value--accent', 'CROWN') +
            cell('Apprentices',
                fmtNum(apprentices), 'st-stat__value st-stat__value--warn', 'PERSON') +
            '</div>';
    }

    function _buildRatioRow(density) {
        if (!density) return '';
        var ratio = density.masterToApprenticeRatio;
        if (typeof ratio !== 'number') return '';

        var cls = 'st-stat__value st-stat__value--accent';
        if (ratio === 0) cls = 'st-stat__value st-stat__value--neg';
        else if (ratio >= 2 && ratio <= 5) cls = 'st-stat__value st-stat__value--pos';
        else if (ratio < 1) cls = 'st-stat__value st-stat__value--neg';

        return '<div class="st-row">' +
            '<div class="st-row__body">' +
            '<div class="st-row__meta">Master : Apprentice Ratio</div>' +
            '</div>' +
            '<div class="' + cls + '">' + fmtRatio(ratio) + '</div>' +
            '</div>';
    }

    function _buildCategorySection(roleStats) {
        if (!roleStats || !roleStats.byCategory) return '';
        var categories = roleStats.byCategory;
        var categoryIds = Object.keys(categories);
        if (categoryIds.length === 0) return '';

        categoryIds.sort(function (a, b) {
            return (categories[b].count || 0) - (categories[a].count || 0);
        });

        var total = roleStats.totalProfessions || 0;

        var html = '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('STAR_4') + ' Role Distribution by Category</div>' +
            '<div class="st-section__body">';

        for (var i = 0; i < categoryIds.length; i++) {
            var catId = categoryIds[i];
            var cat = categories[catId] || {};
            var count = typeof cat.count === 'number' ? cat.count : 0;
            var pct = total > 0 ? Math.round((count / total) * 100) : 0;
            var label = _categoryLabel(cat, catId);

            html += '<div class="st-inline">' +
                '<span class="st-inline__label">' + esc(label) + '</span>' +
                '<span class="st-inline__value">' +
                fmtNum(count) + ' (' + fmtPercent(pct) + ')' +
                '</span>' +
                '</div>';

            if (Array.isArray(cat.roles) && cat.roles.length > 0
                && cat.roles.length <= 5) {
                for (var j = 0; j < cat.roles.length; j++) {
                    var r = cat.roles[j];
                    html += '<div class="st-inline">' +
                        '<span class="st-inline__label">\u2014 ' +
                        esc(r.name || r.id || '') + '</span>' +
                        '<span class="st-inline__value">' +
                        fmtNum(r.count) + '</span>' +
                        '</div>';
                }
            } else if (Array.isArray(cat.roles) && cat.roles.length > 5) {
                html += '<div class="st-inline">' +
                    '<span class="st-inline__label">\u2014 ' +
                    fmtNum(cat.roles.length) + ' roles in this category' +
                    '</span>' +
                    '</div>';
            }
        }

        html += '</div></div>';
        return html;
    }

    function fmtPercent(n) { return H().fmtPercent(n); }

    function _categoryLabel(cat, catId) {
        if (cat && Array.isArray(cat.roles) && cat.roles.length > 0) {
            var first = cat.roles[0];
            if (first && typeof first.categoryName === 'string'
                && first.categoryName.length > 0) {
                return first.categoryName;
            }
        }
        if (!catId) return 'Uncategorized';
        return String(catId).split('_').map(function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1);
        }).join(' ');
    }

    function _buildTopRolesSection(roleStats) {
        if (!roleStats || !Array.isArray(roleStats.topRoles)
            || roleStats.topRoles.length === 0) {
            return '';
        }
        var topRoles = roleStats.topRoles;
        var limit = Math.min(10, topRoles.length);

        var html = '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('CROWN') + ' Top Roles</div>' +
            '<div class="st-rows">';

        for (var i = 0; i < limit; i++) {
            var role = topRoles[i];
            if (!role) continue;
            var pct = typeof role.percentage === 'number' ? role.percentage : 0;

            html += '<button type="button" class="st-row st-row--accent" ' +
                'data-action="role-details" ' +
                'data-role-id="' + esc(role.id || '') + '" ' +
                'data-role-name="' + esc(role.name || '') + '" ' +
                'title="Click for character list">' +
                '<div class="st-row__body">' +
                '<div class="st-row__title">' +
                esc(role.name || 'Unnamed') + '</div>' +
                '</div>' +
                '<div class="st-row__meta">' +
                fmtNum(role.count) + ' (' + fmtPercent(pct) + ')' +
                '</div>' +
                '</button>';
        }

        if (topRoles.length > limit) {
            html += '<div class="st-row__meta">' +
                '+' + fmtNum(topRoles.length - limit) + ' more role' +
                (topRoles.length - limit === 1 ? '' : 's') +
                '</div>';
        }

        html += '</div></div>';
        return html;
    }

    function _buildTopMastersSection(density) {
        if (!density || !Array.isArray(density.topMasters)
            || density.topMasters.length === 0) {
            return '';
        }
        var topMasters = density.topMasters;
        var limit = Math.min(10, topMasters.length);

        var html = '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('CROWN') + ' Top Masters</div>' +
            '<div class="st-rows">';

        for (var i = 0; i < limit; i++) {
            var m = topMasters[i];
            if (!m) continue;
            html += '<div class="st-row st-row--accent">' +
                '<div class="st-row__body">' +
                '<div class="st-row__title">' +
                icon('CROWN') + ' ' +
                esc(m.masterName || m.masterId || 'Unknown') + '</div>' +
                '</div>' +
                '<div class="st-row__meta">' +
                fmtNum(m.apprenticeCount) + ' apprentice' +
                (m.apprenticeCount === 1 ? '' : 's') +
                '</div>' +
                '</div>';
        }

        if (topMasters.length > limit) {
            html += '<div class="st-row__meta">' +
                '+' + fmtNum(topMasters.length - limit) + ' more master' +
                (topMasters.length - limit === 1 ? '' : 's') +
                '</div>';
        }

        html += '</div></div>';
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

        var html = '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('STAR_4') + ' Skill Level Distribution</div>' +
            '<div class="st-section__body">';

        for (var k = 0; k < tierIds.length; k++) {
            var tierId = tierIds[k];
            var count = typeof countsByTier[tierId] === 'number'
                ? countsByTier[tierId] : 0;
            var pct = total > 0 ? Math.round((count / total) * 100) : 0;

            html += '<div class="st-inline">' +
                '<span class="st-inline__label">' +
                esc(_tierLabel(tierId)) + '</span>' +
                '<span class="' + _tierClass(tierId) + '">' +
                fmtNum(count) + ' (' + fmtPercent(pct) + ')' +
                '</span>' +
                '</div>';
        }

        html += '</div></div>';
        return html;
    }

    function _buildEmptyState() {
        return '<div class="st-empty">' +
            icon('PERSON') + ' No professions recorded in this settlement.<br>' +
            '<span>Characters with professions will appear here.</span>' +
            '</div>';
    }

    function _buildFooter() {
        return '<div class="st-footer">' + icon('CIRCLE_DOT') +
            ' <span>Role diversity affects settlement prosperity. Masters ' +
            '(skill 76+) provide a prosperity bonus. Apprentices learn from ' +
            'masters to advance their skills. Click a role for the character ' +
            'list; use the buttons above for full role and apprenticeship ' +
            'detail.</span></div>';
    }

    // -------------------------------------------------------------------
    // Wiring
    // -------------------------------------------------------------------

    function _handleAction(action, btn, locationId) {
        if (action === 'refresh') {
            refresh();
            return;
        }
        if (action === 'view-all-roles') {
            _openAllRolesModal(locationId);
            return;
        }
        if (action === 'view-apprenticeships') {
            _openApprenticeshipsModal(locationId);
            return;
        }
        if (action === 'role-details') {
            var roleId = btn.dataset.roleId;
            var roleName = btn.dataset.roleName || roleId;
            if (roleId) _openRoleDetailsModal(locationId, roleId, roleName);
            return;
        }
    }

    function _wireActions(container, locationId) {
        if (container.__stRolesWired) return;
        container.__stRolesWired = true;
        container.addEventListener('click', function (event) {
            var btn = event.target.closest('[data-action]');
            if (!btn || !container.contains(btn)) return;
            event.preventDefault();
            _handleAction(btn.dataset.action, btn, locationId);
        });
    }

    // -------------------------------------------------------------------
    // Renderer
    // -------------------------------------------------------------------

    function renderSettlementRoles(container, context) {
        if (!container) return;
        if (!context || !context.locationId) {
            container.innerHTML = H().emptyState('no-context');
            return;
        }

        var locationId = context.locationId;

        if (!_getSettlementQueries()) {
            container.innerHTML = '<div class="st-error">' +
                'SettlementQueries role aggregates are not available.</div>';
            return;
        }

        var roleStats = _fetchRoleStats(locationId);
        var density = _fetchApprenticeshipDensity(locationId);

        var html = '<div class="st-tab">' +
            _buildHeader(context, roleStats, density) +
            _buildActionButtons();

        if (!roleStats || roleStats.totalProfessions === 0) {
            html += _buildEmptyState();
        } else {
            html += _buildStatsGrid(roleStats, density);
            html += _buildRatioRow(density);
            html += _buildCategorySection(roleStats);
            html += _buildTopRolesSection(roleStats);
            html += _buildTopMastersSection(density);
            html += _buildSkillLevelSection(roleStats);
        }

        html += _buildFooter() + '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);
    }

    // -------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderSettlementRoles);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'settlement-roles-tab: TabManager is not available at load ' +
            'time; the tab was not registered.'
        );
    }

    window.renderSettlementRoles = renderSettlementRoles;

})();
