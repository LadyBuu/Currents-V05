/**
 * STILL WATERS - Role Constants
 * Owned by the role domain.
 * Icons live in icons.js — these are data-only.
 */
(function() {
    'use strict';

    window.DEFAULT_ROLE_CATEGORIES = Object.freeze({
        combat:      Object.freeze({ id: 'combat',      name: 'Combat & Military' }),
        craft:       Object.freeze({ id: 'craft',       name: 'Craftsmanship' }),
        trade:       Object.freeze({ id: 'trade',       name: 'Trade & Commerce' }),
        agriculture: Object.freeze({ id: 'agriculture', name: 'Agriculture & Fishing' }),
        academic:    Object.freeze({ id: 'academic',    name: 'Academic & Scholar' }),
        religious:   Object.freeze({ id: 'religious',   name: 'Religious' }),
        admin:       Object.freeze({ id: 'admin',       name: 'Administration' }),
        service:     Object.freeze({ id: 'service',     name: 'Service' }),
        art:         Object.freeze({ id: 'art',         name: 'Artistic' })
    });
})();
