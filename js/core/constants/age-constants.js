/**
 * STILL WATERS - Age & Life Stage Constants
 * Shared by character, time, and query modules.
 * Owned by the time/character domain.
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
     */
    window.AGE_GROUPS = Object.freeze([
        '0-10', '11-20', '21-30', '31-40', '41-50',
        '51-60', '61-70', '71-80', '81-90', '91+'
    ]);

    /**
     * Census filter age bands (deliberately different from AGE_GROUPS).
     * Non-overlapping. 50+ starts at 51 to avoid sharing 50 with 36-50.
     */
    window.FILTER_AGE_GROUPS = Object.freeze({
        '0-19':  Object.freeze({ min: 0,  max: 19,  label: '0-19 years' }),
        '20-35': Object.freeze({ min: 20, max: 35,  label: '20-35 years' }),
        '36-50': Object.freeze({ min: 36, max: 50,  label: '36-50 years' }),
        '51+':   Object.freeze({ min: 51, max: Infinity, label: '51+ years' })
    });

    /**
     * Natural death causes (not including murder/execution).
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