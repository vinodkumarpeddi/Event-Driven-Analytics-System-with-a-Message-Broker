const express = require('express');
const analyticsRouter = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 8081;

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'query-service' });
});

// Routes
app.use('/api/analytics', analyticsRouter);

// Start server
app.listen(PORT, () => {
    console.log(`[Query Service] Running on port ${PORT}`);
});
