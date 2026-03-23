const express = require('express');
const router = express.Router();
const { getLatestVersion, syncOfflineSessions } = require('../controllers/syncController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');

// @desc    Fetch latest active version of protocol
router.get('/protocols/:id/latest', protect, authorize('nurse'), getLatestVersion);

// @desc    Bulk sync offline sessions
router.post('/sessions', protect, authorize('nurse'), syncOfflineSessions);

module.exports = router;
