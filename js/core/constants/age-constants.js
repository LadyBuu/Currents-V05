/**
 * =============================================================================
 * STILL WATERS - AGE & LIFE STAGE CONSTANTS (age-constants.js)
 * =============================================================================
 *
 * LOCATION: js/core/constants/age-constants.js
 *
 * SCOPE:
 *   - Life stages (LIFE_STAGES): the canonical age-band vocabulary for
 *     character classification. Consumed by character-lifecycle.js's
 *     getLifeStage / getLifeStageName.
 *   - Age groups (AGE_GROUPS): ordered band keys (0-10, 11-20, ...).
 *     Consumed by character-lifecycle.js's getAgeGroup / getAllAgeGroups /
 *     getAgeGroupIndex, and by character-statistics.js and
 *     mortality-statistics.js as the default band set.
 *   - Filter age groups (FILTER_AGE_GROUPS): non-overlapping bands used
 *     by census / character-filter UIs. Deliberately different from
 *     AGE_GROUPS.
 *   - Legacy death-cause catalogue (DEATH_CAUSES): a flat weighted list
 *     of natural/accidental causes. See DEATH_CAUSES VS MORTALITY-RULES
 *     below.
 *
 * OUT OF SCOPE:
 *   - Mortality policy and cause selection → mortality-rules.js
 *   - Simulation lifespan/fertility modelling → simulation-generators.js
 *   - Year bounds → time.js
 *   - Character identity enums (gender, attraction) → character-constants.js
 *
 * DEATH_CAUSES VS MORTALITY-RULES:
 *   window.DEATH_CAUSES (this file) and
 *   mortality-rules.js::DEFAULT_DEATH_CAUSES are two different things
 *   that happen to share a subject. Do not conflate them.
 *
 *     age-constants.js::DEATH_CAUSES
 *       Flat weighted list: { text, weight, minAge?, maxAge? }.
 *       No stable cause ids, no gender eligibility, no category
 *       taxonomy. It is a LEGACY SURFACE retained for backward
 *       compatibility with any pre-refactor UI that read
 *       window.DEATH_CAUSES directly to populate a death-cause
 *       dropdown. No module in the current tree consumes it.
 *
 *     mortality-rules.js::DEFAULT_DEATH_CAUSES
 *       Canonical cause catalogue: { cause, detail, weight, minAge?,
 *       maxAge?, requiresFemale? }, where `cause` is a stable id from
 *       mortality-rules.js::DEATH_CAUSE (natural, disease, accident,
 *       murder, execution, childbed_fever, unknown).
 *       Consumed by:
 *         - character-lifecycle.js::_chooseDeathCause
 *           (via mortality-rules.js::pickRandomCause)
 *         - mortality-queries.js::getDeathsByCause
 *         - mortality-statistics.js
 *       Any change to what a character can die of belongs HERE, not
 *       in age-constants.js::DEATH_CAUSES.
 *
 *   If a future audit finds no caller of window.DEATH_CAUSES, the
 *   entry can be removed. Until then, keep it stable: the legacy
 *   surface is the only reason it exists, and silently changing the
 *   list would surprise any surviving pre-refactor caller.
 *
 * MODIFICATION POLICY:
 *   - LIFE_STAGES and AGE_GROUPS must stay aligned: every
 *     LIFE_STAGES[k].group value must appear in AGE_GROUPS, and the
 *     two must agree on band boundaries. Adding a stage requires
 *     adding the matching AGE_GROUPS entry; removing a stage requires
 *     removing the entry (after verifying no consumer still references
 *     it by string). There is no automatic consistency check today;
 *     the invariant is documented here and enforced by code review.
 *   - FILTER_AGE_GROUPS is intentionally a different partition from
 *     AGE_GROUPS. Do NOT try to unify them. The census UI needs
 *     non-overlapping bands with a different resolution than the
 *     character-classification bands; both are correct for their
 *     consumers. The "0-19 vs 0-10 + 11-20" split is deliberate: the
 *     census groups young people into one bucket, the classifier
 *     distinguishes children from youths.
 *
 * DEPENDENCIES: None. Load early.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (C3):
 *     - Header expanded from two lines to full scope/out-of-scope,
 *       death-cause comparison, and modification-policy sections.
 *       Documents that age-constants.js::DEATH_CAUSES is a legacy
 *       flat catalogue with no current consumers, while
 *       mortality-rules.js::DEFAULT_DEATH_CAUSES is the canonical
 *       cause selector consumed by character-lifecycle.js,
 *       mortality-queries.js, and mortality-statistics.js.
 *     - Documents the LIFE_STAGES/AGE_GROUPS alignment invariant and
 *       the FILTER_AGE_GROUPS intentional divergence.
 *     - No code change. Every constant, every frozen entry, and the
 *       IIFE structure are byte-identical to the version shipped
 *       prior to C3.
 *   Prior state:
 *     - Two-line header. No documentation of the DEATH_CAUSES /
 *       mortality-rules split. No documentation of the LIFE_STAGES /
 *       AGE_GROUPS alignment invariant. No documentation of why
 *       FILTER_AGE_GROUPS differs from AGE_GROUPS.
 * =============================================================================
 */
(function() {
    'use strict';

    /**
     * Canonical life stages.
     * min/max are inclusive; group is the AGE_GROUPS key.
     * ANCIENT has no upper bound — it is open-ended.
     */
    window.LIFE_STAGES = Object.freeze({
        INFANT:       Object.freeze({ min: 0,  max: 10,  name: 'Child',         group: '0-10' }),
        YOUTH:        Object.freeze({ min: 11, max: 20,  name: 'Youth',         group: '11-20' }),
        YOUNG_ADULT:  Object.freeze({ min: 21, max: 30,  name: 'Young Adult',   group: '21-30' }),
        ADULT:        Object.freeze({ min: 31, max: 40,  name: 'Adult',         group: '31-40' }),
        MIDDLE_ADULT: Object.freeze({ min: 41, max: 50,  name: 'Middle Adult',  group: '41-50' }),
        MATURE:       Object.freeze({ min: 51, max: 60,  name: 'Mature',        group: '51-60' }),
        SENIOR:       Object.freeze({ min: 61, max: 70,  name: 'Senior',        group: '61-70' }),
        ELDER:        Object.freeze({ min: 71, max: 80,  name: 'Elder',         group: '71-80' }),
        AGED:         Object.freeze({ min: 81, max: 90,  name: 'Aged',          group: '81-90' }),
        ANCIENT:      Object.freeze({ min: 91, max: null, name: 'Ancient',     group: '91+'   })
    });

    /**
     * Age groups array (derived from LIFE_STAGES).
     * Order matches LIFE_STAGES declaration order.
     *
     * INVARIANT: every LIFE_STAGES[k].group value appears in this array,
     * and the two agree on band boundaries. See MODIFICATION POLICY in
     * the module header.
     */
    window.AGE_GROUPS = Object.freeze([
        '0-10', '11-20', '21-30', '31-40', '41-50',
        '51-60', '61-70', '71-80', '81-90', '91+'
    ]);

    /**
     * Census filter age bands.
     *
     * Deliberately different from AGE_GROUPS. Non-overlapping.
     * 50+ starts at 51 to avoid sharing 50 with 36-50.
     *
     * See MODIFICATION POLICY in the module header for why this is
     * intentionally a different partition from AGE_GROUPS.
     */
    window.FILTER_AGE_GROUPS = Object.freeze({
        '0-19':  Object.freeze({ min: 0,  max: 19,  label: '0-19 years' }),
        '20-35': Object.freeze({ min: 20, max: 35,  label: '20-35 years' }),
        '36-50': Object.freeze({ min: 36, max: 50,  label: '36-50 years' }),
        '51+':   Object.freeze({ min: 51, max: Infinity, label: '51+ years' })
    });

    /**
     * Legacy death-cause catalogue.
     *
     * Flat weighted list: { text, weight, minAge?, maxAge? }. No stable
     * cause ids, no gender eligibility, no category taxonomy.
     *
     * This is NOT the canonical cause selector. See DEATH_CAUSES VS
     * MORTALITY-RULES in the module header. The canonical catalogue is
     * mortality-rules.js::DEFAULT_DEATH_CAUSES, consumed by
     * character-lifecycle.js::_chooseDeathCause (via
     * mortality-rules.js::pickRandomCause) and by mortality-queries.js
     * and mortality-statistics.js filters.
     *
     * No module in the current tree consumes window.DEATH_CAUSES. It is
     * retained for backward compatibility with any pre-refactor UI that
     * read it directly to populate a death-cause dropdown. Keep it
     * stable; if a future audit confirms zero callers, remove it.
     */
    window.DEATH_CAUSES = Object.freeze([
        Object.freeze({ text: 'Old age', weight: 25, minAge: 60 }),
        Object.freeze({ text: 'Old age, natural causes', weight: 15, minAge: 60 }),
        Object.freeze({ text: 'Fever', weight: 12 }),
        Object.freeze({ text: 'Consumption (tuberculosis)', weight: 10 }),
        Object.freeze({ text: 'Pneumonia', weight: 8 }),
        Object.freeze({ text: 'Infection', weight: 6 }),
        Object.freeze({ text: 'Plague', weight: 8 }),
        Object.freeze({ text: 'Dysentery', weight: 5 }),
        Object.freeze({ text: 'Drowning', weight: 5 }),
        Object.freeze({ text: 'Fell from a height', weight: 4 }),
        Object.freeze({ text: 'Hunting accident', weight: 3 }),
        Object.freeze({ text: 'Fire', weight: 3 }),
        Object.freeze({ text: 'Animal attack', weight: 3 }),
        Object.freeze({ text: 'Accident', weight: 5 }),
        Object.freeze({ text: 'Childbed fever', weight: 4, minAge: 14, maxAge: 45 })
    ]);
})();
