require('dotenv').config();
const mongoose = require('mongoose');
const ProtocolVersion = require('./models/ProtocolVersion');

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        const versions = await ProtocolVersion.find({
            "nodes.content": { $regex: /patient/i }
        });
        console.log(`Found ${versions.length} versions with the word patient.`);
        for (const v of versions) {
            const node = v.nodes.find(n => n.content.toLowerCase().includes('patient'));
            if (node && node.content) {
               console.log(`Node Content: ${node.content}`);
            }
        }
        process.exit(0);
    });
