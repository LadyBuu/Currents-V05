// js/tabs/role-assignments-tab.js
/**
 * =============================================================================
 * STILL WATERS - ROLE ASSIGNMENTS TAB (js/tabs/role-assignments-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/role-assignments-tab.js
 *
 * The assignments tab of the Role Manager. A preview + entry point for
 * assigning the currently-selected role to characters (single or bulk).
 *
 * =============================================================================
 * DESIGN
 * =============================================================================
 *
 * This tab exists so that "assign this role to a character" is a
 * first-class action on its own surface, not a hidden button on the
 * Details footer or the Characters header. Its job:
 *
 *   1. Show the current holder count and a compact sample.
 *   2. Show how many characters are CURRENTLY ELIGIBLE for this role.
 *   3. Provide two buttons — "Assign Single" and "Bulk Assign" — that
 *      each delegate to the canonical modal, which owns the entire
 *      write path (form, filter bar, RCMD.assign*, persist, toast).
 *
 * This tab is a PREVIEW. It does not:
 *   - collect input
 *   - filter candidates
 *   - check eligibility rules (gender, deceased)
 *   - call any write command
 *   - call persist()
 *
 * Those are the modals' jobs. The modals already do them correctly.
 * Duplicating any of that here would be a second surface to drift from.
 *
 * =============================================================================
 * ELIGIBILITY — THE SOURCE OF TRUTH
 * =============================================================================
 *
 * The eligible count comes from RoleQueries.getEligibleCharactersForRole,
 * called with empty filters. That query:
 *
 *   - excludes deceased characters
 *   - enforces the role's gender restriction
 *   - applies optional search / gender / location filters (all empty here)
 *
 * It does NOT check literacy. That is correct: per role-commands.js
 * (_assignRoleInternal), literacy is not checked at assignment time.
 * It is a record field on the role, not a gate on the command. If a
 * future revision adds literacy enforcement to the command layer, the
 * query should be updated to reflect it, and this tab will show the new
 * count without a code change here.
 *
 * The tab does NOT re-derive eligibility. It calls the query once and
 * reads the length. If the count is 0, the tab inspects a few primitives
 * (total living characters, role gender restriction, current holder
 * count) to explain WHY. Explaining is not re-deriving: the explanation
 * uses only the query's own inputs.
 *
 * =============================================================================
 * WRITE PATHS
 * =============================================================================
 *
 *   Assign Single:
 *     window.openAssignRoleModal(roleId, onSuccess)
 *     → modal owns RCMD.assignRoleToCharacter + RCMD.persist + toast
 *
 *   Bulk Assign:
 *     window.openBulkAssignRoleModal(roleId, onSuccess)
 *     → modal owns RCMD.bulkAssignRole + RCMD.persist + toast
 *
 * In both cases, the tab's onSuccess receives no payload (the modals
 * do not pass one — they call onSuccess with no arguments). The tab
 * re-renders. That is the whole contract.
 *
 * The tab NEVER calls persist(). It NEVER calls any RCMD.* function.
 * If a future revision is tempted to "just" do an inline assign for
 * speed, read this comment first: the correctness gain is zero, and
 * the drift cost is permanent.
 *
 * =============================================================================
 * WHAT THIS TAB DOES *NOT* SHOW
 * =============================================================================
 *
 *   - Filters: the modal has its own (search, gender, location). A
 *     second filter bar here would be a second UI over the same data.
 *
 *   - Remove: removing a role from a character is a per-character
 *     action on the Characters tab, not a per-role action.
 *
 *   - Skill level: the assignment modal has a skill slider. The tab
 *     does not preview a default — that would be misleading, because
 *     the user picks it in the modal.
 *
 *   - Bulk-merge state: the bulk modal shows the result counts on its
 *     own. The tab does not.
 *
 * =============================================================================
 * EMPTY / DISABLED STATES
 * =============================================================================
 *
 *   no role selected    → "Select a role from the sidebar."
 *   role has 0 eligible → disabled buttons + explanation (see below).
 *   0 holders            → "No holders yet." in the holders panel.
 *   no Living chars      → "No living characters exist." (rare; shown
 *                          as the disabled reason).
 *
 * Explanation of a 0-eligible count is disambiguated against:
 *   - role.genderRestriction: 'male' | 'female' | 'both'
 *   - total living characters in the world
 *   - current holder count (all eligible already holders)
 *
 * Order of checks: gender first (it is the sharpest), then "all
 * eligible already hold it", then "no living characters". If none of
 * those apply and the count is still 0, a generic message is shown.
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager            (js/core/tab-manager.js)
 *   - RoleState             (js/roles/role-state.js)       — getRole
 *   - RoleQueries           (js/roles/role-queries.js)     — getCharactersWithRole,
 *                                                             getCharactersWithRoleDetails,
 *                                                             getEligibleCharactersForRole
 *   - CharacterState        (js/character/character-state.js) — getAllCharacters
 *                                                             (for the "no living
 *                                                             characters" check)
 *   - formatting.js         (escapeHtml)
 *   - ui.js                 (showToast)                    — defensive only
 *   - modals-roles.js       (openAssignRoleModal,
 *                            openBulkAssignRoleModal)      — write path
 *
 *   getEligibleCharactersForRole is REQUIRED — its absence surfaces as
 *   an unavailable state, not a silent zero count. Same discipline as
 *   the other tabs.
 *
 * TIME CONTRACT: this tab does not read the current year.
 *
 * ICON POLICY: no emojis. Glyphs from Icons[name], '' fallback.
 *
 * INLINE STYLES: one injected <style> block (id
 * 'role-assignments-tab-styles'). Every visual value is a themes.css
 * token. Idempotent.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Written for the RoleManager TabManager integration.
 *     - The existing modals-roles.js::openAssignRoleModal and
 *       openBulkAssignRoleModal were already correct: they own the
 *       form, the eligibility filter bar, the command invocation, the
 *       persist, the toast, and the onSuccess ordering. This tab is a
 *       preview surface, not a reimplementation.
 *     - The old roles-tab.js had Assign / Bulk Assign as footer
 *       buttons on the Details tab. That worked but buried the actions
 *       in a panel that was supposed to be about the role record. This
 *       tab gives them their own surface.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. STYLE BLOCK (idempotent, theme tokens only)
    // =========================================================================

    var STYLE_ID = 'role-assignments-tab-styles';

    function _injectStyles() {
        if (typeof document === 'undefined') return;
        if (document.getElementById(STYLE_ID)) return;

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            /* ---- Root ---- */
            '.rasg { display: flex; flex-direction: column; gap: 0.875rem; }',

            /* ---- Header ---- */
            '.rasg__header {',
            '  display: flex; justify-content: space-between; align-items: flex-end;',
            '  gap: 0.75rem; flex-wrap: wrap;',
            '  padding-bottom: 0.625rem;',
            '  border-bottom: 1px solid var(--border);',
            '}',
            '.rasg__title {',
            '  font-family: var(--f-display); font-size: 0.9rem; font-weight: 600;',
            '  color: var(--accent-light);',
            '}',
            '.rasg__subtitle {',
            '  font-size: 0.65rem; color: var(--dim);',
            '  margin-top: 0.125rem;',
            '  display: flex; gap: 0.5rem; flex-wrap: wrap;',
            '}',
            '.rasg__subtitle span { white-space: nowrap; }',
            '.rasg__header-actions { display: flex; gap: 0.375rem; flex-wrap: wrap; }',

            /* ---- Buttons ---- */
            '.rasg-btn {',
            '  display: inline-flex; align-items: center; gap: 0.25rem;',
            '  padding: 0.3125rem 0.75rem;',
            '  background: var(--bg3); border: 1px solid var(--border);',
            '  border-radius: var(--radius); color: var(--text);',
            '  font-family: var(--f-body); font-size: 0.7rem; font-weight: 500;',
            '  cursor: pointer; line-height: 1.2;',
            '}',
            '.rasg-btn svg { width: 0.85em; height: 0.85em; fill: currentColor; }',
            '.rasg-btn:hover:not(:disabled) {',
            '  border-color: var(--accent); color: var(--accent-light);',
            '}',
            '.rasg-btn--primary {',
            '  background: var(--accent); border-color: var(--accent);',
            '  color: var(--accent-fg);',
            '}',
            '.rasg-btn--primary:hover:not(:disabled) { background: var(--accent-dark); }',
            '.rasg-btn:disabled { opacity: 0.45; cursor: not-allowed; }',

            /* ---- Stats grid ---- */
            '.rasg__stats {',
            '  display: grid;',
            '  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));',
            '  gap: 0.5rem;',
            '}',
            '.rasg-stat {',
            '  padding: 0.625rem 0.75rem;',
            '  background: var(--bg2); border: 1px solid var(--border);',
            '  border-radius: var(--radius); text-align: center;',
            '}',
            '.rasg-stat__value {',
            '  font-family: var(--f-mono); font-size: 1.15rem; font-weight: 600;',
            '  color: var(--text); line-height: 1.2;',
            '}',
            '.rasg-stat__value--accent { color: var(--accent); }',
            '.rasg-stat__value--ok { color: var(--ok, var(--accent)); }',
            '.rasg-stat__value--warn { color: var(--warn, var(--dim)); }',
            '.rasg-stat__label {',
            '  font-family: var(--f-display); font-size: 0.55rem;',
            '  text-transform: uppercase; letter-spacing: 0.06em;',
            '  color: var(--dim); margin-top: 0.125rem;',
            '}',
            '.rasg-stat__hint {',
            '  font-size: 0.55rem; color: var(--dim);',
            '  margin-top: 0.125rem;',
            '}',

            /* ---- Panel ---- */
            '.rasg-panel {',
            '  background: var(--bg2); border: 1px solid var(--border);',
            '  border-radius: var(--radius); padding: 0.875rem 1rem;',
            '}',
            '.rasg-panel__header {',
            '  display: flex; justify-content: space-between; align-items: center;',
            '  gap: 0.5rem; margin-bottom: 0.625rem; flex-wrap: wrap;',
            '  padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);',
            '}',
            '.rasg-panel__title {',
            '  font-family: var(--f-display); font-size: 0.72rem; font-weight: 600;',
            '  color: var(--accent-light);',
            '  text-transform: uppercase; letter-spacing: 0.06em;',
            '}',
            '.rasg-panel__note {',
            '  font-size: 0.65rem; color: var(--dim);',
            '  line-height: 1.55;',
            '}',

            /* ---- Sample holder list ---- */
            '.rasg-sample {',
            '  display: flex; flex-direction: column; gap: 0.1875rem;',
            '  margin-top: 0.5rem;',
            '}',
            '.rasg-sample__row {',
            '  display: flex; justify-content: space-between; align-items: center;',
            '  gap: 0.5rem; padding: 0.25rem 0.5rem;',
            '  background: var(--bg3); border-radius: var(--radius);',
            '  font-size: 0.7rem;',
            '}',
            '.rasg-sample__name {',
            '  color: var(--text); overflow: hidden;',
            '  text-overflow: ellipsis; white-space: nowrap;',
            '}',
            '.rasg-sample__skill {',
            '  font-family: var(--f-mono); color: var(--dim);',
            '  font-size: 0.6rem;',
            '  white-space: nowrap;',
            '}',
            '.rasg-sample__more {',
            '  margin-top: 0.375rem; text-align: center;',
            '  font-size: 0.65rem; color: var(--dim); font-style: italic;',
            '}',

            /* ---- Disabled explanation ---- */
            '.rasg-warn {',
            '  padding: 0.625rem 0.875rem;',
            '  background: var(--bg3);',
            '  border-left: 3px solid var(--warn, var(--dim));',
            '  border-radius: 0 var(--radius) var(--radius) 0;',
            '  font-size: 0.7rem; color: var(--text);',
            '  line-height: 1.55;',
            '}',

            /* ---- Empty / unavailable ---- */
            '.rasg-empty {',
            '  padding: 1.5rem; text-align: center;',
            '  color: var(--dim); font-size: 0.8rem;',
            '}',
            '.rasg-empty__sub {',
            '  display: block; margin-top: 0.375rem;',
            '  font-size: 0.7rem; color: var(--dim);',
            '}',
            '.rasg-unavailable {',
            '  padding: 1.5rem; text-align: center;',
            '  color: var(--danger-lt); font-size: 0.8rem;',
            '}'
        ].join('\n');

        document.head.appendChild(style);
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _injectStyles);
        } else {
            _injectStyles();
        }
    }

    // =========================================================================
    // 2. DEPENDENCY HELPERS
    // =========================================================================

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(v == null ? '' : String(v));
        }
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _icon(name) {
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        return '';
    }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        }
    }

    function _roleState() {
        return typeof window.RoleState !== 'undefined' ? window.RoleState : null;
    }

    function _roleQueries() {
        return typeof window.RoleQueries !== 'undefined' ? window.RoleQueries : null;
    }

    function _characterState() {
        return typeof window.CharacterState !== 'undefined'
            ? window.CharacterState
            : null;
    }

    function _getRole(roleId) {
        var RS = _roleState();
        if (!RS || typeof RS.getRole !== 'function') return null;
        try { return RS.getRole(roleId); }
        catch (e) { return null; }
    }

    function _fullName(character) {
        if (!character) return '';
        return ((character.name || '') + ' ' + (character.surname || '')).trim();
    }

    // =========================================================================
    // 3. DATA COLLECTION
    // =========================================================================
    //
    // One query per fact. No re-derivation.
    //
    //   holderCount         → getCharactersWithRole(roleId).length
    //                         (raw projections from the character state)
    //   detailsCount        → getCharactersWithRoleDetails(roleId).length
    //                         (detail entries; may differ from raw if a
    //                          holder's profession record could not be
    //                          resolved, which is rare but possible)
    //   eligibleCount       → getEligibleCharactersForRole(roleId, {}).length
    //                         (all filters empty — the "could legally
    //                          hold it right now" set)
    //   sampleHolders       → first 5 detail entries, sorted by skill
    //                         (the query already returns skill-desc)

    function _collectPreview(roleId) {
        var RQ = _roleQueries();
        if (!RQ) {
            return {
                ok: false,
                reason: 'RoleQueries is not available.'
            };
        }

        if (typeof RQ.getEligibleCharactersForRole !== 'function') {
            return {
                ok: false,
                reason: 'RoleQueries.getEligibleCharactersForRole is not available.'
            };
        }

        var holdersRaw;
        try {
            holdersRaw = (typeof RQ.getCharactersWithRole === 'function')
                ? (RQ.getCharactersWithRole(roleId) || [])
                : [];
        } catch (e) {
            holdersRaw = [];
        }

        var holdersDetail;
        try {
            holdersDetail = (typeof RQ.getCharactersWithRoleDetails === 'function')
                ? (RQ.getCharactersWithRoleDetails(roleId) || [])
                : [];
        } catch (e) {
            holdersDetail = [];
        }

        var eligible;
        try {
            eligible = RQ.getEligibleCharactersForRole(roleId, {
                search: '',
                gender: 'all',
                locationId: 'all',
                getLocation: function (c) {
                    // This tab does not filter by location. The query's
                    // location option is a no-op when locationId is
                    // 'all'. Passing a resolver here satisfies the
                    // signature without affecting the result.
                    return null;
                }
            });
        } catch (e) {
            return {
                ok: false,
                reason: (e && e.message)
                    ? e.message
                    : 'getEligibleCharactersForRole threw.'
            };
        }

        if (!Array.isArray(eligible)) eligible = [];

        var sampleHolders = holdersDetail.slice(0, 5);
        var primaryCount = 0;
        for (var i = 0; i < holdersDetail.length; i++) {
            if (holdersDetail[i] && holdersDetail[i].isPrimary === true) {
                primaryCount++;
            }
        }

        return {
            ok: true,
            holderCount: holdersRaw.length,
            detailsCount: holdersDetail.length,
            eligibleCount: eligible.length,
            primaryCount: primaryCount,
            sampleHolders: sampleHolders
        };
    }

    /**
     * Counts total living characters in the world. Used only to
     * distinguish "no living characters exist" from "no eligible
     * characters" when the eligible count is 0. One pass over
     * CharacterState.getAllCharacters — no per-character query.
     */
    function _countLivingCharacters() {
        var CS = _characterState();
        if (!CS || typeof CS.getAllCharacters !== 'function') return null;
        var all;
        try { all = CS.getAllCharacters(); }
        catch (e) { return null; }
        if (!Array.isArray(all)) return null;
        var living = 0;
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c) continue;
            if (c.isDeceased === true) continue;
            living++;
        }
        return living;
    }

    /**
     * Explains a zero eligible count using only the primitives we
     * already have. Returns a { title, hint } pair — never derived
     * from re-checking the query's filter logic.
     */
    function _explainZeroEligible(role, preview) {
        var gender = (role && role.genderRestriction) || 'both';
        var livingTotal = _countLivingCharacters();

        // "The world has no living characters" is the strongest
        // explanation — but only when the character state answered.
        if (livingTotal === 0) {
            return {
                title: 'No living characters exist.',
                hint: 'Create or resurrect a character before assigning this role.'
            };
        }

        // "Gender restriction excludes everyone" — but only when we
        // know the world has living characters. Otherwise the
        // "no living characters" branch above is the right answer.
        if ((gender === 'male' || gender === 'female') && livingTotal !== null) {
            // We do not count males / females separately — that would
            // re-derive the query's check. If the role has a gender
            // restriction and there are living characters of the
            // wrong gender only, the eligible count is 0 for a reason
            // we cannot distinguish from "all eligible already hold
            // it". So the gender hint is a possibility, not a fact.
            return {
                title: 'No eligible characters for this role right now.',
                hint: 'This role is restricted to ' + gender +
                    ' characters. Every living ' + gender +
                    ' character may already hold it, or none may exist yet.'
            };
        }

        // "Everyone eligible already holds it" — the common case when
        // the role has holders and zero eligible.
        if (preview && preview.detailsCount > 0) {
            return {
                title: 'All eligible characters already hold this role.',
                hint: 'Every character who could legally hold it ' +
                    'currently does. New holders will appear as new ' +
                    'characters are created.'
            };
        }

        // Fallback: no holders, no eligible, no obvious cause. This
        // is unlikely — it means the query returned 0 for a role with
        // no gender restriction and no current holders and no living
        // characters. Saying so honestly is better than guessing.
        return {
            title: 'No eligible characters for this role right now.',
            hint: 'The eligibility query returned 0. If this looks ' +
                'wrong, check the role\'s gender restriction.'
        };
    }

    // =========================================================================
    // 4. RENDER
    // =========================================================================

    function renderAssignmentsTab(container, role, options) {
        if (!container) return;
        options = options || {};

        if (!role || typeof role !== 'object' || !role.id) {
            container.innerHTML =
                '<div class="rasg-empty">Select a role to manage its assignments.' +
                '<span class="rasg-empty__sub">' +
                'Pick a role from the sidebar.</span></div>';
            return;
        }

        var preview = _collectPreview(role.id);
        if (!preview.ok) {
            container.innerHTML =
                '<div class="rasg-unavailable">' +
                    _esc(preview.reason) +
                '</div>';
            return;
        }

        var canAssign = preview.eligibleCount > 0;
        var html =
            '<div class="rasg">' +
                _renderHeader(role, preview, canAssign, options) +
                _renderStats(preview) +
                (canAssign
                    ? _renderCallToAction()
                    : _renderExplanation(_explainZeroEligible(role, preview))) +
                _renderHoldersPanel(preview) +
            '</div>';

        container.innerHTML = html;

        _attachHandlers(container, role, options);
    }

    function _renderHeader(role, preview, canAssign, options) {
        var parts = [];
        parts.push(preview.detailsCount + ' holder' +
            (preview.detailsCount === 1 ? '' : 's'));
        if (preview.eligibleCount > 0) {
            parts.push(preview.eligibleCount + ' eligible');
        }

        var singleIcon = _icon('PLUS');
        var bulkIcon = _icon('PERSON');

        var singleBtn =
            '<button type="button" class="rasg-btn rasg-btn--primary"' +
                ' data-action="assign-single"' +
                (canAssign ? '' : ' disabled') +
                ' title="' +
                    (canAssign
                        ? 'Assign this role to a character'
                        : 'No eligible characters') +
                '">' +
                (singleIcon ? singleIcon : '') + ' Assign Single' +
            '</button>';

        var bulkBtn =
            '<button type="button" class="rasg-btn"' +
                ' data-action="assign-bulk"' +
                (canAssign ? '' : ' disabled') +
                ' title="' +
                    (canAssign
                        ? 'Assign this role to many characters at once'
                        : 'No eligible characters') +
                '">' +
                (bulkIcon ? bulkIcon : '') + ' Bulk Assign' +
            '</button>';

        return (
            '<div class="rasg__header">' +
                '<div>' +
                    '<div class="rasg__title">Assignments</div>' +
                    '<div class="rasg__subtitle">' +
                        '<span>' + _esc(role.name) + '</span>' +
                        '<span>·</span>' +
                        '<span>' + _esc(parts.join(' · ')) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="rasg__header-actions">' +
                    singleBtn + bulkBtn +
                '</div>' +
            '</div>'
        );
    }

    function _renderStats(preview) {
        return (
            '<div class="rasg__stats">' +
                _stat('Holders', preview.detailsCount, '') +
                _stat('Eligible', preview.eligibleCount,
                    preview.eligibleCount > 0 ? 'accent' : 'warn') +
                _stat('Primary', preview.primaryCount, '') +
            '</div>'
        );
    }

    function _stat(label, value, tone) {
        var cls = 'rasg-stat__value';
        if (tone === 'accent') cls += ' rasg-stat__value--accent';
        else if (tone === 'warn') cls += ' rasg-stat__value--warn';
        return (
            '<div class="rasg-stat">' +
                '<div class="' + cls + '">' + _esc(String(value)) + '</div>' +
                '<div class="rasg-stat__label">' + _esc(label) + '</div>' +
            '</div>'
        );
    }

    function _renderCallToAction() {
        return (
            '<div class="rasg-panel">' +
                '<div class="rasg-panel__header">' +
                    '<span class="rasg-panel__title">Ready to assign</span>' +
                '</div>' +
                '<div class="rasg-panel__note">' +
                    'Use "Assign Single" to pick one character, or ' +
                    '"Bulk Assign" to select several at once. Both ' +
                    'open a filtered character picker where you can ' +
                    'choose the starting skill level and add notes.' +
                '</div>' +
            '</div>'
        );
    }

    function _renderExplanation(explanation) {
        return (
            '<div class="rasg-warn">' +
                '<strong>' + _esc(explanation.title) + '</strong>' +
                '<div style="margin-top:0.25rem;">' +
                    _esc(explanation.hint) +
                '</div>' +
            '</div>'
        );
    }

    function _renderHoldersPanel(preview) {
        var body;
        if (preview.detailsCount === 0) {
            body = '<div class="rasg-empty">No holders yet.</div>';
        } else if (preview.sampleHolders.length === 0) {
            // Edge: detailsCount > 0 but sample came back empty. This
            // can happen if getCharactersWithRole and
            // getCharactersWithRoleDetails disagree, which they
            // occasionally do (see _collectPreview). Show the raw
            // count so the user is not misled.
            body =
                '<div class="rasg-empty">' +
                    preview.detailsCount + ' holder(s) recorded, but no ' +
                    'detail entries resolved. This usually means the ' +
                    'detail query could not resolve every profession ' +
                    'record. Open the Characters tab for the full list.' +
                '</div>';
        } else {
            var rows = '';
            for (var i = 0; i < preview.sampleHolders.length; i++) {
                var e = preview.sampleHolders[i];
                if (!e || !e.character) continue;
                var skillText = (typeof e.skillLevel === 'number')
                    ? String(e.skillLevel)
                    : '';
                var tierText = e.tierName ? ' · ' + e.tierName : '';
                rows +=
                    '<div class="rasg-sample__row">' +
                        '<span class="rasg-sample__name">' +
                            _esc(_fullName(e.character)) +
                        '</span>' +
                        '<span class="rasg-sample__skill">' +
                            _esc(skillText + tierText) +
                        '</span>' +
                    '</div>';
            }
            body = '<div class="rasg-sample">' + rows + '</div>';
            if (preview.detailsCount > preview.sampleHolders.length) {
                body += '<div class="rasg-sample__more">... and ' +
                    (preview.detailsCount - preview.sampleHolders.length) +
                    ' more</div>';
            }
        }

        return (
            '<div class="rasg-panel">' +
                '<div class="rasg-panel__header">' +
                    '<span class="rasg-panel__title">Current holders (' +
                        preview.detailsCount + ')</span>' +
                '</div>' +
                body +
            '</div>'
        );
    }

    // =========================================================================
    // 5. EVENT WIRING
    // =========================================================================

    function _attachHandlers(container, role, options) {
        var header = container.querySelector('.rasg__header');
        if (!header) return;

        header.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn || btn.disabled) return;

            var action = btn.getAttribute('data-action');
            if (!action) return;

            e.preventDefault();

            if (action === 'assign-single') {
                _openAssignSingle(role, options);
                return;
            }
            if (action === 'assign-bulk') {
                _openAssignBulk(role, options);
                return;
            }
        });
    }

    // =========================================================================
    // 6. MODAL DELEGATION (write path — the ONLY place this tab touches
    //    a command-carrying module)
    // =========================================================================

    function _openAssignSingle(role, options) {
        if (typeof window.openAssignRoleModal !== 'function') {
            _toast(
                'Assign Role modal is not available. Load modals-roles.js.',
                'error'
            );
            return;
        }
        // The modal owns the form, the eligibility filter bar,
        // RCMD.assignRoleToCharacter, RCMD.persist, and the toast.
        // onSuccess fires AFTER persist; the tab only re-renders.
        window.openAssignRoleModal(role.id, function () {
            _refreshAfterMutation(role, options);
        });
    }

    function _openAssignBulk(role, options) {
        if (typeof window.openBulkAssignRoleModal !== 'function') {
            _toast(
                'Bulk Assign Role modal is not available. Load modals-roles.js.',
                'error'
            );
            return;
        }
        // The modal owns the form, the eligibility filter bar, the
        // bulk command, the bulk result shape read (assignedCount /
        // failedCount), RCMD.persist, and the toast.
        window.openBulkAssignRoleModal(role.id, function () {
            _refreshAfterMutation(role, options);
        });
    }

    // =========================================================================
    // 7. POST-MUTATION REFRESH
    // =========================================================================

    function _refreshAfterMutation(role, options) {
        if (typeof window.renderRoleList === 'function') {
            try { window.renderRoleList(); }
            catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'role-assignments-tab: renderRoleList threw ' +
                        'after mutation', e
                    );
                }
            }
        }

        if (options && typeof options.onRerender === 'function') {
            options.onRerender();
            return;
        }
        var fresh = _getRole(role.id);
        if (fresh) {
            var container = document.querySelector('#tab-assignments');
            if (container) renderAssignmentsTab(container, fresh, options);
        }
    }

    // =========================================================================
    // 8. TABMANAGER ADAPTER + REGISTRATION
    // =========================================================================

    function renderAdapter(container, context) {
        var role = (context && context.role) ? context.role : null;
        var options = {};
        if (context && typeof context === 'object'
            && typeof context.onRerender === 'function') {
            options.onRerender = context.onRerender;
        }
        renderAssignmentsTab(container, role, options);
    }

    if (typeof window.TabManager !== 'undefined' && window.TabManager) {
        window.TabManager.register('role', 'assignments', renderAdapter);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'role-assignments-tab.js: TabManager is not loaded; the ' +
            'assignments tab was not registered. ' +
            'Load js/core/tab-manager.js first.'
        );
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.RoleAssignmentsTab = {
        id: 'assignments',
        render: renderAssignmentsTab,
        renderAdapter: renderAdapter
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RoleAssignmentsTab: window.RoleAssignmentsTab };
    }
})();
