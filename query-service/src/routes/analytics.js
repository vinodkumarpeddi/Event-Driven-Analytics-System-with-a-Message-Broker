const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/analytics/products/:productId/sales
router.get('/products/:productId/sales', async (req, res) => {
    const { productId } = req.params;

    try {
        const result = await pool.query(
            'SELECT product_id, total_quantity_sold, total_revenue, order_count FROM product_sales_view WHERE product_id = $1',
            [parseInt(productId)]
        );

        if (result.rows.length === 0) {
            return res.status(200).json({
                productId: parseInt(productId),
                totalQuantitySold: 0,
                totalRevenue: 0,
                orderCount: 0,
            });
        }

        const row = result.rows[0];
        res.status(200).json({
            productId: row.product_id,
            totalQuantitySold: row.total_quantity_sold,
            totalRevenue: parseFloat(row.total_revenue),
            orderCount: row.order_count,
        });
    } catch (err) {
        console.error('[Query Service] Error fetching product sales:', err.message);
        res.status(500).json({ error: 'Failed to fetch product sales' });
    }
});

// GET /api/analytics/categories/:category/revenue
router.get('/categories/:category/revenue', async (req, res) => {
    const { category } = req.params;

    try {
        const result = await pool.query(
            'SELECT category_name, total_revenue, total_orders FROM category_metrics_view WHERE category_name = $1',
            [category]
        );

        if (result.rows.length === 0) {
            return res.status(200).json({
                category,
                totalRevenue: 0,
                totalOrders: 0,
            });
        }

        const row = result.rows[0];
        res.status(200).json({
            category: row.category_name,
            totalRevenue: parseFloat(row.total_revenue),
            totalOrders: row.total_orders,
        });
    } catch (err) {
        console.error('[Query Service] Error fetching category revenue:', err.message);
        res.status(500).json({ error: 'Failed to fetch category revenue' });
    }
});

// GET /api/analytics/customers/:customerId/lifetime-value
router.get('/customers/:customerId/lifetime-value', async (req, res) => {
    const { customerId } = req.params;

    try {
        const result = await pool.query(
            'SELECT customer_id, total_spent, order_count, last_order_date FROM customer_ltv_view WHERE customer_id = $1',
            [parseInt(customerId)]
        );

        if (result.rows.length === 0) {
            return res.status(200).json({
                customerId: parseInt(customerId),
                totalSpent: 0,
                orderCount: 0,
                lastOrderDate: null,
            });
        }

        const row = result.rows[0];
        res.status(200).json({
            customerId: row.customer_id,
            totalSpent: parseFloat(row.total_spent),
            orderCount: row.order_count,
            lastOrderDate: row.last_order_date
                ? new Date(row.last_order_date).toISOString()
                : null,
        });
    } catch (err) {
        console.error('[Query Service] Error fetching customer LTV:', err.message);
        res.status(500).json({ error: 'Failed to fetch customer lifetime value' });
    }
});

// GET /api/analytics/sync-status
router.get('/sync-status', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT MAX(processed_at) as last_processed FROM processed_events'
        );

        const lastProcessed = result.rows[0]?.last_processed;
        const now = new Date();

        let lagSeconds = null;
        let lastProcessedEventTimestamp = null;

        if (lastProcessed) {
            lastProcessedEventTimestamp = new Date(lastProcessed).toISOString();
            lagSeconds = Math.round((now.getTime() - new Date(lastProcessed).getTime()) / 1000);
        }

        res.status(200).json({
            lastProcessedEventTimestamp,
            lagSeconds: lagSeconds !== null ? lagSeconds : null,
        });
    } catch (err) {
        console.error('[Query Service] Error fetching sync status:', err.message);
        res.status(500).json({ error: 'Failed to fetch sync status' });
    }
});

module.exports = router;
