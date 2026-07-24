#!/usr/bin/env bash
set -e

echo "Waiting for database to start..."
python -c "
import time
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.db.session import engine

max_tries = 30
wait_seconds = 2

for i in range(max_tries):
    try:
        with Session(engine) as session:
            session.execute(text('SELECT 1'))
        print('Database is ready!')
        break
    except Exception as e:
        print(f'Database not ready yet (attempt {i+1}/{max_tries}). Waiting {wait_seconds} seconds...')
        time.sleep(wait_seconds)
else:
    print('Failed to connect to the database after several attempts.')
    exit(1)
"

echo "Creating base tables via SQLAlchemy..."
python -c "from app.db.base import Base; from app.db.session import engine; Base.metadata.create_all(bind=engine)"

echo "Running Alembic migrations..."
alembic upgrade head
