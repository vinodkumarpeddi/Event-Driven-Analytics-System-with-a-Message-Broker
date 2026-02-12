const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');

const router = express.Router();

// POST /api/orders - Create a new order
router.post('/', async (req, res) => {
    const { customerId, items } = req.body;

    // Validation
    if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            error: 'Missing required fields: customerId, items (non-empty array)',
        });
    }

    for (const item of items) {
        if (!item.productId || !item.quantity || item.price == null) {
            return res.status(400).json({
                error: 'Each item must have productId, quantity, and price',
            });
        }
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
            return res.status(400).json({
                error: 'Item quantity must be a positive integer',
            });
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Validate stock for all products
        for (const item of items) {
            const productResult = await client.query(
                'SELECT id, stock, category, name FROM products WHERE id = $1 FOR UPDATE',
                [item.productId]
            );

            if (productResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({
                    error: `Product with id ${item.productId} not found`,
                });
            }

            const product = productResult.rows[0];
            if (product.stock < item.quantity) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`,
                });
            }
        }

        // Calculate total
        const total = items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
        );

        // Insert order
        const orderResult = await client.query(
            'INSERT INTO orders (customer_id, total, status) VALUES ($1, $2, $3) RETURNING id, created_at',
            [customerId, total, 'created']
        );

        const order = orderResult.rows[0];

        // Insert order items and decrement stock
        const orderItems = [];
        for (const item of items) {
            await client.query(
                'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
                [order.id, item.productId, item.quantity, item.price]
            );

            await client.query(
                'UPDATE products SET stock = stock - $1 WHERE id = $2',
                [item.quantity, item.productId]
            );

            // Fetch product category for the event payload
            const productResult = await client.query(
                'SELECT category, name FROM products WHERE id = $1',
                [item.productId]
            );

            orderItems.push({
                productId: item.productId,
                productName: productResult.rows[0].name,
                category: productResult.rows[0].category,
                quantity: item.quantity,
                price: item.price,
            });
        }

        // Write OrderCreated event to outbox
        const eventId = uuidv4();
        await client.query(
            'INSERT INTO outbox (id, topic, payload) VALUES ($1, $2, $3)',
            [
                eventId,
                'order-events',
                JSON.stringify({
                    eventType: 'OrderCreated',
                    eventId,
                    orderId: order.id,
                    customerId,
                    items: orderItems,
                    total: parseFloat(total.toFixed(2)),
                    timestamp: order.created_at.toISOString(),
                }),
            ]
        );

        await client.query('COMMIT');

        console.log(
            `[Command Service] Order created: id=${order.id}, customer=${customerId}, total=${total}`
        );

        res.status(201).json({ orderId: order.id });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Command Service] Error creating order:', err.message);
        res.status(500).json({ error: 'Failed to create order' });
    } finally {
        client.release();
    }
});

module.exports = router;
