/**
 * =============================================================================
 * STILL WATERS - SELECTOR BASE HELPERS (js/selectors/selector-base.js)
 * =============================================================================
 *
 * LOCATION: js/selectors/selector-base.js
 *
 * PURPOSE
 * -------
 * Shared surface for the character / household / residence selector
 * modals. Provides TWO things:
 *
 *   1. window.SelectorBase       — a base class that individual selectors
 *                                  extend. Handles modal open/close, event
 *                                  listener registration/cleanup, debounce,
 *                                  toast, and the isBloodRelative /
 *                                  isSpouse helpers.
 *
 *   2. window.SelectorHelpers    — a plain-object helper surface (also
 *                                  exposed as window._SelectorBaseHelpers
 *                                  for backward compatibility). Pure
 *                                  filter predicates and display helpers
 *                                  with no state.
 *
 * WHAT THIS MODULE IS NOT
 * -----------------------
 *   - Not the selector modal itself. The modal files
 *     (modals-char-selector.js, modals-household-selector.js) use the
 *     base class and the helper object to build their own filter UI
 *     and match predicates.
 *   - Not domain policy. Family semantics live in family-rules.js.
 *     Relationship semantics live in the relationship domain.
 *   - Not a mutation boundary. Everything here is a read.
 *
 * WINDOW.SELECTORBASE CONTRACT
 * ----------------------------
 *   Subclasses call:
 *       SelectorBase.call(this, options);
 *   and then:
 *       Subclass.prototype = Object.create(SelectorBase.prototype);
 *       Subclass.prototype.constructor = Subclass;
 *
 *   The base constructor guarantees:
 *       this.options  — the caller's options object (never null)
 *       this.state    — { filters, isOpen, onSelect, onCancel }
 *       this._modal   — null until openModal() is called
 *       this._listeners — array of tracked listener records
 *
 *   The base prototype provides:
 *       openModal(title, content, cancelText, onConfirm, openOptions)
 *       close()
 *       escapeHtml(str)
 *       getIcon(name)
 *       getGenderSymbol(gender)
 *       isBloodRelative(aId, bId)
 *       isSpouse(aId, bId)
 *       debounce(fn, delay)
 *       showToast(message, type)
 *       _registerListener(el, eventType, handler)
 *       _cleanupListeners()
 *
 *   The base is STATELESS outside the per-instance fields listed above.
 *   It does not maintain any global state. Multiple selector instances
 *   can coexist.
 *
 * RELATIONSHIP PREDICATES
 * -----------------------
 *   isBloodRelativeBasic(aId, bId)  [on SelectorHelpers]
 *     → FamilyQueries.isBloodRelated(aId, bId)
 *     Fails closed (returns false) when FamilyQueries isn't loaded.
 *
 *   isSpouseBasic(aId, bId)         [on SelectorHelpers]
 *     → RelationshipQueries.getRelationshipBetween(aId, bId)
 *       filtered to `type === 'marriage' && status === 'ongoing'`.
 *     Fails closed when the relationship domain isn't loaded.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - accessors.js: getCharacterById
 *   - modals-core.js: openModal, closeTopModal
 *   - formatting.js: escapeHtml
 *
 * DEPENDENCIES (checked at call time):
 *   - accessors.js:        getCharacters, getPlaceById
 *   - family-queries.js:   isBloodRelated (for isBloodRelativeBasic)
 *   - relationship domain: getRelationshipBetween (for isSpouseBasic)
 *   - time.js:             getCurrentYear
 *   - icons.js:            getGenderIcon / Icons
 *   - collections.js:      debounce
 *   - ui.js:               showToast
 *
 * ICON POLICY: No emojis. Icons come from icons.js via window.getGenderIcon
 * or window.Icons if available. Text glyph fallbacks are prohibited.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - window.SelectorBase constructor RESTORED. It was missing from the
 *       prior revision of this file (which exported only the helper
 *       object). modals-char-selector.js has a load-time guard:
 *         "if (typeof window.SelectorBase !== 'function') throw ..."
 *       Without the constructor, that guard fires, and every caller of
 *       openCharacterSelector throws at load. This broke:
 *         - modals-character.js::openCreateCharacterModal
 *         - modals-character.js::openEditCharacterModal
 *         - modals-children-adoption.js
 *         - modals-children-surrogacy.js
 *         - modals-death.js::_routeToPregnancyAttempt
 *       Fixed by restoring the constructor with the surface the docs
 *       (selectors-docs.txt §4) and modals-char-selector.js expect.
 *     - SelectorBase.prototype.openModal now correctly wires onCancel
 *       from the core modal shell to state.onCancel. Prior revisions
 *       of the class (per docs) never connected the two, so cancel
 *       paths through the Cancel button, overlay, Escape, or close
 *       button were silently swallowed. Callers that depended on
 *       openCharacterSelector's onCancel never received it.
 *     - SelectorBase.prototype.openModal accepts an `openOptions`
 *       argument (5th positional). Subclasses that need synchronous
 *       DOM wiring pass `{ onMount: fn }`. This eliminates the
 *       setTimeout(0) hack that modals-char-selector.js used to
 *       schedule DOM queries.
 *     - SelectorBase.prototype._registerListener and
 *       _cleanupListeners added. modals-char-selector.js calls
 *       this._registerListener(...) from _attachEvents.
 *     - SelectorBase.prototype.debounce and showToast delegate to
 *       collections.js::debounce and ui.js::showToast respectively.
 *       Subclasses can call this.debounce(...) / this.showToast(...)
 *       exactly as before.
 *     - SelectorHelpers helper object unchanged from the prior revision.
 *       The gender-symbol restoration and the FamilyQueries-based
 *       predicates are preserved verbatim.
 *   Previous revisions:
 *     - getGenderSymbol / getGenderLabel restored.
 *     - Relationship predicates rewritten to delegate to
 *       FamilyQueries / RelationshipQueries (dead-field bug fix).
 *     - Flat globals aliased onto SelectorHelpers.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME PRECONDITIONS
    // =========================================================================

    if (typeof window.getCharacterById !== 'function') {
        throw new Error(
            'selector-base.js: accessors.js must load first ' +
            '(getCharacterById missing).'
        );
    }
    if (typeof window.openModal !== 'function') {
        throw new Error(
            'selector-base.js: modals-core.js must load first ' +
            '(openModal missing).'
        );
    }
    if (typeof window.closeTopModal !== 'function') {
        throw new Error(
            'selector-base.js: modals-core.js must load first ' +
            '(closeTopModal missing).'
        );
    }
    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'selector-base.js: formatting.js must load first ' +
            '(escapeHtml missing).'
        );
    }

    // =========================================================================
    // 1. SHARED HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _currentYear() {
        // Prefer the canonical accessor. The deprecated alias is used
        // only if the canonical accessor is not exposed.
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        return null;
    }

    function _characterAge(character) {
        if (!character) return null;
        if (typeof character.birthYear !== 'number') return null;

        if (character.isDeceased === true
            && typeof character.deathYear === 'number') {
            return character.deathYear - character.birthYear;
        }

        var year = _currentYear();
        if (year === null) return null;
        var age = year - character.birthYear;
        return age >= 0 ? age : null;
    }

    function _escapeText(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // =========================================================================
    // 2. SELECTOR HELPERS (helper object surface)
    // =========================================================================
    //
    // Pure functions. No state. Safe to call from any context. See the
    // SELECTOR HELPERS section in the module header.
    //
    // This is the surface modals-char-selector.js reads through
    // _Helpers.getGenderSymbol(...) and _Helpers.isBloodRelativeBasic(...),
    // and the surface modals-household-selector.js reads through
    // _selector.isBloodRelativeBasic(...). It is NOT the base class.

    function getDefaultFilterConfig() {
        return {
            gender: 'any',
            status: 'any',
            minAge: null,
            maxAge: null,
            locationId: null,
            relationshipFilter: 'any',
            excludeIds: [],
            showDeceased: false
        };
    }

    var _VALID_GENDERS = ['any', 'male', 'female', 'unknown'];
    var _VALID_STATUS = ['any', 'living', 'deceased'];
    var _VALID_RELATIONSHIP_FILTERS = [
        'any',
        'exclude_blood_relative',
        'exclude_spouse',
        'exclude_blood_relative_and_spouse'
    ];

    function normalizeFilterConfig(config) {
        var defaults = getDefaultFilterConfig();
        if (_isMissing(config) || typeof config !== 'object' || Array.isArray(config)) {
            return defaults;
        }

        var out = {};
        for (var key in defaults) {
            if (!Object.prototype.hasOwnProperty.call(defaults, key)) continue;
            out[key] = defaults[key];
        }
        for (var k2 in config) {
            if (!Object.prototype.hasOwnProperty.call(config, k2)) continue;
            out[k2] = config[k2];
        }

        if (_VALID_GENDERS.indexOf(out.gender) === -1) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'selector-base.js: invalid gender filter "' + out.gender +
                    '"; falling back to "any".'
                );
            }
            out.gender = 'any';
        }
        if (_VALID_STATUS.indexOf(out.status) === -1) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'selector-base.js: invalid status filter "' + out.status +
                    '"; falling back to "any".'
                );
            }
            out.status = 'any';
        }
        if (_VALID_RELATIONSHIP_FILTERS.indexOf(out.relationshipFilter) === -1) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'selector-base.js: invalid relationshipFilter "' +
                    out.relationshipFilter + '"; falling back to "any".'
                );
            }
            out.relationshipFilter = 'any';
        }

        if (out.minAge !== null && typeof out.minAge !== 'number') out.minAge = null;
        if (out.maxAge !== null && typeof out.maxAge !== 'number') out.maxAge = null;

        if (!Array.isArray(out.excludeIds)) out.excludeIds = [];

        if (out.locationId !== null && typeof out.locationId !== 'string') {
            out.locationId = null;
        }

        return out;
    }

    function matchGender(character, config) {
        if (!character) return false;
        if (!config || config.gender === 'any') return true;
        if (config.gender === 'unknown') {
            return character.gender !== 'male' && character.gender !== 'female';
        }
        return character.gender === config.gender;
    }

    function matchStatus(character, config) {
        if (!character) return false;
        if (!config) return true;
        if (config.showDeceased === true) return true;
        var isDeceased = character.isDeceased === true;
        if (config.status === 'living') return !isDeceased;
        if (config.status === 'deceased') return isDeceased;
        return true;
    }

    function matchAge(character, config) {
        if (!character) return false;
        if (!config) return true;
        var hasMin = typeof config.minAge === 'number';
        var hasMax = typeof config.maxAge === 'number';
        if (!hasMin && !hasMax) return true;
        var age = _characterAge(character);
        if (age === null) return false;
        if (hasMin && age < config.minAge) return false;
        if (hasMax && age > config.maxAge) return false;
        return true;
    }

    function matchLocation(character, config) {
        if (!character) return false;
        if (!config || !_hasId(config.locationId)) return true;
        if (!_hasId(character.currentLocationId)) return false;
        return character.currentLocationId === config.locationId;
    }

    function matchExcludeIds(character, config) {
        if (!character) return false;
        if (!config || !Array.isArray(config.excludeIds)) return true;
        if (config.excludeIds.length === 0) return true;
        if (!_hasId(character.id)) return true;
        return config.excludeIds.indexOf(character.id) === -1;
    }

    /**
     * True if the two characters share a biological ancestor, or are
     * directly parent/child. Delegates to FamilyQueries.isBloodRelated.
     * Fails closed (returns false) if FamilyQueries is missing.
     */
    function isBloodRelativeBasic(aId, bId) {
        if (!_hasId(aId) || !_hasId(bId)) return false;
        if (aId === bId) return false;
        if (typeof window.FamilyQueries === 'undefined'
            || typeof window.FamilyQueries.isBloodRelated !== 'function') {
            return false;
        }
        try {
            return window.FamilyQueries.isBloodRelated(aId, bId) === true;
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'selector-base.js: FamilyQueries.isBloodRelated threw', e
                );
            }
            return false;
        }
    }

    /**
     * True if the two characters have an ongoing marriage relationship.
     * Delegates to RelationshipQueries.getRelationshipBetween (or the
     * flat global equivalent). Fails closed (returns false) if the
     * relationship domain is missing.
     */
    function isSpouseBasic(aId, bId) {
        if (!_hasId(aId) || !_hasId(bId)) return false;
        if (aId === bId) return false;

        var getRel = null;
        if (typeof window.getRelationshipBetween === 'function') {
            getRel = window.getRelationshipBetween;
        } else if (typeof window.RelationshipQueries !== 'undefined'
            && window.RelationshipQueries
            && typeof window.RelationshipQueries.getRelationshipBetween === 'function') {
            getRel = window.RelationshipQueries.getRelationshipBetween;
        }
        if (!getRel) return false;

        var rel = null;
        try {
            rel = getRel(aId, bId);
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'selector-base.js: getRelationshipBetween threw', e
                );
            }
            return false;
        }
        if (!rel) return false;
        return rel.type === 'marriage' && rel.status === 'ongoing';
    }

    function matchRelationship(anchorId, candidateId, config) {
        if (!config || config.relationshipFilter === 'any') return true;
        if (!_hasId(anchorId) || !_hasId(candidateId)) return true;
        if (anchorId === candidateId) return false;

        var filter = config.relationshipFilter;
        if (filter === 'exclude_blood_relative') {
            return !isBloodRelativeBasic(anchorId, candidateId);
        }
        if (filter === 'exclude_spouse') {
            return !isSpouseBasic(anchorId, candidateId);
        }
        if (filter === 'exclude_blood_relative_and_spouse') {
            return !isBloodRelativeBasic(anchorId, candidateId)
                && !isSpouseBasic(anchorId, candidateId);
        }
        return true;
    }

    function matchesCharacter(character, config, anchorId) {
        if (!character) return false;
        if (!matchExcludeIds(character, config)) return false;
        if (!matchGender(character, config)) return false;
        if (!matchStatus(character, config)) return false;
        if (!matchAge(character, config)) return false;
        if (!matchLocation(character, config)) return false;
        if (_hasId(anchorId) && !matchRelationship(anchorId, character.id, config)) {
            return false;
        }
        return true;
    }

    function getCharacterDisplayName(character) {
        if (!character) return '';
        var name = typeof character.name === 'string' ? character.name : '';
        var surname = typeof character.surname === 'string' ? character.surname : '';
        var full = (name + ' ' + surname).trim();
        return full.length > 0 ? full : '';
    }

    function getCharacterInitials(character) {
        if (!character) return '';
        var name = typeof character.name === 'string' ? character.name : '';
        var surname = typeof character.surname === 'string' ? character.surname : '';
        var n = name.trim().charAt(0).toUpperCase();
        var s = surname.trim().charAt(0).toUpperCase();
        if (n && s) return n + s;
        if (n) return n;
        if (s) return s;
        return '';
    }

    function getGenderLabel(gender) {
        if (typeof window.getGenderLabel === 'function') {
            var fromFormatting = window.getGenderLabel(gender);
            if (typeof fromFormatting === 'string' && fromFormatting.length > 0) {
                return fromFormatting;
            }
        }
        switch (gender) {
            case 'male': return 'Male';
            case 'female': return 'Female';
            default: return 'Unknown';
        }
    }

    function getGenderSymbol(gender) {
        if (typeof window.getGenderIcon === 'function') {
            try {
                var icon = window.getGenderIcon(gender);
                if (typeof icon === 'string' && icon.length > 0) {
                    return icon;
                }
            } catch (e) {
                // Fall through to the local lookup.
            }
        }

        if (window.Icons && typeof window.Icons === 'object') {
            var iconName = 'GENDER_NEUTRAL';
            if (gender === 'male') iconName = 'MALE';
            else if (gender === 'female') iconName = 'FEMALE';
            var svg = window.Icons[iconName];
            if (typeof svg === 'string' && svg.length > 0) {
                return svg;
            }
        }

        return _escapeText(getGenderLabel(gender));
    }

    var SelectorHelpers = {
        // Filter config
        getDefaultFilterConfig: getDefaultFilterConfig,
        normalizeFilterConfig: normalizeFilterConfig,

        // Predicates
        matchGender: matchGender,
        matchStatus: matchStatus,
        matchAge: matchAge,
        matchLocation: matchLocation,
        matchExcludeIds: matchExcludeIds,
        matchRelationship: matchRelationship,
        matchesCharacter: matchesCharacter,

        // Relationship predicates
        isBloodRelativeBasic: isBloodRelativeBasic,
        isSpouseBasic: isSpouseBasic,

        // Display
        getCharacterDisplayName: getCharacterDisplayName,
        getCharacterInitials: getCharacterInitials,
        getGenderLabel: getGenderLabel,
        getGenderSymbol: getGenderSymbol,

        // Diagnostics
        version: 3
    };

    // =========================================================================
    // 3. SELECTOR BASE CLASS
    // =========================================================================
    //
    // See WINDOW.SELECTORBASE CONTRACT in the module header. This is the
    // class modals-char-selector.js extends via:
    //
    //     SelectorBase.call(this, options);
    //     CharacterSelector.prototype = Object.create(SelectorBase.prototype);
    //
    // The class is intentionally thin. It owns:
    //   - the modal handle (this._modal)
    //   - the listener registry (this._listeners)
    //   - the caller's options and state
    //   - delegating open/close/escape/debounce/toast
    //
    // It does NOT own:
    //   - filter state (subclass-specific)
    //   - rendering (subclass-specific)
    //   - data queries (subclass-specific)

    function SelectorBase(options) {
        options = options || {};

        this.options = options;

        this.state = {
            filters: (options.filters && typeof options.filters === 'object')
                ? options.filters
                : {},
            isOpen: false,
            onSelect: typeof options.onSelect === 'function'
                ? options.onSelect
                : function () {},
            onCancel: typeof options.onCancel === 'function'
                ? options.onCancel
                : function () {}
        };

        this._modal = null;
        this._listeners = [];
    }

    /**
     * Opens the modal shell for this selector.
     *
     * @param {string} title         trusted HTML for the modal title
     * @param {string} content       trusted HTML for the modal body
     * @param {string} [cancelText]  text for the cancel button (default
     *                               'Cancel'). The modal does not render
     *                               a confirm button; selection is the
     *                               subclass's job via row clicks.
     * @param {Function} [onConfirmExtra]
     *                               Ignored. Kept for backward
     *                               compatibility with modals-char-selector.js's
     *                               call shape. The base does not render a
     *                               confirm button, so onConfirm is a no-op
     *                               from the caller's perspective.
     * @param {Object} [openOptions]
     *                               Extra options passed to openModal.
     *                               Recognized:
     *                                 onMount(root) — called after the
     *                                                 modal is inserted
     *                                                 into the DOM. Use
     *                                                 this instead of
     *                                                 setTimeout(0) to
     *                                                 wire listeners
     *                                                 synchronously.
     * @returns {{ element, close }} the modal handle
     */
    SelectorBase.prototype.openModal = function (
        title,
        content,
        cancelText,
        onConfirmExtra,
        openOptions
    ) {
        // openModal on the core shell requires a cancelText or the button
        // does not render. Default to 'Cancel' so cancellation always
        // works.
        if (_isMissing(cancelText) || cancelText === '') cancelText = 'Cancel';

        openOptions = (openOptions && typeof openOptions === 'object')
            ? openOptions
            : {};

        var self = this;

        var modalOptions = {
            titleHtml: title,
            contentHtml: content,
            confirmText: '',
            cancelText: cancelText,
            // The base never renders a confirm button; returning false
            // keeps the modal open if modals-core ever renders one
            // anyway.
            onConfirm: function () { return false; },
            onCancel: function () {
                self.state.isOpen = false;
                self._cleanupListeners();
                self.state.onCancel();
            }
        };

        if (typeof openOptions.onMount === 'function') {
            modalOptions.onMount = function (root) {
                try {
                    openOptions.onMount(root);
                } catch (e) {
                    if (typeof console !== 'undefined' && console.error) {
                        console.error(
                            'selector-base.js: onMount threw:', e
                        );
                    }
                }
            };
        }

        this._modal = window.openModal(modalOptions);
        this.state.isOpen = true;
        return this._modal;
    };

    /**
     * Programmatically closes the modal. Does NOT fire state.onCancel.
     * Use this for "selection made, close the picker" flows.
     *
     * If the caller wants the cancel path to fire, they must either
     * click the modal's Cancel button / overlay / Escape / close button
     * (which all fire state.onCancel via openModal's wiring), or call
     * close() and then state.onCancel() themselves.
     */
    SelectorBase.prototype.close = function () {
        this.state.isOpen = false;
        this._cleanupListeners();
        if (this._modal && typeof this._modal.close === 'function') {
            this._modal.close();
        }
        this._modal = null;
    };

    SelectorBase.prototype.escapeHtml = function (str) {
        return window.escapeHtml(str);
    };

    SelectorBase.prototype.getIcon = function (name) {
        if (typeof window.getIcon === 'function') {
            return window.getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    };

    SelectorBase.prototype.getGenderSymbol = function (gender) {
        return SelectorHelpers.getGenderSymbol(gender);
    };

    SelectorBase.prototype.isBloodRelative = function (aId, bId) {
        return SelectorHelpers.isBloodRelativeBasic(aId, bId);
    };

    SelectorBase.prototype.isSpouse = function (aId, bId) {
        return SelectorHelpers.isSpouseBasic(aId, bId);
    };

    SelectorBase.prototype.debounce = function (fn, delay) {
        if (typeof window.debounce === 'function') {
            return window.debounce(fn, delay);
        }
        // Local fallback. Same contract as collections.js::debounce
        // minus .cancel() and .flush(); subclasses that need those
        // should call window.debounce directly.
        var timer = null;
        return function () {
            var args = arguments;
            var ctx = this;
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(function () {
                timer = null;
                fn.apply(ctx, args);
            }, typeof delay === 'number' ? delay : 0);
        };
    };

    SelectorBase.prototype.showToast = function (message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    };

    /**
     * Registers an event listener and tracks it for cleanup. Subclasses
     * that call _registerListener must ensure _cleanupListeners runs
     * (which close() and the modal's onCancel path both do).
     *
     * @param {Element|Document|Window} el
     * @param {string} eventType
     * @param {Function} handler
     */
    SelectorBase.prototype._registerListener = function (el, eventType, handler) {
        if (!el || typeof el.addEventListener !== 'function') return;
        if (typeof handler !== 'function') return;
        el.addEventListener(eventType, handler);
        this._listeners.push({
            el: el,
            eventType: eventType,
            handler: handler
        });
    };

    /**
     * Removes every tracked listener and clears the registry. Called by
     * close() and by the modal's onCancel wiring. Safe to call multiple
     * times.
     */
    SelectorBase.prototype._cleanupListeners = function () {
        for (var i = 0; i < this._listeners.length; i++) {
            var l = this._listeners[i];
            if (l && l.el && typeof l.el.removeEventListener === 'function') {
                l.el.removeEventListener(l.eventType, l.handler);
            }
        }
        this._listeners = [];
    };

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    // Helper object surface (used by modals-char-selector.js and
    // modals-household-selector.js for predicates and display helpers).
    window.SelectorHelpers = SelectorHelpers;
    window._SelectorBaseHelpers = SelectorHelpers;

    // Base class surface (used by modals-char-selector.js via inheritance).
    window.SelectorBase = SelectorBase;

    // Flat-global aliases preserved from prior revisions.
    window.getCharacterDisplayName = getCharacterDisplayName;
    window.getCharacterInitials = getCharacterInitials;
    window.isBloodRelativeBasic = isBloodRelativeBasic;
    window.isSpouseBasic = isSpouseBasic;
    window.getGenderLabel = getGenderLabel;
    window.getGenderSymbol = getGenderSymbol;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            SelectorBase: SelectorBase,
            SelectorHelpers: SelectorHelpers
        };
    }

})();
