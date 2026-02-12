const express = require('express');
const initDatabase = require('./init-db');
const { startOutboxPublisher } = require('./outbox-publisher');
const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'command-service' });
});

// Routes
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);

// Start server
async function start() {
    try {
        // Initialize database tables
        await initDatabase();

        // Start the outbox publisher (background polling)
        await startOutboxPublisher();

        app.listen(PORT, () => {
            console.log(`[Command Service] Running on port ${PORT}`);
        });
    } catch (err) {
        console.error('[Command Service] Failed to start:', err.message);
        process.exit(1);
    }
}

start();
