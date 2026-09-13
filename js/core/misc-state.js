/**
 * STILL WATERS - Miscellaneous State
 * Family tree, timeline, diagnostics, bulk import.
 */
(function() {
    'use strict';

    var _treeCurrentCharacterId = null;
    var _timelineEvents = [];
    var _diagnosticCurrentData = null;
    var _bulkImportedData = [];
    var _bulkImportedHeaders = [];

    function _createDefaults() {
        return {
            treeCurrentCharacterId: null,
            timelineEvents: [],
            diagnosticCurrentData: null,
            bulkImportedData: [],
            bulkImportedHeaders: []
        };
    }

    function reset() {
        var d = _createDefaults();
        _treeCurrentCharacterId = d.treeCurrentCharacterId;
        _timelineEvents = d.timelineEvents;
        _diagnosticCurrentData = d.diagnosticCurrentData;
        _bulkImportedData = d.bulkImportedData;
        _bulkImportedHeaders = d.bulkImportedHeaders;
    }

    window.MiscState = {
        get treeCurrentCharacterId() { return _treeCurrentCharacterId; },
        set treeCurrentCharacterId(v) { _treeCurrentCharacterId = v; },

        get timelineEvents() { return _timelineEvents; },
        set timelineEvents(v) { _timelineEvents = v; },

        get diagnosticCurrentData() { return _diagnosticCurrentData; },
        set diagnosticCurrentData(v) { _diagnosticCurrentData = v; },

        get bulkImportedData() { return _bulkImportedData; },
        set bulkImportedData(v) { _bulkImportedData = v; },

        get bulkImportedHeaders() { return _bulkImportedHeaders; },
        set bulkImportedHeaders(v) { _bulkImportedHeaders = v; },

        reset: reset,
        _createDefaults: _createDefaults
    };
})();