const mongoose = require('mongoose');

const nodeSchema = new mongoose.Schema({
    nodeId: { type: String, required: true },
    type: {
        type: String,
        enum: ['question', 'action', 'terminal'],
        required: true
    },
    content: { type: String, required: true }, // The question text or terminal priority
    scoreValue: { type: Number, default: 0 },
    position: {
        x: { type: Number, default: 0 },
        y: { type: Number, default: 0 }
    } // For the React Flow builder
}, { _id: false });

const branchRuleSchema = new mongoose.Schema({
    nodeId: { type: String, required: true },
    conditionValue: { type: String, required: true }, // E.g., 'Yes', 'No', '>38', etc.
    nextNodeId: { type: String, required: true }
}, { _id: false });

const protocolVersionSchema = new mongoose.Schema({
    protocolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Protocol',
        required: true,
    },
    versionNumber: {
        type: Number,
        required: true,
    },
    isActive: {
        type: Boolean,
        default: false,
    },
    publishedAt: {
        type: Date,
    },
    // We embed the entire tree structure to make offline sync a single document fetch
    nodes: [nodeSchema],
    branchRules: [branchRuleSchema],
}, { timestamps: true });

// Ensure unique protocol and version number combination
protocolVersionSchema.index({ protocolId: 1, versionNumber: 1 }, { unique: true });

module.exports = mongoose.model('ProtocolVersion', protocolVersionSchema);
