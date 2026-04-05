const express = require('express');
const router = express.Router();
const {
    startSession,
    submitResponse,
    getSessionResult,
    getActiveSessions,
    goBack,
    bulkSync
} = require('../controllers/triageController');

const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');

// -----------------------------------
// Nurse Routes (Execution)
// -----------------------------------
router.post('/sessions', protect, authorize('nurse'), startSession);
router.post('/sessions/:id/respond', protect, authorize('nurse'), submitResponse);
router.post('/sessions/:id/back', protect, authorize('nurse'), goBack);
router.get('/sessions', protect, authorize('nurse'), getActiveSessions);
router.post('/sessions/bulk', protect, authorize('nurse'), bulkSync);

// -----------------------------------
// Shared Routes
// -----------------------------------
router.get('/sessions/:id', protect, getSessionResult);

module.exports = router;
