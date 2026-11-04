<!-- ============================================================
     BLOCK 9b — EVENT LOGGER
     Owns window.logEvent. Every subsystem that records a timeline
     event calls it. Must load before:
       - annualProcessing.js and social-events-system.js (Block 10)
       - crime-commands.js / crime-bootstrap.js (Block 24)
       - disaster-commands.js / disaster-bootstrap.js (Block 32)
     No load-time dependencies: it defers masterData access to call
     time, so it is safe to load here (masterData.data is initialized
     by Block 4, but if that ever moves, eventLogger.js still works —
     it drops events until masterData is ready).
     ============================================================ -->
<script src="js/events/eventLogger.js"></script>
