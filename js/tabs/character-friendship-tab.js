// js/tabs/character-friendship-tab.js
/**
 * =============================================================================
 * STILL WATERS - CHARACTER FRIENDSHIP TAB
 * (js/tabs/character-friendship-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/character-friendship-tab.js
 *
 * The Friendship tab of the Character Manager. Shows the character's
 * current friends, best friend, former friends, and aggregate
 * statistics. All writes delegate to the existing friendship modals.
 *
 * RENDERER CONTRACT (from CharacterManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { characterId, character }  — CharacterQueries projection
 *
 * DATA SOURCES:
 *   - CharacterViewModels.buildFriendshipModel(characterId)
 *   - window.openFriendshipModal(characters, onSuccess)
 *   - window.openViewFriendshipModal(aId, bId, onEdit)
 *   - window.openEditFriendshipModal(aId, bId, onSuccess)
 *   - window.openCharacterSelector(options)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - FIXED: Stale listener accumulation. The tab used to add a
 *       container-level click listener on every render without
 *       removing the previous one. This caused "View" and "Edit" to
 *       fire the oldest handler (with a stale model) after any
 *       refresh, leading to incorrect id resolution or silent
 *       failures. The handler is now stored on the container and
 *       replaced on every render.
 *     - FIXED: Disabled View / Edit buttons if the friend id or
 *       relationship id is missing, instead of silently calling the
 *       modal with undefined ids.
 *     - FIXED: _onAddFriend now uses a robust _getCharacterProjection
 *       fallback (trying CharacterQueries.getCharacterSummary, then
 *       getCharacterById, then a minimal synthetic object) so the
 *       Add Friend flow works even if the summary projection is
 *       partially broken.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. CONSTANTS
    // =========================================================================

    var TAB_ID = 'friendship';
    var SCOPE  = 'character';

    var SECTIONS = [
        { key: 'best',    label: 'Best Friend',  icon: 'STAR' },
        { key: 'friends', label: 'Friends',      icon: 'FRIENDSHIP' },
        { key: 'stats',   label: 'Statistics',   icon: 'CENSUS' },
        { key: 'former',  label: 'Former Friends', icon: 'STATUS_ENDED' }
    ];

    var HANDLER_KEY = '__friendshipTabClickHandler';

    // =========================================================================
    // 1. SMALL HELPERS
    // =========================================================================

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _isMissing(v) { return v === undefined || v === null; }
    function _hasId(v) { return typeof v === 'string' && v.length > 0; }

    function _icon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        if (window.Icons && window.Icons.CIRCLE) return window.Icons.CIRCLE;
        return '';
    }

    function _uiState() { return window.CharacterUIState || null; }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            try { window.showToast(msg, type || 'info'); }
            catch (e) { /* non-fatal */ }
        } else if (typeof console !== 'undefined' && console.warn) {
            console.warn('[friendship-tab] ' + (type || 'info') + ': ' + msg);
        }
    }

    function _refresh() {
        if (window.CharacterManagerBootstrap
            && typeof window.CharacterManagerBootstrap.renderActive === 'function') {
            try { window.CharacterManagerBootstrap.renderActive(); }
            catch (e) { /* non-fatal */ }
        }
    }

    function _year(v) {
        if (typeof window.formatYear === 'function') return window.formatYear(v);
        if (_isMissing(v)) return '?';
        return String(v);
    }

    function _count(n, singular, plural) {
        if (typeof window.formatCount === 'function') {
            return window.formatCount(n, singular, plural);
        }
        return n + ' ' + (n === 1 ? singular : plural);
    }

    function _isCollapsed(key) {
        var ui = _uiState();
        if (!ui || typeof ui.getCollapsed !== 'function') return false;
        return ui.getCollapsed(TAB_ID, key) === true;
    }

    function _setCollapsed(key, collapsed) {
        var ui = _uiState();
        if (!ui || typeof ui.setCollapsed !== 'function') return;
        ui.setCollapsed(TAB_ID, key, collapsed);
    }

    /**
     * Tolerant relationship-id resolution.
     */
    function _getRelId(rel) {
        if (!rel) return null;
        if (_hasId(rel.relationshipId)) return rel.relationshipId;
        if (_hasId(rel.id)) return rel.id;
        if (_hasId(rel.relationship_id)) return rel.relationship_id;
        return null;
    }

    /**
     * Projects a character for openFriendshipModal / openCharacterSelector.
     */
    function _getCharacterProjection(characterId) {
        try {
            if (window.CharacterQueries
                && typeof window.CharacterQueries.getCharacterSummary === 'function') {
                var summary = window.CharacterQueries.getCharacterSummary(characterId);
                if (summary && _hasId(summary.id)) return summary;
            }
        } catch (e) { /* fall through */ }

        try {
            if (typeof window.getCharacterById === 'function') {
                var c = window.getCharacterById(characterId);
                if (c && _hasId(c.id)) {
                    return {
                        id: c.id,
                        name: c.name || '',
                        surname: c.surname || '',
                        fullName: (c.name || '') +
                            (c.surname ? ' ' + c.surname : ''),
                        birthYear: c.birthYear,
                        isDeceased: c.isDeceased === true,
                        deathYear: c.deathYear,
                        gender: c.gender || 'unknown'
                    };
                }
            }
        } catch (e) { /* fall through */ }

        return null;
    }

    // =========================================================================
    // 2. SECTION SHELL
    // =========================================================================

    function _sectionHtml(section, bodyHtml) {
        var collapsed = _isCollapsed(section.key);
        var cls = 'character-tab-section' + (collapsed ? '' : ' is-expanded');
        var ariaExpanded = collapsed ? 'false' : 'true';
        return '' +
            '<div class="' + cls + '" data-section="' + _esc(section.key) + '">' +
                '<button type="button" class="character-tab-section__header" ' +
                    'aria-expanded="' + ariaExpanded + '" ' +
                    'data-action="toggle-section" ' +
                    'data-section-key="' + _esc(section.key) + '">' +
                    '<span class="character-tab-section__toggle" aria-hidden="true">' +
                        (collapsed ? '\u25B6' : '\u25BC') +
                    '</span>' +
                    '<span class="character-tab-section__icon" aria-hidden="true">' +
                        _icon(section.icon) +
                    '</span>' +
                    '<span class="character-tab-section__title">' +
                        _esc(section.label) +
                    '</span>' +
                '</button>' +
                '<div class="character-tab-section__body">' +
                    bodyHtml +
                '</div>' +
            '</div>';
    }

    function _empty(message) {
        return '<div class="character-tab-empty">' + _esc(message) + '</div>';
    }

    function _unavailable(message) {
        return '<div class="character-tab-unavailable">' + _esc(message) + '</div>';
    }

    // =========================================================================
    // 3. FRIEND ROW RENDERING
    // =========================================================================

    function _strengthBarHtml(strength, color) {
        if (typeof strength !== 'number' || !Number.isFinite(strength)) {
            return '';
        }
        var clamped = Math.max(0, Math.min(100, strength));
        var bg = color || 'var(--accent)';
        return '' +
            '<div class="character-friendship-strength">' +
                '<div class="character-friendship-strength__bar">' +
                    '<div class="character-friendship-strength__fill" ' +
                        'style="width:' + clamped + '%; background:' + _esc(bg) + ';"></div>' +
                '</div>' +
                '<div class="character-friendship-strength__label">' +
                    _esc(clamped + '%') +
                '</div>' +
            '</div>';
    }

    function _metaLineHtml(friend) {
        var bits = [];
        if (friend.tierLabel) {
            bits.push(friend.tierLabel);
        }
        if (typeof friend.startYear === 'number') {
            bits.push('since ' + _year(friend.startYear) +
                (friend.durationYears ? ' (' + friend.durationYears + 'y)' : ''));
        }
        if (friend.mutualFriendCount > 0) {
            bits.push(_count(friend.mutualFriendCount, 'mutual friend', 'mutual friends'));
        }
        if (friend.eventCount > 0) {
            bits.push(_count(friend.eventCount, 'event', 'events'));
        }
        if (bits.length === 0) return '';
        return '<div class="character-friendship-meta">' +
            _esc(bits.join(' · ')) +
        '</div>';
    }

    function _actionsHtml(friend, active) {
        if (!active) return '';

        var friendId = friend.friendId;
        var hasFriendId = _hasId(friendId);
        var relId = _getRelId(friend);

        var viewEnabled = hasFriendId
            && window.openViewFriendshipModal
            && typeof window.openViewFriendshipModal === 'function';
        var editEnabled = hasFriendId
            && window.openEditFriendshipModal
            && typeof window.openEditFriendshipModal === 'function';

        var viewAttrs = viewEnabled ? '' : ' disabled title="View is not available"';
        var editAttrs = editEnabled ? '' : ' disabled title="Edit is not available"';

        return '' +
            '<div class="character-friendship-actions">' +
                '<button type="button" class="character-tab-btn-small" ' +
                    'data-action="view-friend" ' +
                    'data-friend-id="' + _esc(friendId || '') + '" ' +
                    viewAttrs + '>View</button>' +
                '<button type="button" class="character-tab-btn-small" ' +
                    'data-action="edit-friend" ' +
                    'data-friend-id="' + _esc(friendId || '') + '" ' +
                    editAttrs + '>Edit</button>' +
            '</div>';
    }

    function _friendRowHtml(friend, active) {
        var compact = '';
        if (window.CharacterViewModels
            && typeof window.CharacterViewModels.compactRow === 'function') {
            compact = window.CharacterViewModels.compactRow(friend.friendId, '');
        } else {
            compact = '<div class="character-row" data-character-id="' +
                _esc(friend.friendId) + '"><span class="character-row__name">' +
                _esc(friend.friendName || friend.friendId) +
                '</span></div>';
        }

        var strengthHtml = active
            ? _strengthBarHtml(friend.strength, friend.typeColor)
            : '';

        var relId = _getRelId(friend) || '';

        return '' +
            '<div class="character-friendship-row' +
                (friend.friendIsDeceased ? ' is-deceased' : '') +
                '" data-relationship-id="' + _esc(relId) + '">' +
                '<div class="character-friendship-row__main">' +
                    compact +
                    _metaLineHtml(friend) +
                '</div>' +
                strengthHtml +
                _actionsHtml(friend, active) +
            '</div>';
    }

    // =========================================================================
    // 4. SECTION BODIES
    // =========================================================================

    function _bodyBestFriend(model) {
        if (model.best === null) {
            if (model.errors && model.errors.best) {
                return _unavailable(
                    'Best friend section could not be loaded: ' +
                    model.errors.best
                );
            }
            return _empty('No best friend recorded. Friendships become "best" as strength passes 75%.');
        }
        return _friendRowHtml(model.best, true);
    }

    function _bodyFriends(model) {
        if (model.active === null || !Array.isArray(model.active)) {
            var err = model.errors && model.errors.active
                ? model.errors.active
                : 'unknown error';
            return _unavailable('Friends section could not be loaded: ' + err);
        }
        if (model.active.length === 0) {
            return _empty('No current friends. Use "Add Friend" to create one.');
        }
        var html = '';
        for (var i = 0; i < model.active.length; i++) {
            html += _friendRowHtml(model.active[i], true);
        }
        return html;
    }

    function _bodyStats(model) {
        if (!model.stats) {
            var err = model.errors && model.errors.stats
                ? model.errors.stats
                : 'unknown error';
            return _unavailable('Statistics section could not be loaded: ' + err);
        }

        var s = model.stats;
        var tb = s.tierBreakdown || {};

        var html = '';
        html += '<div class="character-friendship-stats">';

        html += _statField('Total friends',
            String(s.totalFriends || 0));

        html += _statField('Average strength',
            (typeof s.averageStrength === 'number')
                ? (s.averageStrength + '%')
                : '—');

        html += _statField('Earliest friendship',
            (typeof s.earliestStartYear === 'number')
                ? _year(s.earliestStartYear)
                : '—');

        html += '<div class="character-friendship-stat-field ' +
            'character-friendship-stat-field--wide">' +
            '<div class="character-friendship-stat-field__label">By tier</div>' +
            '<div class="character-friendship-stat-field__value">' +
                _tierBreakdownHtml(tb) +
            '</div>' +
        '</div>';

        html += '</div>';
        return html;
    }

    function _statField(label, value) {
        return '<div class="character-friendship-stat-field">' +
            '<div class="character-friendship-stat-field__label">' +
                _esc(label) +
            '</div>' +
            '<div class="character-friendship-stat-field__value">' +
                _esc(value) +
            '</div>' +
        '</div>';
    }

    function _tierBreakdownHtml(tb) {
        var rows = [
            { key: 'best_friend',  label: 'Best friend',  color: '#2a6e40' },
            { key: 'close_friend', label: 'Close friend', color: '#4a9060' },
            { key: 'friend',       label: 'Friend',       color: '#c8a844' },
            { key: 'acquaintance', label: 'Acquaintance', color: '#888888' }
        ];

        var html = '<div class="character-friendship-tiers">';
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var count = (typeof tb[row.key] === 'number') ? tb[row.key] : 0;
            html += '<div class="character-friendship-tier">' +
                '<span class="character-friendship-tier__dot" ' +
                    'style="background:' + _esc(row.color) + ';"></span>' +
                '<span class="character-friendship-tier__label">' +
                    _esc(row.label) +
                '</span>' +
                '<span class="character-friendship-tier__count">' +
                    _esc(String(count)) +
                '</span>' +
            '</div>';
        }
        html += '</div>';
        return html;
    }

    function _bodyFormerFriends(model) {
        if (model.former === null || !Array.isArray(model.former)) {
            var err = model.errors && model.errors.former
                ? model.errors.former
                : 'unknown error';
            return _unavailable('Former friends section could not be loaded: ' + err);
        }
        if (model.former.length === 0) {
            return _empty('No former friends.');
        }
        var html = '';
        for (var i = 0; i < model.former.length; i++) {
            html += _friendRowHtml(model.former[i], false);
        }
        return html;
    }

    // =========================================================================
    // 5. RENDER
    // =========================================================================

    function renderFriendshipTab(container, context) {
        if (!container) return;
        if (!context || !_hasId(context.characterId)) {
            container.innerHTML = _empty('No character selected.');
            return;
        }

        var VM = window.CharacterViewModels;
        if (!VM || typeof VM.buildFriendshipModel !== 'function') {
            container.innerHTML = _unavailable(
                'CharacterViewModels.buildFriendshipModel is not loaded; ' +
                'cannot render the Friendship tab.'
            );
            return;
        }

        var model;
        try { model = VM.buildFriendshipModel(context.characterId); }
        catch (e) { model = null; }

        if (!model) {
            container.innerHTML = _unavailable('Character could not be loaded.');
            return;
        }

        var addFriendEnabled = (window.openFriendshipModal
            && typeof window.openFriendshipModal === 'function'
            && window.openCharacterSelector
            && typeof window.openCharacterSelector === 'function');

        var addFriendAttrs = addFriendEnabled
            ? ''
            : ' disabled title="Add Friend requires the friendship modal and the character selector to be loaded"';

        var headerHtml = '' +
            '<div class="character-friendship-header">' +
                '<div class="character-friendship-header__title">' +
                    _esc('Friendships') +
                '</div>' +
                '<div class="character-friendship-header__actions">' +
                    '<button type="button" class="character-tab-btn primary" ' +
                        'data-action="add-friend"' + addFriendAttrs + '>' +
                        _icon('PLUS') + ' Add Friend' +
                    '</button>' +
                '</div>' +
            '</div>';

        var body = '';
        body += headerHtml;
        body += _sectionHtml(SECTIONS[0], _bodyBestFriend(model));
        body += _sectionHtml(SECTIONS[1], _bodyFriends(model));
        body += _sectionHtml(SECTIONS[2], _bodyStats(model));
        body += _sectionHtml(SECTIONS[3], _bodyFormerFriends(model));

        container.innerHTML = body;
        _wire(container, context.characterId);
    }

    // =========================================================================
    // 6. WIRING
    // =========================================================================

    function _wire(container, characterId) {
        var headers = container.querySelectorAll('.character-tab-section__header');
        for (var i = 0; i < headers.length; i++) {
            headers[i].addEventListener('click', _onToggleSection);
        }

        // Remove previous handler to prevent stale closures (the same bug
        // that was fixed in the romance tab).
        if (container[HANDLER_KEY]) {
            container.removeEventListener('click', container[HANDLER_KEY]);
            container[HANDLER_KEY] = null;
        }

        var handler = function (e) {
            var target = e.target;

            var nameLink = target.closest
                ? target.closest('[data-character-id].character-row__name')
                : null;
            if (nameLink) {
                e.preventDefault();
                var linkCharId = nameLink.getAttribute('data-character-id');
                if (_hasId(linkCharId)) {
                    _selectCharacter(linkCharId);
                }
                return;
            }

            var btn = target.closest
                ? target.closest('[data-action]')
                : null;
            if (!btn || !container.contains(btn)) return;

            var action = btn.getAttribute('data-action');
            if (!action) return;

            if (action === 'toggle-section') return;
            if (btn.disabled) return;

            e.preventDefault();
            _dispatchAction(action, btn, characterId);
        };

        container[HANDLER_KEY] = handler;
        container.addEventListener('click', handler);
    }

    function _onToggleSection(e) {
        var btn = e.currentTarget;
        if (!btn) return;
        var key = btn.getAttribute('data-section-key');
        if (!_hasId(key)) return;

        var section = btn.parentNode;
        if (!section) return;

        var isExpanded = section.classList.contains('is-expanded');
        if (isExpanded) {
            section.classList.remove('is-expanded');
            btn.setAttribute('aria-expanded', 'false');
            var icon = btn.querySelector('.character-tab-section__toggle');
            if (icon) icon.textContent = '\u25B6';
            _setCollapsed(key, true);
        } else {
            section.classList.add('is-expanded');
            btn.setAttribute('aria-expanded', 'true');
            var icon2 = btn.querySelector('.character-tab-section__toggle');
            if (icon2) icon2.textContent = '\u25BC';
            _setCollapsed(key, false);
        }
    }

    function _selectCharacter(characterId) {
        var ui = _uiState();
        if (!ui || typeof ui.setSelectedCharacterId !== 'function') return;
        ui.setSelectedCharacterId(characterId);
        _refresh();
    }

    function _dispatchAction(action, btn, characterId) {
        switch (action) {
            case 'add-friend':
                _onAddFriend(characterId); return;
            case 'view-friend':
                _onViewFriend(characterId, btn); return;
            case 'edit-friend':
                _onEditFriend(characterId, btn); return;
            default:
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[friendship-tab] unknown action: ' + action);
                }
        }
    }

    // =========================================================================
    // 7. ACTION IMPLEMENTATIONS
    // =========================================================================

    function _onAddFriend(characterId) {
        if (typeof window.openCharacterSelector !== 'function') {
            _toast('Character selector is not loaded; cannot add a friend.', 'error');
            return;
        }
        if (typeof window.openFriendshipModal !== 'function') {
            _toast('Friendship modal is not loaded; cannot add a friend.', 'error');
            return;
        }

        var subject = _getCharacterProjection(characterId);
        if (!subject) {
            _toast('Subject character not found.', 'error');
            return;
        }

        window.openCharacterSelector({
            title: 'Select Friend for ' + (subject.name || 'this character'),
            excludeIds: [characterId],
            filters: {
                status: 'living',
                showDeceased: true
            },
            onSelect: function (selected) {
                if (!selected || !_hasId(selected.id)) return;
                if (selected.id === characterId) {
                    _toast('A character cannot befriend themselves.', 'error');
                    return;
                }
                window.openFriendshipModal(
                    [subject, selected],
                    function () {
                        _refresh();
                        _toast('Friendship created.', 'success');
                    }
                );
            }
        });
    }

    function _onViewFriend(characterId, btn) {
        if (typeof window.openViewFriendshipModal !== 'function') {
            _toast('View modal is not loaded.', 'error');
            return;
        }
        var friendId = btn.getAttribute('data-friend-id');
        if (!_hasId(friendId)) {
            _toast('Friend id is missing.', 'error');
            return;
        }

        window.openViewFriendshipModal(
            characterId,
            friendId,
            function () {
                _refresh();
            }
        );
    }

    function _onEditFriend(characterId, btn) {
        if (typeof window.openEditFriendshipModal !== 'function') {
            _toast('Edit modal is not loaded.', 'error');
            return;
        }
        var friendId = btn.getAttribute('data-friend-id');
        if (!_hasId(friendId)) {
            _toast('Friend id is missing.', 'error');
            return;
        }

        window.openEditFriendshipModal(
            characterId,
            friendId,
            function () {
                _refresh();
            }
        );
    }

    // =========================================================================
    // 8. REGISTRATION
    // =========================================================================

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderFriendshipTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'character-friendship-tab.js: TabManager is not available; ' +
            'the tab was not registered.'
        );
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.CharacterFriendshipTab = {
        id: TAB_ID,
        render: renderFriendshipTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterFriendshipTab;
    }
})();
