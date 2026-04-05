const Protocol = require('../models/Protocol');
const ProtocolVersion = require('../models/ProtocolVersion');
const TriageSession = require('../models/TriageSession');

// @desc    Create a new protocol
// @route   POST /api/protocols
// @access  Private/Doctor
exports.createProtocol = async (req, res) => {
    try {
        const { name, description } = req.body;

        const protocol = await Protocol.create({
            name,
            description,
            createdBy: req.user._id,
        });

        res.status(201).json(protocol);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// @desc    Get all protocols
// @route   GET /api/protocols
// @access  Private
exports.getProtocols = async (req, res) => {
    try {
        const protocols = await Protocol.find().populate('createdBy', 'name email');
        res.json(protocols);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// @desc    Get single protocol with active version
// @route   GET /api/protocols/:id
// @access  Private
exports.getProtocolById = async (req, res) => {
    try {
        const protocol = await Protocol.findById(req.params.id);
        if (!protocol) {
            return res.status(404).json({ error: 'Protocol not found' });
        }

        const activeVersion = await ProtocolVersion.findOne({
            protocolId: protocol._id,
            isActive: true,
        });

        const allVersions = await ProtocolVersion.find({ protocolId: protocol._id })
            .select('versionNumber isActive publishedAt createdAt')
            .sort({ versionNumber: -1 });

        res.json({
            protocol,
            activeVersion,
            versions: allVersions,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// @desc    Publish a new version of a protocol
// @route   POST /api/protocols/:id/versions
// @access  Private/Doctor
exports.publishVersion = async (req, res) => {
    try {
        const protocolId = req.params.id;
        const { nodes, branchRules } = req.body;

        const protocol = await Protocol.findById(protocolId);
        if (!protocol) {
            return res.status(404).json({ error: 'Protocol not found' });
        }

        // Optional: add authorization check to ensure only the creator or an admin can modify.
        // For now, any doctor can publish a version.

        // 1. Deactivate previously active versions
        await ProtocolVersion.updateMany(
            { protocolId, isActive: true },
            { $set: { isActive: false } }
        );

        // 2. Determine the next version number
        const latestVersion = await ProtocolVersion.findOne({ protocolId })
            .sort({ versionNumber: -1 });

        const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

        // 3. Create the new version
        const newVersion = await ProtocolVersion.create({
            protocolId,
            versionNumber: nextVersionNumber,
            isActive: true,
            publishedAt: new Date(),
            nodes: nodes || [],
            branchRules: branchRules || [],
        });

        res.status(201).json(newVersion);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// @desc    Get a specific version of a protocol
// @route   GET /api/protocols/:id/versions/:versionId
// @access  Private
exports.getVersion = async (req, res) => {
    try {
        const version = await ProtocolVersion.findOne({
            _id: req.params.versionId,
            protocolId: req.params.id,
        });

        if (!version) {
            return res.status(404).json({ error: 'Version not found' });
        }

        res.json(version);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// @desc    Delete a protocol and all associated versions/sessions
// @route   DELETE /api/protocols/:id
// @access  Private/Doctor
exports.deleteProtocol = async (req, res) => {
    try {
        const protocolId = req.params.id;
        const protocol = await Protocol.findById(protocolId);

        if (!protocol) {
            return res.status(404).json({ error: 'Protocol not found' });
        }

        // Make sure only the creator can delete it, or allow any doctor for this MVP
        if (protocol.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to delete this protocol' });
        }

        // 1. Delete all versions
        const versions = await ProtocolVersion.find({ protocolId });
        const versionIds = versions.map(v => v._id);
        await ProtocolVersion.deleteMany({ protocolId });

        // 2. Delete all sessions that used those versions
        await TriageSession.deleteMany({ versionId: { $in: versionIds } });

        // 3. Delete protocol itself
        await protocol.deleteOne();

        res.json({ message: 'Protocol removed' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
