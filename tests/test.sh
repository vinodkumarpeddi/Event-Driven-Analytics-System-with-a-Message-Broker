#!/bin/bash

# ============================================================
# E-Commerce Analytics System - Integration Test Script
# ============================================================
# Run this after: docker-compose up -d --build
# Wait ~30s for all services to become healthy before running.
# ============================================================

set -e

COMMAND_URL="http://localhost:8080"
QUERY_URL="http://localhost:8081"
PASS=0
FAIL=0

green() { echo -e "\033[0;32m$1\033[0m"; }
red() { echo -e "\033[0;31m$1\033[0m"; }
yellow() { echo -e "\033[0;33m$1\033[0m"; }

assert_status() {
  local expected=$1
  local actual=$2
  local test_name=$3
  if [ "$actual" -eq "$expected" ]; then
    green "  ✓ $test_name (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    red "  ✗ $test_name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "============================================"
echo "  E-Commerce Analytics - Integration Tests"
echo "============================================"
echo ""

# --------------------------------------------------
# Test 1: Health Checks
# --------------------------------------------------
echo "▸ Test 1: Health Checks"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$COMMAND_URL/health")
assert_status 200 "$STATUS" "Command Service /health"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$QUERY_URL/health")
assert_status 200 "$STATUS" "Query Service /health"

# --------------------------------------------------
# Test 2: Create Products
# --------------------------------------------------
echo ""
echo "▸ Test 2: Create Products"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$COMMAND_URL/api/products" \
  -H "Content-Type: application/json" \
  -d '{"name":"Wireless Mouse","category":"Electronics","price":29.99,"stock":100}')
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status 201 "$STATUS" "Create product 'Wireless Mouse'"
PRODUCT1_ID=$(echo "$BODY" | grep -o '"productId":[0-9]*' | grep -o '[0-9]*')
echo "    Product 1 ID: $PRODUCT1_ID"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$COMMAND_URL/api/products" \
  -H "Content-Type: application/json" \
  -d '{"name":"USB Keyboard","category":"Electronics","price":49.99,"stock":50}')
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status 201 "$STATUS" "Create product 'USB Keyboard'"
PRODUCT2_ID=$(echo "$BODY" | grep -o '"productId":[0-9]*' | grep -o '[0-9]*')
echo "    Product 2 ID: $PRODUCT2_ID"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$COMMAND_URL/api/products" \
  -H "Content-Type: application/json" \
  -d '{"name":"Running Shoes","category":"Sports","price":89.99,"stock":30}')
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status 201 "$STATUS" "Create product 'Running Shoes'"
PRODUCT3_ID=$(echo "$BODY" | grep -o '"productId":[0-9]*' | grep -o '[0-9]*')
echo "    Product 3 ID: $PRODUCT3_ID"

# --------------------------------------------------
# Test 3: Create Orders
# --------------------------------------------------
echo ""
echo "▸ Test 3: Create Orders"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$COMMAND_URL/api/orders" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":1,\"items\":[{\"productId\":$PRODUCT1_ID,\"quantity\":2,\"price\":29.99}]}")
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status 201 "$STATUS" "Create order for customer 1 (2x Wireless Mouse)"
ORDER1_ID=$(echo "$BODY" | grep -o '"orderId":[0-9]*' | grep -o '[0-9]*')
echo "    Order 1 ID: $ORDER1_ID"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$COMMAND_URL/api/orders" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":1,\"items\":[{\"productId\":$PRODUCT2_ID,\"quantity\":1,\"price\":49.99}]}")
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status 201 "$STATUS" "Create order for customer 1 (1x USB Keyboard)"
ORDER2_ID=$(echo "$BODY" | grep -o '"orderId":[0-9]*' | grep -o '[0-9]*')
echo "    Order 2 ID: $ORDER2_ID"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$COMMAND_URL/api/orders" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":2,\"items\":[{\"productId\":$PRODUCT3_ID,\"quantity\":1,\"price\":89.99}]}")
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status 201 "$STATUS" "Create order for customer 2 (1x Running Shoes)"

# --------------------------------------------------
# Test 4: Stock Validation
# --------------------------------------------------
echo ""
echo "▸ Test 4: Stock Validation"

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$COMMAND_URL/api/orders" \
  -H "Content-Type: application/json" \
  -d "{\"customerId\":3,\"items\":[{\"productId\":$PRODUCT1_ID,\"quantity\":9999,\"price\":29.99}]}")
STATUS=$(echo "$RESPONSE" | tail -1)
assert_status 400 "$STATUS" "Reject order with insufficient stock"

# --------------------------------------------------
# Wait for event propagation
# --------------------------------------------------
echo ""
yellow "▸ Waiting 10 seconds for event processing..."
sleep 10

# --------------------------------------------------
# Test 5: Product Sales Analytics
# --------------------------------------------------
echo ""
echo "▸ Test 5: Product Sales Analytics"

RESPONSE=$(curl -s -w "\n%{http_code}" "$QUERY_URL/api/analytics/products/$PRODUCT1_ID/sales")
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status 200 "$STATUS" "GET product sales for product $PRODUCT1_ID"
echo "    Response: $BODY"

# --------------------------------------------------
# Test 6: Category Revenue
# --------------------------------------------------
echo ""
echo "▸ Test 6: Category Revenue"

RESPONSE=$(curl -s -w "\n%{http_code}" "$QUERY_URL/api/analytics/categories/Electronics/revenue")
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status 200 "$STATUS" "GET category revenue for Electronics"
echo "    Response: $BODY"

# --------------------------------------------------
# Test 7: Customer Lifetime Value
# --------------------------------------------------
echo ""
echo "▸ Test 7: Customer Lifetime Value"

RESPONSE=$(curl -s -w "\n%{http_code}" "$QUERY_URL/api/analytics/customers/1/lifetime-value")
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status 200 "$STATUS" "GET customer 1 lifetime value"
echo "    Response: $BODY"

# --------------------------------------------------
# Test 8: Sync Status
# --------------------------------------------------
echo ""
echo "▸ Test 8: Sync Status"

RESPONSE=$(curl -s -w "\n%{http_code}" "$QUERY_URL/api/analytics/sync-status")
STATUS=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)
assert_status 200 "$STATUS" "GET sync status"
echo "    Response: $BODY"

# --------------------------------------------------
# Summary
# --------------------------------------------------
echo ""
echo "============================================"
echo "  Results: $PASS passed, $FAIL failed"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
