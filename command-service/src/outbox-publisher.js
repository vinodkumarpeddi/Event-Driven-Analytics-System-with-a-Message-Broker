const amqplib = require('amqplib');
const pool = require('./db');

const EXCHANGE_NAME = 'events';
const POLL_INTERVAL = 1000; // Poll every 1 second

let channel = null;

async function connectBroker() {
    const brokerUrl = process.env.BROKER_URL;
    let retries = 0;
    const maxRetries = 10;

    while (retries < maxRetries) {
        try {
            const connection = await amqplib.connect(brokerUrl);
            channel = await connection.createChannel();

            // Declare a topic exchange
            await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

            console.log('[Outbox Publisher] Connected to RabbitMQ');
            return;
        } catch (err) {
            retries++;
            console.log(
                `[Outbox Publisher] Failed to connect to RabbitMQ (attempt ${retries}/${maxRetries}): ${err.message}`
            );
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }

    throw new Error('[Outbox Publisher] Could not connect to RabbitMQ after max retries');
}

async function publishPendingEvents() {
    if (!channel) return;

    const client = await pool.connect();
    try {
        // Select unpublished events
        const result = await client.query(
            'SELECT id, topic, payload FROM outbox WHERE published_at IS NULL ORDER BY created_at ASC LIMIT 100'
        );

        for (const row of result.rows) {
            try {
                // Publish to RabbitMQ exchange with topic as routing key
                channel.publish(
                    EXCHANGE_NAME,
                    row.topic,
                    Buffer.from(JSON.stringify(row.payload)),
                    { persistent: true, messageId: row.id }
                );

                // Mark as published
                await client.query(
                    'UPDATE outbox SET published_at = NOW() WHERE id = $1',
                    [row.id]
                );

                console.log(
                    `[Outbox Publisher] Published event: ${row.id} to topic: ${row.topic}`
                );
            } catch (err) {
                console.error(
                    `[Outbox Publisher] Failed to publish event ${row.id}:`,
                    err.message
                );
            }
        }
    } catch (err) {
        console.error('[Outbox Publisher] Error polling outbox:', err.message);
    } finally {
        client.release();
    }
}

async function startOutboxPublisher() {
    await connectBroker();

    // Start polling loop
    setInterval(publishPendingEvents, POLL_INTERVAL);
    console.log(
        `[Outbox Publisher] Started polling every ${POLL_INTERVAL}ms`
    );
}

module.exports = { startOutboxPublisher };
