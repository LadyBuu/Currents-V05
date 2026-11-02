/**
 * =============================================================================
 * STILL WATERS - DEATH MODALS (js/character/modals-death.js)
 * =============================================================================
 *
 * LOCATION: js/character/modals-death.js
 *
 * Death, murder, and execution modals.
 *
 * SCOPE:
 *   - openDeathModal(characterId, onSuccess)
 *       General death. Causes are ordinary. Childbed fever is offered
 *       only when the character is female and inside the fertile
 *       window; choosing it routes to openPregnancyAttemptModal
 *       rather than recording the death directly.
 *   - openMurderModal(victimId, onSuccess)
 *   - openExecutionModal(condemnedId, onSuccess)
 *
 * CHILDBED FEVER ROUTING:
 *   The pregnancy attempt modal (modals-children-birth.js) owns the
 *   full childbirth transaction: conception, complication, miscarriage,
 *   stillbirth, live birth, and maternal death. The death modal only
 *   collects the intent and the father, then hands off.
 *
 *   Concretely:
 *     1. User selects "Childbed Fever" and confirms the death modal.
 *     2. onConfirm returns false (modal stays open) and calls
 *        _routeToPregnancyAttempt, which opens the character selector
 *        to pick a father (optional).
 *     3. On father selection, the death modal is closed programmatically
 *        and openPregnancyAttemptModal is opened with deathFlow: true
 *        and defaultMaternalDeath: true. The pregnancy attempt modal
 *        then owns the transaction: it records the birth and, when
 *        maternal death is true, calls CharacterLifecycle.killCharacter
 *        with cause childbed_fever.
 *     4. onSuccess is wired to the pregnancy attempt modal's onSuccess,
 *        so the death-modal caller hears the outcome when the
 *        transaction completes.
 *     5. If the user CANCELS the pregnancy attempt modal, the death
 *        modal's caller is notified via onSuccess(null) — no death was
 *        recorded, and no character is left in a half-state.
 *
 *   The death modal does NOT record a childbed-fever death itself.
 *   It only routes. This keeps the maternal-death + birth transaction
 *   atomic in one place.
 *
 * CHILDBED FEVER OUTCOME PATHS:
 *   Once childbed fever is selected and the death modal's "Confirm
 *   Death" button is clicked, TWO and ONLY TWO outcomes are possible:
 *
 *     PATH A (routed and completed):
 *       User selects (or skips) a father, the pregnancy attempt modal
 *       opens, the pregnancy attempt succeeds, and — when maternal
 *       death is on — the character is killed via
 *       CharacterLifecycle.killCharacter.
 *       → onSuccess(outcome) fires on the death-modal caller.
 *
 *     PATH B (cancelled):
 *       User cancels either the father-selector modal (no father
 *       picked, no pregnancy attempt modal opens) OR the pregnancy
 *       attempt modal itself (father picked, pregnancy modal opened,
 *       user then cancels).
 *       → onSuccess is NOT called. If the user then cancels the death
 *         modal itself, the death modal's onCancel fires on the
 *         death-modal caller.
 *
 *   There is no third "silent" outcome. Callers that need a positive
 *   "the character died" signal wire onSuccess; callers that need a
 *   "the flow ended with no death recorded" signal wire onCancel.
 *
 * ROUTING GUARD (routingInProgress):
 *   The childbed-fever path involves three modals in sequence (death
 *   → father selector → pregnancy attempt). A double-click on
 *   "Confirm Death", or a re-click after cancelling the father
 *   selector, would otherwise open a second father selector on top of
 *   the first — leading to a stacked-modal collision.
 *
 *   The routing guard makes "Confirm Death" idempotent for the
 *   duration of a single routing attempt:
 *     - First click: routingInProgress = true, routes.
 *     - Subsequent clicks while routing: return false, do nothing.
 *     - On father-selector cancel: routingInProgress = false.
 *     - On father-selector pick: routingInProgress = true (stays
 *       true; the pregnancy modal is now on top).
 *     - On death-modal close: routingInProgress = false
 *       (via the modal's own onCancel wiring).
 *
 * OUT OF SCOPE:
 *   - Mortality policy           -> mortality-rules.js
 *   - Death transition           -> CharacterCommands.markDeceased via
 *                                   CharacterLifecycle.killCharacter
 *   - Childbirth                 -> modals-children-birth.js
 *   - Presentation CSS           -> stylesheet
 *   - Modal stack                -> modals-core.js
 *
 * CONTRACT:
 *   - UI only. Reads projections, collects input, calls commands.
 *   - Does not save. Does not mutate characters directly. Does not
 *     fall back to any missing dependency.
 *   - Every direct death call goes through
 *     CharacterLifecycle.killCharacter.
 *   - The childbed-fever path never records a death in this module.
 *
 * RANDOMNESS:
 *   _pickRandom chooses random defaults for suggestion inputs (default
 *   death-cause detail, default murder motive, default execution
 *   reason). All such picks route through window.random() from
 *   randomness.js. This module does NOT call Math.random directly;
 *   doing so would be inconsistent with the rest of the character
 *   subsystem, which treats Math.random as forbidden. The dependency
 *   is required at load.
 *
 *   These picks are cosmetic UI defaults, not simulation outcomes.
 *   Determinism therefore does not matter for correctness here — but
 *   consistency does.
 *
 * MODAL CLOSE SEMANTICS (see modals-core.js for the full contract):
 *   - Ordinary death / murder / execution: the user clicks Confirm,
 *     onConfirm runs the killCharacter call, and the modal closes.
 *   - Childbed fever: the user clicks Confirm, onConfirm routes to the
 *     pregnancy modal and returns false (death modal stays open until
 *     routing is resolved).
 *   - The death modal is closed programmatically when routing hands
 *     off. onCancel does not fire on programmatic close.
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js:        escapeHtml
 *   - icons.js:             Icons
 *   - modals-core.js:       openModal, closeTopModal
 *   - time.js:              getCurrentYear, isValidYear, calculateAge
 *   - randomness.js:        random
 *   - CharacterQueries:     getCharacterSummary
 *   - MortalityRules:       DEATH_CAUSE, isValidDeathCause
 *   - CharacterLifecycle:   killCharacter
 *
 * DEPENDENCIES (OPTIONAL, required only for the childbed-fever route):
 *   - selectors/modals-char-selector.js (openCharacterSelector)
 *   - modals-children-birth.js          (openPregnancyAttemptModal)
 *   - ChildrenRules                     (FERTILITY_CONSTANTS)
 *
 * ICON POLICY: SVG from icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Added routingInProgress guard to openDeathModal. Covers the
 *       childbed-fever double-click hazard: two rapid clicks on
 *       "Confirm Death" would previously open two father selectors
 *       stacked on top of each other. The guard makes the second
 *       click a no-op while routing is in progress.
 *     - Reset points:
 *         - father-selector onCancel: routingInProgress = false
 *         - father-selector onSelect (after death-modal.close()):
 *           routingInProgress stays true
 *         - death-modal onCancel: routingInProgress = false
 *       See CHILDBED FEVER OUTCOME PATHS and ROUTING GUARD in the
 *       module header.
 *     - Header CHILDBED FEVER OUTCOME PATHS and ROUTING GUARD sections
 *       added.
 *     - No other behavioural change. Death, murder, and execution
 *       paths are unchanged.
 *   Previous revisions:
 *     - Childbed-fever routing extracted to _routeToPregnancyAttempt.
 *     - _pickRandom introduced; Math.random no longer used anywhere.
 *     - Age/year sync wired via _wireAgeYearSync.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        var required = [
            'escapeHtml',
            'openModal',
            'closeTopModal',
            'getCurrentYear',
            'isValidYear',
            'calculateAge',
            'random'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'modals-death.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
        if (typeof window.Icons === 'undefined') {
            throw new Error('modals-death.js: icons.js must load first.');
        }
        if (typeof window.CharacterQueries === 'undefined') {
            throw new Error('modals-death.js: character-queries.js must load first.');
        }
        if (typeof window.MortalityRules === 'undefined') {
            throw new Error('modals-death.js: mortality-rules.js must load first.');
        }
        if (typeof window.CharacterLifecycle === 'undefined') {
            throw new Error('modals-death.js: character-lifecycle.js must load first.');
        }
    }

    _requireDependencies();

    var MR = window.MortalityRules;
    var CL = window.CharacterLifecycle;
    var CQ = window.CharacterQueries;

    // =========================================================================
    // 1. VOCABULARY (UI presentation only)
    // =========================================================================
    //
    // These catalogues are UI suggestions. They do not define the domain
    // vocabulary; they offer free-text detail options that the user may
    // pick or replace. The stable cause id (MR.DEATH_CAUSE.*) is what
    // gets written to the record; the suggestion strings only populate
    // the deathCauseDetail field.

    var DEATH_CAUSE_CATEGORIES = [
        {
            key: MR.DEATH_CAUSE.NATURAL,
            label: 'Natural Causes',
            suggestions: [
                'Old age', 'Natural causes', 'Peaceful death',
                'Wasting illness', 'Organ failure', 'Heart failure',
                'Stroke', 'Senility'
            ]
        },
        {
            key: MR.DEATH_CAUSE.DISEASE,
            label: 'Disease',
            suggestions: [
                'Fever', 'Consumption', 'Pneumonia', 'Infection', 'Plague',
                'Dysentery', 'Malaria', 'Smallpox', 'Measles', 'Cholera',
                'Typhoid', 'Typhus', 'Influenza', 'Gout', 'Cancer'
            ]
        },
        {
            key: MR.DEATH_CAUSE.ACCIDENT,
            label: 'Accident or Misadventure',
            suggestions: [
                'Drowning', 'Fell from height', 'Hunting accident', 'Fire',
                'Crushed', 'Cart accident', 'Building collapse',
                'Tools accident', 'Fell down stairs', 'Slipped on ice',
                'Lightning strike', 'Boating accident', 'Animal attack',
                'Killed in battle', 'War wound', 'Siege'
            ]
        },
        {
            key: MR.DEATH_CAUSE.UNKNOWN,
            label: 'Unknown',
            suggestions: ['Unknown', 'Cause not recorded']
        }
    ];

    var CHILDBED_FEVER_CATEGORY = {
        key: MR.DEATH_CAUSE.CHILDBED_FEVER,
        label: 'Childbed Fever',
        suggestions: [
            'Childbed fever', 'Childbirth complications', 'Hemorrhage',
            'Puerperal fever', 'Birth trauma', 'Eclampsia',
            'Placental abruption'
        ]
    };

    var MURDER_MOTIVE_SUGGESTIONS = [
        'Jealousy', 'Revenge', 'Personal vendetta', 'Crime of passion',
        'Honor killing', 'Blood feud', 'Love triangle', 'Family dispute',
        'Betrayal', 'Insult',
        'Political rivalry', 'Treason', 'Succession dispute',
        'Coup attempt', 'Court intrigue', 'Religious conflict',
        'Assassination', 'Power struggle',
        'Robbery', 'Contract killing', 'Land dispute',
        'Inheritance dispute', 'Debt collection',
        'Mistaken identity', 'Self-defense gone wrong',
        'Madness', 'Fear of exposure', 'Unknown motive'
    ];

    var MURDER_METHODS = [
        { id: 'stabbing', label: 'Stabbing' },
        { id: 'poison', label: 'Poison' },
        { id: 'strangulation', label: 'Strangulation' },
        { id: 'bludgeoning', label: 'Bludgeoning' },
        { id: 'shooting', label: 'Shooting' },
        { id: 'drowning', label: 'Drowning' },
        { id: 'burning', label: 'Burning' },
        { id: 'falling', label: 'Pushed from height' },
        { id: 'exsanguination', label: 'Exsanguination' },
        { id: 'starvation', label: 'Starvation' }
    ];

    var EXECUTION_REASON_SUGGESTIONS = [
        'Murder of a noble', 'Murder of a child', 'Multiple murders',
        'Brutal murder', 'Premeditated murder', 'Assassination',
        'Murder of a royal',
        'Treason against the Crown', 'Regicide', 'Rebellion',
        'Revolutionary activity', 'Coup attempt', 'Conspiracy',
        'Espionage', 'Sedition',
        'Desertion', 'Cowardice in battle', 'Insubordination', 'Mutiny',
        'Blasphemy', 'Sacrilege', 'Witchcraft', 'Heresy', 'Apostasy',
        'Adultery', 'Incest', 'Breaking sacred taboos', 'Dueling',
        'Highway robbery', 'Counterfeiting', 'Arson', 'Piracy',
        'Smuggling', 'Forgery'
    ];

    var EXECUTION_METHODS = [
        { id: 'beheading', label: 'Beheading' },
        { id: 'hanging', label: 'Hanging' },
        { id: 'burning', label: 'Burning at the Stake' },
        { id: 'guillotine', label: 'Guillotine' },
        { id: 'firing_squad', label: 'Firing Squad' },
        { id: 'drowning', label: 'Drowning' },
        { id: 'stoning', label: 'Stoning' },
        { id: 'breaking_wheel', label: 'Breaking Wheel' },
        { id: 'quartering', label: 'Drawing and Quartering' },
        { id: 'crucifixion', label: 'Crucifixion' },
        { id: 'garrote', label: 'Garrote' },
        { id: 'boiling', label: 'Boiling Alive' }
    ];

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _esc(v) {
        return window.escapeHtml(v);
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _icon(name) {
        return window.Icons[name] || '';
    }

    /**
     * Picks a random element from an array using the shared RNG stream.
     *
     * Does NOT call Math.random. See the RANDOMNESS section in the file
     * header for why: consistency with the rest of the character
     * subsystem, even though these picks are cosmetic UI defaults.
     */
    function _pickRandom(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return null;
        return arr[Math.floor(window.random() * arr.length)];
    }

    function _readSubject(characterId) {
        if (!_hasId(characterId)) return null;
        var summary = CQ.getCharacterSummary(characterId);
        if (!summary) return null;
        if (summary.isDeceased === true) return null;
        return summary;
    }

    /**
     * True if the character is female and inside the fertile window
     * according to ChildrenRules. Returns false if ChildrenRules is
     * not loaded, because the childbed-fever route requires it.
     */
    function _canRouteToChildbed(summary) {
        if (!summary) return false;
        if (summary.gender !== 'female') return false;
        if (summary.isDeceased === true) return false;
        if (typeof summary.birthYear !== 'number') return false;
        if (typeof window.ChildrenRules === 'undefined') return false;

        var c = window.ChildrenRules.FERTILITY_CONSTANTS || {};
        var minAge = typeof c.MIN_FERTILE_AGE === 'number' ? c.MIN_FERTILE_AGE : 14;
        var maxAge = typeof c.MAX_FERTILE_AGE === 'number' ? c.MAX_FERTILE_AGE : 47;
        var year = window.getCurrentYear();
        var age = year - summary.birthYear;
        return age >= minAge && age <= maxAge;
    }

    function _renderSuggestions(container, targetInput, suggestions) {
        if (!container || !targetInput) return;

        if (!Array.isArray(suggestions) || suggestions.length === 0) {
            container.innerHTML = '';
            return;
        }

        var html = '';
        for (var i = 0; i < suggestions.length; i++) {
            var s = suggestions[i];
            html += '<button type="button" class="suggestion-btn" '
                 + 'data-suggestion="' + _esc(s) + '" '
                 + 'style="padding: 4px 8px; font-size: 0.6rem; '
                 + 'background: var(--bg3); border: 1px solid var(--border); '
                 + 'border-radius: 4px; cursor: pointer;">'
                 + _esc(s)
                 + '</button>';
        }
        container.innerHTML = html;

        var buttons = container.querySelectorAll('.suggestion-btn');
        for (var j = 0; j < buttons.length; j++) {
            buttons[j].addEventListener('click', function () {
                targetInput.value = this.getAttribute('data-suggestion') || '';
            });
        }
    }

    function _wireAgeYearSync(modalElement, ageInputId, yearInputId, birthYear) {
        if (typeof birthYear !== 'number') return;
        var ageEl = modalElement.querySelector('#' + ageInputId);
        var yearEl = modalElement.querySelector('#' + yearInputId);
        if (!ageEl || !yearEl) return;

        var syncing = false;

        ageEl.addEventListener('input', function () {
            if (syncing) return;
            syncing = true;
            var age = parseInt(ageEl.value, 10);
            if (Number.isInteger(age) && age >= 0) {
                yearEl.value = String(birthYear + age);
            }
            syncing = false;
        });

        yearEl.addEventListener('input', function () {
            if (syncing) return;
            syncing = true;
            var year = parseInt(yearEl.value, 10);
            if (Number.isInteger(year)) {
                var a = year - birthYear;
                if (a >= 0) ageEl.value = String(a);
            }
            syncing = false;
        });
    }

    // =========================================================================
    // 3. CHILDBED FEVER ROUTING
    // =========================================================================
    //
    // See CHILDBED FEVER OUTCOME PATHS and ROUTING GUARD in the module
    // header. The routing guard is owned by openDeathModal (per-call);
    // _routeToPregnancyAttempt only fires the sequence and respects the
    // guard's state through its reset callbacks.

    /**
     * Collects a father (optional), then hands off to the pregnancy
     * attempt modal.
     *
     * The death modal is CLOSED PROGRAMMATICALLY once routing begins
     * (which does not fire the death modal's onCancel — see
     * modals-core.js).
     *
     * The caller's onSuccess is wired to the pregnancy modal's
     * onSuccess. If the user cancels the father selector or the
     * pregnancy modal, onSuccess does not fire; the death modal's own
     * onCancel is the caller's signal that the flow ended without a
     * recorded death.
     *
     * @param {Object} summary         death-modal subject projection
     * @param {number} deathYear       the year to pre-fill in the
     *                                 pregnancy attempt modal
     * @param {Function} onSuccess     the death modal's caller callback
     * @param {Object} deathModal      the openModal return handle for
     *                                 the death modal
     * @param {Object} guard           { isRouting: () => bool,
     *                                   reset: () => void,
     *                                   hold: () => void }
     *                                 routing guard shared with
     *                                 openDeathModal's onConfirm
     */
    function _routeToPregnancyAttempt(summary, deathYear, onSuccess, deathModal, guard) {
        if (typeof window.openPregnancyAttemptModal !== 'function') {
            guard.reset();
            throw new Error(
                'modals-death.js: pregnancy attempt modal is not loaded ' +
                '(openPregnancyAttemptModal).'
            );
        }
        if (typeof window.openCharacterSelector !== 'function') {
            guard.reset();
            throw new Error(
                'modals-death.js: character selector is not loaded ' +
                '(openCharacterSelector).'
            );
        }

        var selectorCancelled = false;

        try {
            window.openCharacterSelector({
                title: 'Select Father (optional)',
                filters: {
                    gender: 'male',
                    status: 'living',
                    showDeceased: false
                },
                excludeIds: [summary.id],
                onCancel: function () {
                    // Father selector cancelled. No father picked, no
                    // pregnancy modal opened. Reset the guard so the
                    // user can retry "Confirm Death" if they change
                    // their mind, or cancel the death modal entirely.
                    selectorCancelled = true;
                    guard.reset();
                },
                onSelect: function (father) {
                    if (selectorCancelled) return; // defensive; cancel already fired
                    if (deathModal && typeof deathModal.close === 'function') {
                        deathModal.close();
                    }

                    var fatherId = father && _hasId(father.id) ? father.id : null;

                    var modalResult = window.openPregnancyAttemptModal(
                        summary.id,
                        fatherId,
                        {
                            year: deathYear,
                            deathFlow: true,
                            defaultOutcome: 'live_birth',
                            defaultMaternalDeath: true
                        },
                        function (outcome) {
                            // Pregnancy attempt succeeded. Death is
                            // recorded by the pregnancy modal (via
                            // CharacterLifecycle). Reset the guard
                            // — the flow is done.
                            guard.reset();
                            if (typeof onSuccess === 'function') {
                                onSuccess(outcome);
                            }
                        }
                    );

                    if (!modalResult || modalResult.success !== true) {
                        guard.reset();
                        throw new Error(modalResult && modalResult.reason
                            ? modalResult.reason
                            : 'Failed to open pregnancy attempt modal.');
                    }

                    // Guard stays held (isRouting === true) while the
                    // pregnancy modal is on top. If the user cancels
                    // the pregnancy modal, no callback here fires; the
                    // death modal's own onCancel will reset the guard
                    // when the user closes it.
                }
            });
        } catch (e) {
            guard.reset();
            throw e;
        }
    }

    // =========================================================================
    // 4. DEATH MODAL
    // =========================================================================

    function openDeathModal(characterId, onSuccess) {
        var summary = _readSubject(characterId);
        if (!summary) {
            return { success: false, reason: 'Character not found or already deceased.' };
        }

        var currentYear = window.getCurrentYear();
        var age = summary.age === null ? 0 : summary.age;
        var canChildbed = _canRouteToChildbed(summary);

        // Routing guard for the childbed-fever path. See ROUTING GUARD
        // in the module header.
        var _routingInProgress = false;
        var guard = {
            isRouting: function () { return _routingInProgress === true; },
            hold: function () { _routingInProgress = true; },
            reset: function () { _routingInProgress = false; }
        };

        var categoryOptions = '';
        for (var i = 0; i < DEATH_CAUSE_CATEGORIES.length; i++) {
            var cat = DEATH_CAUSE_CATEGORIES[i];
            categoryOptions += '<option value="' + _esc(cat.key) + '">'
                             + _esc(cat.label)
                             + '</option>';
        }
        if (canChildbed) {
            categoryOptions += '<option value="' + _esc(CHILDBED_FEVER_CATEGORY.key) + '">'
                             + _esc(CHILDBED_FEVER_CATEGORY.label)
                             + '</option>';
        }

        var firstCategory = DEATH_CAUSE_CATEGORIES[0];
        var randomDetail = _pickRandom(firstCategory.suggestions) || '';

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>' + _esc(summary.fullName || summary.name || 'Unnamed') + '</strong>'
                 + '<br>' + _esc(age) + ' years &middot; '
                 + _esc(summary.gender || 'Unknown')
                 + (summary.locationId ? ' &middot; ' + _esc(summary.locationId) : '')
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="death-category">Cause Category</label>'
                 + '<select id="death-category" class="character-modal__form-input">'
                 + categoryOptions
                 + '</select>'
                 + '</div>';

        content += '<div id="death-detail-section">';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="death-detail">Specific Cause</label>'
                 + '<input type="text" id="death-detail" class="character-modal__form-input" '
                 + 'value="' + _esc(randomDetail) + '" autocomplete="off">'
                 + '<div id="death-detail-suggestions" '
                 + 'style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>'
                 + '</div>';

        content += '<div class="character-modal__grid">';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="death-age">Age at Death</label>'
                 + '<input type="number" id="death-age" class="character-modal__form-input" '
                 + 'value="' + _esc(age) + '" min="0" max="150">'
                 + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="death-year">Year of Death</label>'
                 + '<input type="number" id="death-year" class="character-modal__form-input" '
                 + 'value="' + _esc(currentYear) + '" '
                 + 'min="' + (summary.birthYear !== null ? summary.birthYear : 1) + '" '
                 + 'max="' + (currentYear + 10) + '">'
                 + '</div>';
        content += '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="death-notes">Notes</label>'
                 + '<textarea id="death-notes" class="character-modal__form-input" rows="2"></textarea>'
                 + '</div>';

        content += '</div>';

        content += '<div id="death-childbed-note" style="display:none; '
                 + 'padding:8px; background: rgba(200,112,64,0.15); '
                 + 'border:1px solid var(--warn); border-radius:6px; '
                 + 'font-size:0.65rem;">'
                 + 'Childbed fever is recorded through a pregnancy attempt. '
                 + 'You will be asked to select the father (optional), then '
                 + 'taken to the pregnancy attempt modal. The death will be '
                 + 'recorded as part of that transaction. If you cancel the '
                 + 'pregnancy attempt, no death is recorded.'
                 + '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Character Death: ' + _esc(summary.name || ''),
            contentHtml: content,
            confirmText: 'Confirm Death',
            cancelText: 'Cancel',
            onCancel: function () {
                // Death modal cancelled. Whatever the reason (childbed
                // routing in progress, ordinary death form still open,
                // etc.), the routing guard is no longer valid — the
                // whole flow is over.
                guard.reset();
            },
            onOpen: function (modalElement) {
                var categorySelect = modalElement.querySelector('#death-category');
                var detailInput = modalElement.querySelector('#death-detail');
                var detailSection = modalElement.querySelector('#death-detail-section');
                var childbedNote = modalElement.querySelector('#death-childbed-note');
                var suggestionsContainer = modalElement.querySelector('#death-detail-suggestions');

                function isChildbedSelected() {
                    return categorySelect.value === MR.DEATH_CAUSE.CHILDBED_FEVER;
                }

                function refreshSuggestions() {
                    var selectedKey = categorySelect.value;
                    var selectedCat = null;

                    if (selectedKey === MR.DEATH_CAUSE.CHILDBED_FEVER) {
                        selectedCat = CHILDBED_FEVER_CATEGORY;
                    } else {
                        for (var k = 0; k < DEATH_CAUSE_CATEGORIES.length; k++) {
                            if (DEATH_CAUSE_CATEGORIES[k].key === selectedKey) {
                                selectedCat = DEATH_CAUSE_CATEGORIES[k];
                                break;
                            }
                        }
                    }

                    if (isChildbedSelected()) {
                        detailSection.style.display = 'none';
                        childbedNote.style.display = '';
                    } else {
                        detailSection.style.display = '';
                        childbedNote.style.display = 'none';
                        var suggestions = selectedCat ? selectedCat.suggestions : [];
                        _renderSuggestions(suggestionsContainer, detailInput, suggestions);
                        var first = _pickRandom(suggestions);
                        if (first) detailInput.value = first;
                    }
                }

                categorySelect.addEventListener('change', refreshSuggestions);
                refreshSuggestions();

                _wireAgeYearSync(modalElement, 'death-age', 'death-year', summary.birthYear);
            },
            onConfirm: function () {
                var categorySelect = modal.element.querySelector('#death-category');
                var yearInput = modal.element.querySelector('#death-year');
                var cause = categorySelect.value;

                var deathYear = parseInt(yearInput.value, 10);
                if (!Number.isInteger(deathYear) || !window.isValidYear(deathYear)) {
                    throw new Error('Please enter a valid death year.');
                }

                if (cause === MR.DEATH_CAUSE.CHILDBED_FEVER) {
                    // Routing guard: only one routing attempt per
                    // death-modal lifetime. A second click on "Confirm
                    // Death" while a father selector or pregnancy modal
                    // is on top must be a no-op.
                    if (guard.isRouting()) {
                        return false;
                    }
                    guard.hold();

                    // Route to the pregnancy attempt modal. We return
                    // false so the death modal stays open until routing
                    // completes: the father selector is a separate
                    // modal on top of it, and closing the death modal
                    // before the user has finished selecting a father
                    // would be jarring. When the father is selected (or
                    // skipped), _routeToPregnancyAttempt closes the
                    // death modal programmatically (which does NOT
                    // fire onCancel). See CHILDBED FEVER OUTCOME PATHS
                    // in the module header.
                    _routeToPregnancyAttempt(summary, deathYear, onSuccess, modal, guard);
                    return false;
                }

                var detailInput = modal.element.querySelector('#death-detail');
                var notesInput = modal.element.querySelector('#death-notes');

                if (!MR.isValidDeathCause(cause)) {
                    throw new Error('Invalid death cause.');
                }

                var detail = detailInput.value.trim();
                var deathData = {
                    deathYear: deathYear,
                    deathCause: cause,
                    deathCauseDetail: detail,
                    deathNotes: notesInput.value || ''
                };

                var result = CL.killCharacter(characterId, deathData);
                if (!result || result.success !== true) {
                    throw new Error(result && result.reason
                        ? result.reason
                        : 'Failed to record death.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(summary.id);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 5. MURDER MODAL
    // =========================================================================

    function openMurderModal(victimId, onSuccess) {
        var victim = _readSubject(victimId);
        if (!victim) {
            return { success: false, reason: 'Victim not found or already deceased.' };
        }

        var currentYear = window.getCurrentYear();
        var victimAge = victim.age === null ? 0 : victim.age;

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>Victim: ' + _esc(victim.fullName || victim.name || 'Unnamed') + '</strong>'
                 + '<br>' + _esc(victimAge) + ' years'
                 + (victim.locationId ? ' &middot; ' + _esc(victim.locationId) : '')
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="murder-killer">Killer</label>'
                 + '<button type="button" class="btn" id="murder-select-killer">'
                 + 'Select Killer</button>'
                 + '<span class="character-modal__parent-name" id="murder-killer-name">None</span>'
                 + '</div>';

        content += '<div class="character-modal__grid">';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="murder-age">Age at Murder</label>'
                 + '<input type="number" id="murder-age" class="character-modal__form-input" '
                 + 'value="' + _esc(victimAge) + '" min="0" max="150">'
                 + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="murder-year">Year of Murder</label>'
                 + '<input type="number" id="murder-year" class="character-modal__form-input" '
                 + 'value="' + _esc(currentYear) + '" '
                 + 'min="' + (victim.birthYear !== null ? victim.birthYear : 1) + '" '
                 + 'max="' + (currentYear + 10) + '">'
                 + '</div>';
        content += '</div>';

        var methodOptions = '';
        for (var m = 0; m < MURDER_METHODS.length; m++) {
            methodOptions += '<option value="' + _esc(MURDER_METHODS[m].id) + '">'
                           + _esc(MURDER_METHODS[m].label)
                           + '</option>';
        }
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="murder-method">Method</label>'
                 + '<select id="murder-method" class="character-modal__form-input">'
                 + methodOptions
                 + '</select>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="murder-motive">Motive</label>'
                 + '<input type="text" id="murder-motive" class="character-modal__form-input" '
                 + 'value="' + _esc(_pickRandom(MURDER_MOTIVE_SUGGESTIONS) || '') + '" '
                 + 'autocomplete="off">'
                 + '<div id="murder-motive-suggestions" '
                 + 'style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="murder-notes">Notes</label>'
                 + '<textarea id="murder-notes" class="character-modal__form-input" rows="2"></textarea>'
                 + '</div>';

        content += '</div>';

        var selectedKillerId = null;
        var selectedKillerName = '';

        var modal = window.openModal({
            titleHtml: 'Murder: ' + _esc(victim.name || ''),
            contentHtml: content,
            confirmText: 'Commit Murder',
            cancelText: 'Cancel',
            onOpen: function (modalElement) {
                var motiveContainer = modalElement.querySelector('#murder-motive-suggestions');
                var motiveInput = modalElement.querySelector('#murder-motive');
                _renderSuggestions(motiveContainer, motiveInput, MURDER_MOTIVE_SUGGESTIONS);

                var selectBtn = modalElement.querySelector('#murder-select-killer');
                selectBtn.addEventListener('click', function () {
                    if (typeof window.openCharacterSelector !== 'function') {
                        throw new Error('modals-death.js: character selector not available.');
                    }
                    window.openCharacterSelector({
                        title: 'Select Killer',
                        filters: {
                            status: 'living',
                            showDeceased: false
                        },
                        excludeIds: [victim.id],
                        onSelect: function (selected) {
                            if (!selected || !_hasId(selected.id)) return;
                            selectedKillerId = selected.id;
                            selectedKillerName = selected.name || selected.id;
                            var el = modalElement.querySelector('#murder-killer-name');
                            if (el) el.textContent = selectedKillerName;
                        }
                    });
                });

                _wireAgeYearSync(modalElement, 'murder-age', 'murder-year', victim.birthYear);
            },
            onConfirm: function () {
                if (!_hasId(selectedKillerId)) {
                    throw new Error('Please select a killer.');
                }

                var yearInput = modal.element.querySelector('#murder-year');
                var methodSelect = modal.element.querySelector('#murder-method');
                var motiveInput = modal.element.querySelector('#murder-motive');
                var notesInput = modal.element.querySelector('#murder-notes');

                var deathYear = parseInt(yearInput.value, 10);
                if (!Number.isInteger(deathYear) || !window.isValidYear(deathYear)) {
                    throw new Error('Please enter a valid murder year.');
                }

                var method = methodSelect.value;
                var motive = motiveInput.value.trim();

                var deathData = {
                    deathYear: deathYear,
                    deathCause: MR.DEATH_CAUSE.MURDER,
                    deathCauseDetail: method,
                    deathNotes: notesInput.value || '',
                    isMurder: true,
                    killerId: selectedKillerId,
                    murderMotive: motive,
                    murderMethod: method
                };

                var result = CL.killCharacter(victimId, deathData);
                if (!result || result.success !== true) {
                    throw new Error(result && result.reason
                        ? result.reason
                        : 'Failed to record murder.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(victim.id);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 6. EXECUTION MODAL
    // =========================================================================

    function openExecutionModal(condemnedId, onSuccess) {
        var condemned = _readSubject(condemnedId);
        if (!condemned) {
            return { success: false, reason: 'Condemned not found or already deceased.' };
        }

        var currentYear = window.getCurrentYear();
        var condemnedAge = condemned.age === null ? 0 : condemned.age;

        var content = '<div class="character-modal">';

        content += '<div class="character-modal__section">'
                 + '<strong>Condemned: ' + _esc(condemned.fullName || condemned.name || 'Unnamed') + '</strong>'
                 + '<br>' + _esc(condemnedAge) + ' years'
                 + (condemned.locationId ? ' &middot; ' + _esc(condemned.locationId) : '')
                 + '</div>';

        content += '<div class="character-modal__grid">';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="execution-age">Age at Execution</label>'
                 + '<input type="number" id="execution-age" class="character-modal__form-input" '
                 + 'value="' + _esc(condemnedAge) + '" min="0" max="150">'
                 + '</div>';
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="execution-year">Year of Execution</label>'
                 + '<input type="number" id="execution-year" class="character-modal__form-input" '
                 + 'value="' + _esc(currentYear) + '" '
                 + 'min="' + (condemned.birthYear !== null ? condemned.birthYear : 1) + '" '
                 + 'max="' + (currentYear + 10) + '">'
                 + '</div>';
        content += '</div>';

        var methodOptions = '';
        for (var m = 0; m < EXECUTION_METHODS.length; m++) {
            methodOptions += '<option value="' + _esc(EXECUTION_METHODS[m].id) + '">'
                           + _esc(EXECUTION_METHODS[m].label)
                           + '</option>';
        }
        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="execution-method">Method</label>'
                 + '<select id="execution-method" class="character-modal__form-input">'
                 + methodOptions
                 + '</select>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="execution-reason">Reason</label>'
                 + '<input type="text" id="execution-reason" class="character-modal__form-input" '
                 + 'value="' + _esc(_pickRandom(EXECUTION_REASON_SUGGESTIONS) || '') + '" '
                 + 'autocomplete="off">'
                 + '<div id="execution-reason-suggestions" '
                 + 'style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;"></div>'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="execution-location">Location</label>'
                 + '<input type="text" id="execution-location" class="character-modal__form-input" '
                 + 'placeholder="Town square, Castle courtyard..." autocomplete="off">'
                 + '</div>';

        content += '<div class="character-modal__form-field">'
                 + '<label class="character-modal__form-label" for="execution-notes">Notes</label>'
                 + '<textarea id="execution-notes" class="character-modal__form-input" rows="2"></textarea>'
                 + '</div>';

        content += '</div>';

        var modal = window.openModal({
            titleHtml: 'Execute: ' + _esc(condemned.name || ''),
            confirmText: 'Confirm Execution',
            cancelText: 'Grant Mercy',
            contentHtml: content,
            onOpen: function (modalElement) {
                var reasonContainer = modalElement.querySelector('#execution-reason-suggestions');
                var reasonInput = modalElement.querySelector('#execution-reason');
                _renderSuggestions(reasonContainer, reasonInput, EXECUTION_REASON_SUGGESTIONS);
                _wireAgeYearSync(modalElement, 'execution-age', 'execution-year', condemned.birthYear);
            },
            onConfirm: function () {
                var yearInput = modal.element.querySelector('#execution-year');
                var methodSelect = modal.element.querySelector('#execution-method');
                var reasonInput = modal.element.querySelector('#execution-reason');
                var locationInput = modal.element.querySelector('#execution-location');
                var notesInput = modal.element.querySelector('#execution-notes');

                var deathYear = parseInt(yearInput.value, 10);
                if (!Number.isInteger(deathYear) || !window.isValidYear(deathYear)) {
                    throw new Error('Please enter a valid execution year.');
                }

                var reason = reasonInput.value.trim();
                if (!reason) {
                    throw new Error('Please enter a reason for the execution.');
                }

                var deathData = {
                    deathYear: deathYear,
                    deathCause: MR.DEATH_CAUSE.EXECUTION,
                    deathCauseDetail: methodSelect.value,
                    deathNotes: notesInput.value || '',
                    isExecution: true,
                    executionReason: reason,
                    executionMethod: methodSelect.value,
                    executionLocation: locationInput.value.trim()
                };

                var result = CL.killCharacter(condemnedId, deathData);
                if (!result || result.success !== true) {
                    throw new Error(result && result.reason
                        ? result.reason
                        : 'Failed to record execution.');
                }

                if (typeof onSuccess === 'function') {
                    onSuccess(condemned.id);
                }
            }
        });

        return { success: true, modal: modal };
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.openDeathModal = openDeathModal;
    window.openMurderModal = openMurderModal;
    window.openExecutionModal = openExecutionModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openDeathModal: openDeathModal,
            openMurderModal: openMurderModal,
            openExecutionModal: openExecutionModal
        };
    }
})();
