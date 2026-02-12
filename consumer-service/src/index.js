const amqplib = require('amqplib');
const express = require('express');
const initReadDatabase = require('./init-db');
const { handleOrderCreated, handleProductCreated } = require('./handlers');

const EXCHANGE_NAME = 'events';
const QUEUE_NAME = 'consumer-queue';
const BINDING_KEYS = ['order-events', 'product-events'];

const app = express();
const HEALTH_PORT = 3000;

let isConnected = false;

async function connectAndConsume() {
    const brokerUrl = process.env.BROKER_URL;
    let retries = 0;
    const maxRetries = 15;

    while (retries < maxRetries) {
        try {
            const connection = await amqplib.connect(brokerUrl);
            const channel = await connection.createChannel();

            // Declare exchange
            await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

            // Declare queue with dead-letter exchange
            await channel.assertQueue(QUEUE_NAME, {
                durable: true,
                arguments: {
                    'x-dead-letter-exchange': `${EXCHANGE_NAME}.dlx`,
                },
            });

            // Declare dead-letter exchange and queue
            await channel.assertExchange(`${EXCHANGE_NAME}.dlx`, 'topic', { durable: true });
            await channel.assertQueue(`${QUEUE_NAME}.dlq`, { durable: true });
            await channel.bindQueue(`${QUEUE_NAME}.dlq`, `${EXCHANGE_NAME}.dlx`, '#');

            // Bind queue to exchange with routing keys
            for (const key of BINDING_KEYS) {
                await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, key);
            }

            // Prefetch 1 message at a time for fair dispatching
            await channel.prefetch(1);

            console.log(`[Consumer Service] Waiting for messages on queue: ${QUEUE_NAME}`);
            isConnected = true;

            channel.consume(QUEUE_NAME, async (msg) => {
                if (!msg) return;

                try {
                    const payload =
                        typeof JSON.parse(msg.content.toString()) === 'string'
                            ? JSON.parse(JSON.parse(msg.content.toString()))
                            : JSON.parse(msg.content.toString());

                    console.log(
                        `[Consumer Service] Received event: ${payload.eventType}, eventId: ${payload.eventId}`
                    );

                    switch (payload.eventType) {
                        case 'OrderCreated':
                            await handleOrderCreated(payload);
                            break;
                        case 'ProductCreated':
                            await handleProductCreated(payload);
                            break;
                        default:
                            console.log(
                                `[Consumer Service] Unknown event type: ${payload.eventType}`
                            );
                    }

                    channel.ack(msg);
                } catch (err) {
                    console.error('[Consumer Service] Error processing message:', err.message);
                    // Reject and requeue (up to broker retry/DLQ logic)
                    channel.nack(msg, false, false);
                }
            });

            // Handle connection close
            connection.on('close', () => {
                console.log('[Consumer Service] Connection closed, reconnecting...');
                isConnected = false;
                setTimeout(connectAndConsume, 5000);
            });

            return;
        } catch (err) {
            retries++;
            console.log(
                `[Consumer Service] Failed to connect (attempt ${retries}/${maxRetries}): ${err.message}`
            );
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }

    throw new Error('[Consumer Service] Could not connect to RabbitMQ after max retries');
}

async function start() {
    try {
        // Initialize read database tables
        await initReadDatabase();

        // Start health check server
        app.get('/health', (req, res) => {
            res.status(200).json({
                status: 'ok',
                service: 'consumer-service',
                connected: isConnected,
            });
        });

        app.listen(HEALTH_PORT, () => {
            console.log(`[Consumer Service] Health check on port ${HEALTH_PORT}`);
        });

        // Start consuming events
        await connectAndConsume();
    } catch (err) {
        console.error('[Consumer Service] Failed to start:', err.message);
        process.exit(1);
    }
}

start();
