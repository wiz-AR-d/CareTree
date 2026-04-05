const TriageSession = require('../models/TriageSession');
const ProtocolVersion = require('../models/ProtocolVersion');
const { getNextNode, calculateScore, classifyPriority } = require('../utils/decisionEngine');

// Helper to attach metadata to a node before sending to frontend
const attachNodeMetadata = (nodeDoc, versionDoc) => {
    if (!nodeDoc) return null;
    const nodeObj = nodeDoc.toObject ? nodeDoc.toObject() : nodeDoc;
    const nextRules = versionDoc.branchRules.filter(r => r.nodeId === nodeObj.nodeId);
    nodeObj.expectedOptions = nextRules
        .map(r => r.conditionValue)
        .filter(v => v !== '*' && !v.includes('>') && !v.includes('<')); // Simple exact choices
    return nodeObj;
};

// @desc    Start a new triage session
// @route   POST /api/triage/sessions
// @access  Private/Nurse
exports.startSession = async (req, res) => {
    try {
        const { versionId } = req.body;

        const version = await ProtocolVersion.findById(versionId);
        if (!version) return res.status(404).json({ error: 'Protocol version not found' });

        // Assuming the first node in the array is the root node
        const rootNode = version.nodes.find(n => n.type !== 'terminal') || version.nodes[0];

        if (!rootNode) return res.status(400).json({ error: 'Protocol version has no valid starting nodes' });

        const session = await TriageSession.create({
            nurseId: req.user._id,
            versionId,
            responses: [],
            finalPriority: 'Pending',
            totalScore: 0,
            synced: true // Realtime API call creates a synced session
        });

        res.status(201).json({
            session,
            nextNode: attachNodeMetadata(rootNode, version)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// @desc    Submit a response for the current node
// @route   POST /api/triage/sessions/:id/respond
// @access  Private/Nurse
exports.submitResponse = async (req, res) => {
    try {
        const { nodeId, responseValue } = req.body;
        const session = await TriageSession.findById(req.params.id);

        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.finalPriority !== 'Pending') {
            return res.status(400).json({ error: 'Session is already completed' });
        }

        const version = await ProtocolVersion.findById(session.versionId);

        // 1. Find the current node to get its score
        const currentNode = version.nodes.find(n => n.nodeId === nodeId);
        if (!currentNode) return res.status(400).json({ error: 'Node ID not found in protocol' });

        // 2. Record the response
        const scoreApplied = currentNode.scoreValue || 0;
        session.responses.push({
            nodeId,
            responseValue,
            scoreApplied
        });

        // Update running score
        session.totalScore = calculateScore(session.responses);

        // 3. Determine next node
        const nextNode = getNextNode(version.nodes, version.branchRules, nodeId, responseValue);

        if (!nextNode) {
            // Reached a dead end without a designated terminal node
            session.finalPriority = classifyPriority(session.totalScore);
            await session.save();
            return res.json({ session, message: 'Flowchart ended unexpectedly', defaultPriorityAssigned: session.finalPriority });
        }

        // 4. Check if we hit a terminal node
        if (nextNode.type === 'terminal') {
            // The content of the terminal node might dictate the priority, or we use the score
            if (['Emergency', 'High', 'Medium', 'Low'].includes(nextNode.content)) {
                session.finalPriority = nextNode.content;
            } else {
                session.finalPriority = classifyPriority(session.totalScore);
            }

            await session.save();
            return res.json({
                session,
                terminalNode: nextNode,
                isComplete: true
            });
        }

        // Still in progress
        await session.save();
        return res.json({
            session,
            nextNode: attachNodeMetadata(nextNode, version),
            isComplete: false
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// @desc    Go back to the previous node by popping the last response
// @route   POST /api/triage/sessions/:id/back
// @access  Private/Nurse
exports.goBack = async (req, res) => {
    try {
        const session = await TriageSession.findById(req.params.id);

        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.responses.length === 0) {
            return res.status(400).json({ error: 'Cannot go back further' });
        }

        const version = await ProtocolVersion.findById(session.versionId);
        if (!version) return res.status(404).json({ error: 'Protocol version not found' });

        // Pop the last response which corresponds to the previous question
        const lastResponse = session.responses.pop();

        // Re-calculate the score
        session.totalScore = calculateScore(session.responses);

        // Ensure session is marked as Pending since we are active again
        session.finalPriority = 'Pending';

        await session.save();

        // The node we want to return to is the one that was just popped
        const previousNode = version.nodes.find(n => n.nodeId === lastResponse.nodeId);

        return res.json({
            session,
            nextNode: attachNodeMetadata(previousNode, version),
            isComplete: false
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// @desc    Get session details
// @route   GET /api/triage/sessions/:id
// @access  Private
exports.getSessionResult = async (req, res) => {
    try {
        const session = await TriageSession.findById(req.params.id)
            .populate('nurseId', 'name')
            .populate('versionId', 'versionNumber');

        if (!session) return res.status(404).json({ error: 'Session not found' });

        res.json(session);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// @desc    Get all active/completed sessions for a nurse
// @route   GET /api/triage/sessions
// @access  Private/Nurse
exports.getActiveSessions = async (req, res) => {
    try {
        const sessions = await TriageSession.find({ nurseId: req.user._id })
            .populate('versionId', 'versionNumber isActive')
            .sort({ createdAt: -1 });

        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// @desc    Bulk sync offline sessions
// @route   POST /api/triage/sessions/bulk
// @access  Private/Nurse
exports.bulkSync = async (req, res) => {
    try {
        const { sessions } = req.body;

        if (!Array.isArray(sessions)) {
            return res.status(400).json({ error: 'Sessions must be an array' });
        }

        const formattedSessions = sessions.map(session => ({
            nurseId: req.user._id,
            versionId: session.versionId,
            responses: session.responses || [],
            finalPriority: session.finalPriority || 'Pending',
            totalScore: session.totalScore || 0,
            synced: true,
            createdAt: session.startTime || new Date(),
        }));

        const result = await TriageSession.insertMany(formattedSessions);

        res.status(201).json({
            message: `Successfully synced ${result.length} sessions`,
            syncedCount: result.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
