# Data Flow Diagram

```
                    ┌─────────────────────────────────────────────────────┐
                    │                   WRITE SIDE                        │
                    │                                                     │
   HTTP POST        │  ┌──────────────────────────────┐                   │
  ──────────────────┼─▶│      Command Service         │                   │
  /api/products     │  │        (Port 8080)            │                   │
  /api/orders       │  │                               │                   │
                    │  │  ┌─────────┐  ┌───────────┐  │                   │
                    │  │  │Validate │─▶│ DB Write + │  │                   │
                    │  │  │ Input   │  │ Outbox     │  │                   │
                    │  │  └─────────┘  └─────┬─────┘  │                   │
                    │  └─────────────────────┼────────┘                   │
                    │                        │                            │
                    │                        ▼                            │
                    │  ┌─────────────────────────────┐                    │
                    │  │       Write Database         │                    │
                    │  │      (PostgreSQL)            │                    │
                    │  │                              │                    │
                    │  │  products | orders           │                    │
                    │  │  order_items | outbox        │                    │
                    │  └────────────┬────────────────┘                    │
                    │               │                                     │
                    │               │ Poll (every 1s)                     │
                    │               ▼                                     │
                    │  ┌─────────────────────────┐                        │
                    │  │   Outbox Publisher       │                        │
                    │  │   (background process)   │                        │
                    │  └──────────┬──────────────┘                        │
                    └─────────────┼────────────────────────────────────────┘
                                  │
                                  │ Publish events
                                  ▼
                    ┌─────────────────────────────┐
                    │        RabbitMQ             │
                    │     Message Broker          │
                    │                             │
                    │  Exchange: events (topic)   │
                    │  Queue: consumer-queue      │
                    │  DLQ: consumer-queue.dlq    │
                    └──────────┬──────────────────┘
                               │
                               │ Consume events
                               ▼
                    ┌─────────────────────────────────────────────────────┐
                    │                   READ SIDE                         │
                    │                                                     │
                    │  ┌──────────────────────────────┐                   │
                    │  │     Consumer Service          │                   │
                    │  │                               │                   │
                    │  │  ┌──────────┐  ┌──────────┐  │                   │
                    │  │  │Idempotent│─▶│  Update   │  │                   │
                    │  │  │  Check   │  │  Views    │  │                   │
                    │  │  └──────────┘  └─────┬────┘  │                   │
                    │  └──────────────────────┼───────┘                   │
                    │                         │                           │
                    │                         ▼                           │
                    │  ┌─────────────────────────────┐                    │
                    │  │       Read Database          │                    │
                    │  │      (PostgreSQL)            │                    │
                    │  │                              │                    │
                    │  │  product_sales_view          │                    │
                    │  │  category_metrics_view       │                    │
                    │  │  customer_ltv_view           │                    │
                    │  │  hourly_sales_view           │                    │
                    │  │  processed_events            │                    │
                    │  └───────────┬─────────────────┘                    │
                    │              │                                      │
                    │              │ SELECT                               │
                    │              ▼                                      │
                    │  ┌──────────────────────────────┐                   │
                    │  │      Query Service           │                   │
   HTTP GET         │  │       (Port 8081)            │                   │
  ◀─────────────────┼──│                              │                   │
  /api/analytics/*  │  │  Simple reads from views    │                   │
                    │  └──────────────────────────────┘                   │
                    └─────────────────────────────────────────────────────┘
```

## Event Types

| Event            | Source               | Consumers                               |
|------------------|----------------------|-----------------------------------------|
| `ProductCreated` | POST /api/products   | Logged for idempotency                  |
| `OrderCreated`   | POST /api/orders     | Updates all 4 materialized views        |

## Materialized Views

| View                    | Updated By      | Queried By                                  |
|-------------------------|-----------------|---------------------------------------------|
| `product_sales_view`    | `OrderCreated`  | `GET /api/analytics/products/:id/sales`     |
| `category_metrics_view` | `OrderCreated`  | `GET /api/analytics/categories/:cat/revenue`|
| `customer_ltv_view`     | `OrderCreated`  | `GET /api/analytics/customers/:id/ltv`      |
| `hourly_sales_view`     | `OrderCreated`  | (Available for custom queries)              |
