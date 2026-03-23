/**
 * CareTree Decision Engine
 * 
 * Pure functions to manage triage state machine execution.
 * Deterministic processing enables both online backend execution
 * and offline frontend execution using the exact same logic.
 */

/**
 * Finds the next node based on the current node and the response provided.
 * 
 * @param {Array} nodes - All nodes in the protocol version
 * @param {Array} branchRules - All branching rules in the protocol version
 * @param {String} currentNodeId - ID of the node just answered
 * @param {Mixed} responseValue - The value provided by the user
 * @returns {Object|null} The next node object, or null if terminal/not found
 */
const getNextNode = (nodes, branchRules, currentNodeId, responseValue) => {
    // Find all rules originating from the current node
    const rules = branchRules.filter((rule) => rule.nodeId === currentNodeId);

    let nextNodeId = null;

    // Simple exact string match evaluation for MVP
    // Future scope: regex matching, numerical range evaluation (e.g., ">38")
    for (const rule of rules) {
        if (String(rule.conditionValue).toLowerCase() === String(responseValue).toLowerCase()) {
            nextNodeId = rule.nextNodeId;
            break;
        }
    }

    // If no specific branch matched, look for a default branch (typically marked as '*')
    if (!nextNodeId) {
        const defaultRule = rules.find((rule) => rule.conditionValue === '*');
        if (defaultRule) {
            nextNodeId = defaultRule.nextNodeId;
        }
    }

    if (!nextNodeId) {
        return null; // Dead end or improperly configured flowchart
    }

    return nodes.find((node) => node.nodeId === nextNodeId) || null;
};

/**
 * Calculates the total score from an array of responses.
 * 
 * @param {Array} responses - Array of response objects { scoreApplied: Number }
 * @returns {Number} Total score
 */
const calculateScore = (responses) => {
    return responses.reduce((total, res) => total + (res.scoreApplied || 0), 0);
};

/**
 * Classifies priority based on final score.
 * Note: These thresholds could be moved to the Protocol document later for customizability.
 * 
 * @param {Number} score - Final deterministic score
 * @returns {String} Priority classification
 */
const classifyPriority = (score) => {
    if (score >= 15) return 'Emergency';
    if (score >= 10) return 'High';
    if (score >= 5) return 'Medium';
    return 'Low';
};

/**
 * Simulates the execution of the entire protocol path based on provided responses.
 * Useful for validation and re-calculating scores if needed.
 * 
 * @param {Object} versionDoc - The populated ProtocolVersion document containing nodes and branchRules
 * @param {Array} responses - Array of historical responses [{nodeId, responseValue}]
 * @returns {Object} { finalPriority, totalScore, finalNodeId }
 */
const runTriagePath = (versionDoc, responses) => {
    const { nodes, branchRules } = versionDoc;

    if (!nodes || nodes.length === 0) {
        return { finalPriority: 'Pending', totalScore: 0, error: 'No nodes in protocol' };
    }

    // Start at root node (assuming first node in array is root, or nodes marked explicitly)
    // For safety, we just process the responses in order to calculate score

    let totalScore = 0;
    let lastNodeId = null;

    for (const response of responses) {
        const node = nodes.find(n => n.nodeId === response.nodeId);
        if (node) {
            totalScore += (node.scoreValue || 0); // Alternatively, rely on response.scoreApplied
            lastNodeId = node.nodeId;
        }
    }

    // Check if last node is terminal
    const lastNode = nodes.find(n => n.nodeId === lastNodeId);
    let finalPriority = 'Pending';

    if (lastNode && lastNode.type === 'terminal') {
        // If the terminal node explicitly defined a priority in its content
        if (['Emergency', 'High', 'Medium', 'Low'].includes(lastNode.content)) {
            finalPriority = lastNode.content;
        } else {
            // Otherwise calculate from score
            finalPriority = classifyPriority(totalScore);
        }
    }

    return { finalPriority, totalScore, finalNodeId: lastNodeId };
};

module.exports = {
    getNextNode,
    calculateScore,
    classifyPriority,
    runTriagePath
};
