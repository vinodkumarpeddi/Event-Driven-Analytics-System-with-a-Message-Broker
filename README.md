# E-Commerce Analytics System — CQRS + Event-Driven Architecture

A high-performance e-commerce analytics backend built with **CQRS** (Command Query Responsibility Segregation) and an **Event-Driven Architecture**. The system separates write and read operations, using a message broker for asynchronous communication and materialized views for optimized querying.

![Architecture](docs/data-flow.md)

---

## Architecture Overview

```
┌──────────────┐    ┌───────────────────┐    ┌──────────────┐
│   Client     │───▶│ Command Service   │───▶│  Write DB    │
│              │    │ (Port 8080)       │    │ (PostgreSQL) │
└──────────────┘    └───────┬───────────┘    └──────────────┘
                            │ Outbox Publisher
                            ▼
                    ┌───────────────────┐
                    │    RabbitMQ       │
                    │  Message Broker   │
                    └───────┬───────────┘
                            │
                            ▼
                    ┌───────────────────┐    ┌──────────────┐
                    │ Consumer Service  │───▶│   Read DB    │
                    │                   │    │ (PostgreSQL) │
                    └───────────────────┘    └──────┬───────┘
                                                    │
┌──────────────┐    ┌───────────────────┐           │
│   Client     │───▶│  Query Service    │───────────┘
│              │    │  (Port 8081)      │
└──────────────┘    └───────────────────┘
```

### Key Design Patterns

- **CQRS**: Separate write model (normalized) and read models (denormalized materialized views)
- **Transactional Outbox**: Events are written to an outbox table in the same DB transaction as business data, guaranteeing at-least-once delivery
- **Materialized Views**: Pre-computed analytics views optimized for fast reads
- **Idempotent Consumers**: Duplicate event processing is prevented via a `processed_events` table
- **Dead-Letter Queue (DLQ)**: Failed messages are routed to a DLQ for inspection

---

## Tech Stack

| Component       | Technology          |
|-----------------|---------------------|
| Command Service | Node.js, Express    |
| Query Service   | Node.js, Express    |
| Consumer Service| Node.js, amqplib    |
| Write Database  | PostgreSQL 14       |
| Read Database   | PostgreSQL 14       |
| Message Broker  | RabbitMQ 3          |
| Containerization| Docker, Docker Compose |

---

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed

### Run the System

```bash
# Clone the repository
git clone <repo-url>
cd MessageBroker

# Start all services
docker-compose up --build
```

All services will start automatically:
- **Command Service**: http://localhost:8080
- **Query Service**: http://localhost:8081
- **RabbitMQ Management UI**: http://localhost:15672 (guest/guest)

### Verify Health

```bash
curl http://localhost:8080/health
curl http://localhost:8081/health
```

---

## API Reference

### Command Service (Port 8080)

#### Create Product
```bash
POST /api/products
Content-Type: application/json

{
  "name": "Wireless Mouse",
  "category": "Electronics",
  "price": 29.99,
  "stock": 100
}

# Response: 201 Created
{ "productId": 1 }
```

#### Create Order
```bash
POST /api/orders
Content-Type: application/json

{
  "customerId": 1,
  "items": [
    { "productId": 1, "quantity": 2, "price": 29.99 }
  ]
}

# Response: 201 Created
{ "orderId": 1 }
```

### Query Service (Port 8081)

#### Product Sales Analytics
```bash
GET /api/analytics/products/{productId}/sales

# Response: 200 OK
{
  "productId": 1,
  "totalQuantitySold": 2,
  "totalRevenue": 59.98,
  "orderCount": 1
}
```

#### Category Revenue
```bash
GET /api/analytics/categories/{category}/revenue

# Response: 200 OK
{
  "category": "Electronics",
  "totalRevenue": 59.98,
  "totalOrders": 1
}
```

#### Customer Lifetime Value
```bash
GET /api/analytics/customers/{customerId}/lifetime-value

# Response: 200 OK
{
  "customerId": 1,
  "totalSpent": 59.98,
  "orderCount": 1,
  "lastOrderDate": "2024-01-15T10:30:00.000Z"
}
```

#### Sync Status
```bash
GET /api/analytics/sync-status

# Response: 200 OK
{
  "lastProcessedEventTimestamp": "2024-01-15T10:30:05.000Z",
  "lagSeconds": 3
}
```

---

## Database Schemas

### Write Model (Normalized)

| Table          | Description                                    |
|----------------|------------------------------------------------|
| `products`     | Product catalog (id, name, category, price, stock) |
| `orders`       | Order metadata (id, customer_id, total, status) |
| `order_items`  | Line items linking orders to products           |
| `outbox`       | Transactional outbox for reliable event publishing |

### Read Model (Denormalized — Materialized Views)

| View                    | Description                          |
|-------------------------|--------------------------------------|
| `product_sales_view`    | Per-product sales aggregations       |
| `category_metrics_view` | Per-category revenue & order counts  |
| `customer_ltv_view`     | Customer lifetime value metrics      |
| `hourly_sales_view`     | Time-bucketed sales aggregations     |
| `processed_events`      | Idempotency tracking                 |

---

## Event Flow

1. Client sends a `POST` command (create product/order)
2. **Command Service** validates the request and writes to the **Write DB** + **Outbox** in a single transaction
3. **Outbox Publisher** (background process) polls the outbox table every 1s, publishes messages to **RabbitMQ**, and marks them as published
4. **Consumer Service** receives the event, checks idempotency, and updates all relevant **materialized views** in the **Read DB**
5. **Query Service** reads from the materialized views to serve fast analytics queries

---

## Environment Variables

See [.env.example](.env.example) for all configuration options.

---

## Testing

Run the automated test script after starting the system:

```bash
# Start the system
docker-compose up -d --build

# Wait for services to be healthy
sleep 30

# Run tests
bash tests/test.sh
```

---

## Project Structure

```
MessageBroker/
├── docker-compose.yml          # Infrastructure orchestration
├── .env.example                # Environment variable documentation
├── submission.json             # Evaluation config
├── README.md                   # This file
├── command-service/            # Write operations service
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── app.js              # Entry point
│       ├── db.js               # DB connection pool
│       ├── init-db.js          # Write schema initialization
│       ├── outbox-publisher.js # Background event publisher
│       └── routes/
│           ├── products.js     # POST /api/products
│           └── orders.js       # POST /api/orders
├── consumer-service/           # Event processing service
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js            # Entry point + RabbitMQ consumer
│       ├── db.js               # DB connection pool
│       ├── init-db.js          # Read schema initialization
│       └── handlers.js         # Event handlers (idempotent)
├── query-service/              # Read operations service
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── app.js              # Entry point
│       ├── db.js               # DB connection pool
│       └── routes/
│           └── analytics.js    # GET analytics endpoints
└── tests/
    └── test.sh                 # Automated integration tests
```

---

## License

MIT
