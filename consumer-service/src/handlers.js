const pool = require('./db');

/**
 * Check if an event has already been processed (idempotency guard)
 */
async function isEventProcessed(client, eventId) {
    const result = await client.query(
        'SELECT event_id FROM processed_events WHERE event_id = $1',
        [eventId]
    );
    return result.rows.length > 0;
}

/**
 * Mark an event as processed
 */
async function markEventProcessed(client, eventId) {
    await client.query(
        'INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING',
        [eventId]
    );
}

/**
 * Handle OrderCreated events — updates all 4 materialized views
 */
async function handleOrderCreated(payload) {
    const { eventId, orderId, customerId, items, total, timestamp } = payload;

    const client = await pool.connect();
    try {
        // Idempotency check
        if (await isEventProcessed(client, eventId)) {
            console.log(`[Consumer] Event ${eventId} already processed, skipping`);
            return;
        }

        await client.query('BEGIN');

        // 1. Update product_sales_view for each item
        for (const item of items) {
            const itemRevenue = item.price * item.quantity;
            await client.query(
                `INSERT INTO product_sales_view (product_id, total_quantity_sold, total_revenue, order_count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (product_id)
         DO UPDATE SET
           total_quantity_sold = product_sales_view.total_quantity_sold + $2,
           total_revenue = product_sales_view.total_revenue + $3,
           order_count = product_sales_view.order_count + 1`,
                [item.productId, item.quantity, itemRevenue]
            );
        }

        // 2. Update category_metrics_view
        // Group items by category to avoid duplicate key updates
        const categoryMap = {};
        for (const item of items) {
            const category = item.category;
            if (!categoryMap[category]) {
                categoryMap[category] = { revenue: 0, orders: 0 };
            }
            categoryMap[category].revenue += item.price * item.quantity;
            categoryMap[category].orders = 1; // Count as 1 order per category per order
        }

        for (const [category, stats] of Object.entries(categoryMap)) {
            await client.query(
                `INSERT INTO category_metrics_view (category_name, total_revenue, total_orders)
         VALUES ($1, $2, $3)
         ON CONFLICT (category_name)
         DO UPDATE SET
           total_revenue = category_metrics_view.total_revenue + $2,
           total_orders = category_metrics_view.total_orders + $3`,
                [category, stats.revenue, stats.orders]
            );
        }

        // 3. Update customer_ltv_view
        await client.query(
            `INSERT INTO customer_ltv_view (customer_id, total_spent, order_count, last_order_date)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (customer_id)
       DO UPDATE SET
         total_spent = customer_ltv_view.total_spent + $2,
         order_count = customer_ltv_view.order_count + 1,
         last_order_date = GREATEST(customer_ltv_view.last_order_date, $3)`,
            [customerId, total, timestamp]
        );

        // 4. Update hourly_sales_view
        const orderDate = new Date(timestamp);
        const hourTimestamp = new Date(
            orderDate.getFullYear(),
            orderDate.getMonth(),
            orderDate.getDate(),
            orderDate.getHours(),
            0,
            0,
            0
        );

        await client.query(
            `INSERT INTO hourly_sales_view (hour_timestamp, total_orders, total_revenue)
       VALUES ($1, 1, $2)
       ON CONFLICT (hour_timestamp)
       DO UPDATE SET
         total_orders = hourly_sales_view.total_orders + 1,
         total_revenue = hourly_sales_view.total_revenue + $2`,
            [hourTimestamp.toISOString(), total]
        );

        // Mark event as processed
        await markEventProcessed(client, eventId);

        await client.query('COMMIT');

        console.log(
            `[Consumer] Processed OrderCreated event: orderId=${orderId}, eventId=${eventId}`
        );
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(
            `[Consumer] Error processing OrderCreated event ${eventId}:`,
            err.message
        );
        throw err; // re-throw to nack the message
    } finally {
        client.release();
    }
}

/**
 * Handle ProductCreated events — currently a no-op for read models
 * but logged for traceability
 */
async function handleProductCreated(payload) {
    const { eventId, productId, name, category } = payload;

    const client = await pool.connect();
    try {
        if (await isEventProcessed(client, eventId)) {
            console.log(`[Consumer] Event ${eventId} already processed, skipping`);
            return;
        }

        await client.query('BEGIN');
        await markEventProcessed(client, eventId);
        await client.query('COMMIT');

        console.log(
            `[Consumer] Processed ProductCreated event: productId=${productId}, name=${name}`
        );
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(
            `[Consumer] Error processing ProductCreated event ${eventId}:`,
            err.message
        );
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { handleOrderCreated, handleProductCreated };
