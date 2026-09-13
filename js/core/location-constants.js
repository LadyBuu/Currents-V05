/**
 * STILL WATERS - Location Constants
 * Owned by the location domain.
 * No icons — those live in icons.js.
 */
(function() {
    'use strict';

    window.LOCATION_LEVELS = Object.freeze({
        1: Object.freeze({ id: 'country',  name: 'Country' }),
        2: Object.freeze({ id: 'region',   name: 'Region / District' }),
        3: Object.freeze({ id: 'county',   name: 'County / Duchy' }),
        4: Object.freeze({ id: 'town',     name: 'Town / Village' }),
        5: Object.freeze({ id: 'locality', name: 'Locality / Compound' })
    });
})();