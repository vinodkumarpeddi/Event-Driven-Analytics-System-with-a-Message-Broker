const pool = require('./db');

async function initReadDatabase() {
    const client = await pool.connect();
    try {
        // Product sales materialized view
        await client.query(`
      CREATE TABLE IF NOT EXISTS product_sales_view (
        product_id INTEGER PRIMARY KEY,
        total_quantity_sold INTEGER NOT NULL DEFAULT 0,
        total_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
        order_count INTEGER NOT NULL DEFAULT 0
      );
    `);

        // Category metrics materialized view
        await client.query(`
      CREATE TABLE IF NOT EXISTS category_metrics_view (
        category_name VARCHAR(255) PRIMARY KEY,
        total_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
        total_orders INTEGER NOT NULL DEFAULT 0
      );
    `);

        // Customer lifetime value view
        await client.query(`
      CREATE TABLE IF NOT EXISTS customer_ltv_view (
        customer_id INTEGER PRIMARY KEY,
        total_spent NUMERIC(12, 2) NOT NULL DEFAULT 0,
        order_count INTEGER NOT NULL DEFAULT 0,
        last_order_date TIMESTAMP NULL
      );
    `);

        // Hourly sales view
        await client.query(`
      CREATE TABLE IF NOT EXISTS hourly_sales_view (
        hour_timestamp TIMESTAMP PRIMARY KEY,
        total_orders INTEGER NOT NULL DEFAULT 0,
        total_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0
      );
    `);

        // Processed events table for idempotency
        await client.query(`
      CREATE TABLE IF NOT EXISTS processed_events (
        event_id UUID PRIMARY KEY,
        processed_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

        console.log('[Consumer Service] Read database tables initialized successfully');
    } finally {
        client.release();
    }
}

module.exports = initReadDatabase;
