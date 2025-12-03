#!/bin/bash
# Script to run SQL migrations using DATABASE_URL

if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL environment variable is not set"
    exit 1
fi

MIGRATION_FILE="$1"

if [ -z "$MIGRATION_FILE" ]; then
    echo "Usage: $0 <migration-file.sql>"
    exit 1
fi

if [ ! -f "$MIGRATION_FILE" ]; then
    echo "Error: Migration file not found: $MIGRATION_FILE"
    exit 1
fi

echo "Running migration: $MIGRATION_FILE"
echo "Connecting to database..."

# Use psql with the connection string
psql "$DATABASE_URL" -f "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
    echo "Migration completed successfully!"
else
    echo "Migration failed!"
    exit 1
fi

