const ProtocolVersion = require('../models/ProtocolVersion');
const TriageSession = require('../models/TriageSession');
const { runTriagePath } = require('../utils/decisionEngine');

// @desc    Get the latest active version of a protocol
// @route   GET /api/sync/protocols/:id/latest
// @access  Private/Nurse
exports.getLatestVersion = async (req, res) => {
    try {
        const version = await ProtocolVersion.findOne({
            protocolId: req.params.id,
            isActive: true
        }).populate('protocolId', 'name description');

        if (!version) {
            return res.status(404).json({ error: 'No active version found for this protocol' });
        }

        res.json(version);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// @desc    Bulk sync offline sessions to the cloud
// @route   POST /api/sync/sessions
// @access  Private/Nurse
exports.syncOfflineSessions = async (req, res) => {
    try {
        const { sessions } = req.body; // Expects an array of session objects

        if (!Array.isArray(sessions) || sessions.length === 0) {
            return res.status(400).json({ error: 'Please provide an array of sessions to sync' });
        }

        const savedSessions = [];
        const errors = [];

        for (const sessionData of sessions) {
            try {
                // Validation: Verify protocol exists
                const version = await ProtocolVersion.findById(sessionData.versionId);
                if (!version) {
                    errors.push({ localSessionId: sessionData.localId, error: 'Protocol version not found' });
                    continue;
                }

                // Re-verify the score and final priority using the backend engine to prevent frontend tampering
                const validationResult = runTriagePath(version, sessionData.responses);

                const newSession = await TriageSession.create({
                    nurseId: req.user._id, // Assign to the nurse performing the sync
                    versionId: sessionData.versionId,
                    responses: sessionData.responses,
                    finalPriority: validationResult.finalPriority,
                    totalScore: validationResult.totalScore,
                    synced: true,
                    createdAt: sessionData.offlineCreatedAt || new Date()
                });

                savedSessions.push({ localId: sessionData.localId, cloudId: newSession._id });
            } catch (err) {
                errors.push({ localSessionId: sessionData.localId, error: err.message });
            }
        }

        res.json({
            message: `Successfully synced ${savedSessions.length} sessions.`,
            savedSessions,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
