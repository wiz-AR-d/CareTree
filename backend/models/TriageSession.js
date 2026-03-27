const mongoose = require('mongoose');

const responseSchema = new mongoose.Schema({
    nodeId: { type: String, required: true },
    responseValue: { type: mongoose.Schema.Types.Mixed, required: true },
    scoreApplied: { type: Number, default: 0 }
}, { _id: false });

const triageSessionSchema = new mongoose.Schema({
    nurseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    versionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProtocolVersion',
        required: true,
    },
    responses: [responseSchema],
    finalPriority: {
        type: String,
        enum: ['Emergency', 'High', 'Medium', 'Low', 'Pending'],
        default: 'Pending'
    },
    totalScore: {
        type: Number,
        default: 0
    },
    synced: {
        type: Boolean,
        default: true // Created via API is synced. Offline ones will be bulk-synced.
    }
}, { timestamps: true });

module.exports = mongoose.model('TriageSession', triageSessionSchema);
