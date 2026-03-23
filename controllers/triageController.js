const TriageSession = require('../models/TriageSession');
const ProtocolVersion = require('../models/ProtocolVersion');
const { getNextNode, calculateScore, classifyPriority } = require('../utils/decisionEngine');

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
            nextNode: rootNode
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
            nextNode,
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
