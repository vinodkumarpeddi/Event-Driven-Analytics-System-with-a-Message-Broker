const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

const router = express.Router();

// POST /api/products - Create a new product
router.post('/', async (req, res) => {
    const { name, category, price, stock } = req.body;

    // Validation
    if (!name || !category || price == null || stock == null) {
        return res.status(400).json({
            error: 'Missing required fields: name, category, price, stock',
        });
    }

    if (typeof price !== 'number' || price < 0) {
        return res.status(400).json({ error: 'Price must be a non-negative number' });
    }

    if (!Number.isInteger(stock) || stock < 0) {
        return res.status(400).json({ error: 'Stock must be a non-negative integer' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Insert product
        const productResult = await client.query(
            'INSERT INTO products (name, category, price, stock) VALUES ($1, $2, $3, $4) RETURNING id, created_at',
            [name, category, price, stock]
        );

        const product = productResult.rows[0];
        const eventId = uuidv4();

        // Write ProductCreated event to outbox
        await client.query(
            'INSERT INTO outbox (id, topic, payload) VALUES ($1, $2, $3)',
            [
                eventId,
                'product-events',
                JSON.stringify({
                    eventType: 'ProductCreated',
                    eventId,
                    productId: product.id,
                    name,
                    category,
                    price,
                    stock,
                    timestamp: product.created_at.toISOString(),
                }),
            ]
        );

        await client.query('COMMIT');

        console.log(`[Command Service] Product created: id=${product.id}, name=${name}`);

        res.status(201).json({ productId: product.id });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Command Service] Error creating product:', err.message);
        res.status(500).json({ error: 'Failed to create product' });
    } finally {
        client.release();
    }
});

module.exports = router;
