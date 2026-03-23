const express = require('express');
const router = express.Router();
const {
    createProtocol,
    getProtocols,
    getProtocolById,
    publishVersion,
    getVersion,
} = require('../controllers/protocolController');

const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');

// -----------------------------------
// Doctor Routes (Create/Modify)
// -----------------------------------
router.post('/', protect, authorize('doctor'), createProtocol);
router.post('/:id/versions', protect, authorize('doctor'), publishVersion);

// -----------------------------------
// Shared Routes (Read)
// -----------------------------------
router.get('/', protect, getProtocols);
router.get('/:id', protect, getProtocolById);
router.get('/:id/versions/:versionId', protect, getVersion);

module.exports = router;
