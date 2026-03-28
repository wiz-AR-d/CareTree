const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// ---------------------
// Global Middleware
// ---------------------
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ---------------------
// Routes
// ---------------------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/protocols', require('./routes/protocols'));
app.use('/api/triage', require('./routes/triage'));
app.use('/api/sync', require('./routes/sync'));

// Root route for quick check
app.get('/', (req, res) => {
    res.send('careTree is live');
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'CareTree API', timestamp: new Date().toISOString() });
});

// ---------------------
// Global Error Handler
// ---------------------
app.use((err, req, res, next) => {
    // Handle invalid JSON parsing errors
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ error: 'Invalid JSON format: ' + err.message });
    }

    console.error('Unhandled Error:', err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

// ---------------------
// Start Server
// ---------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`CareTree API running on port ${PORT}`);
});

module.exports = app;
