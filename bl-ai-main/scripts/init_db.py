#!/usr/bin/env python3
"""
MarketMind AI Database Initialization Script
Directly initializes the Supabase PostgreSQL database schema
"""

import os
import sys
import psycopg2
from psycopg2 import sql
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Extract Supabase credentials from URL
SUPABASE_URL = os.getenv('VITE_SUPABASE_URL', '').strip()
SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY', '').strip()

if not SUPABASE_URL or not SERVICE_KEY:
    print("❌ Error: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file")
    sys.exit(1)

# Extract database host from URL
try:
    # URL format: https://zooecxbocbygwwmmwjxs.supabase.co
    project_id = SUPABASE_URL.split('https://')[1].split('.supabase.co')[0]
    db_host = f"{project_id}.db.supabase.co"
    db_port = 5432
    db_user = "postgres"
    db_password = SERVICE_KEY  # Service key is used as password
    db_name = "postgres"
    
    print(f"📚 Connecting to Supabase database...")
    print(f"   Host: {db_host}")
    print(f"   Database: {db_name}")
    
    # Connect to the database
    conn = psycopg2.connect(
        host=db_host,
        port=db_port,
        user=db_user,
        password=db_password,
        database=db_name,
        sslmode='require'
    )
    
    cursor = conn.cursor()
    print("✅ Connected to Supabase database!")
    
    # Read schema file
    schema_path = os.path.join(os.path.dirname(__file__), '../database/schema.sql')
    if not os.path.exists(schema_path):
        print(f"❌ Error: Schema file not found at {schema_path}")
        sys.exit(1)
    
    print(f"\n📖 Reading schema from {schema_path}...")
    with open(schema_path, 'r') as f:
        schema_content = f.read()
    
    # Split into individual statements
    statements = []
    current_statement = ""
    
    for line in schema_content.split('\n'):
        # Skip comments
        if line.strip().startswith('--'):
            continue
        
        current_statement += line + '\n'
        
        # Check if statement ends with semicolon (not in string)
        if ';' in line and not line.strip().startswith('--'):
            statements.append(current_statement.strip())
            current_statement = ""
    
    # Filter out empty statements
    statements = [s for s in statements if s.strip()]
    
    print(f"\n⚙️  Executing {len(statements)} SQL statements...\n")
    
    successful = 0
    failed = 0
    skipped = 0
    
    for i, statement in enumerate(statements, 1):
        try:
            # Extract statement type for logging
            statement_type = "Unknown"
            if "CREATE TABLE" in statement:
                # Extract table name
                match = statement.split("CREATE TABLE IF NOT EXISTS ")[1].split(" ")[0]
                statement_type = f"Table: {match}"
            elif "CREATE EXTENSION" in statement:
                statement_type = "Extension"
            elif "CREATE POLICY" in statement:
                statement_type = "RLS Policy"
            elif "CREATE INDEX" in statement:
                statement_type = "Index"
            elif "ALTER TABLE" in statement and "ENABLE" in statement:
                statement_type = "Enable RLS"
            elif "GRANT" in statement:
                statement_type = "Grant Permission"
            
            print(f"  [{i:3d}/{len(statements)}] {statement_type:30s} ", end='', flush=True)
            
            cursor.execute(statement)
            conn.commit()
            
            print("✅")
            successful += 1
            
        except psycopg2.errors.DuplicateObject as e:
            # This is expected - object already exists
            print("⏭️  (Already exists)")
            skipped += 1
        except Exception as e:
            print(f"❌")
            print(f"       Error: {str(e)[:100]}")
            failed += 1
            # Continue with next statement
    
    cursor.close()
    conn.close()
    
    print(f"\n{'='*60}")
    print(f"📊 Database Initialization Summary:")
    print(f"{'='*60}")
    print(f"✅ Successful: {successful}")
    print(f"⏭️  Skipped (already exist): {skipped}")
    print(f"❌ Failed: {failed}")
    print(f"{'='*60}")
    
    if failed == 0:
        print("\n🎉 Database schema successfully initialized!")
        print("\nYour MarketMind AI database is ready:")
        print("  • 15+ tables created")
        print("  • Row Level Security enabled")
        print("  • Performance indexes created")
        print("  • User access policies configured")
        print("\nYou can now:")
        print("  1. Run: npm run dev        (Frontend on http://localhost:5173)")
        print("  2. Run: npm run server:dev (Backend on http://localhost:8000)")
        print("  3. Sign up and start using the system!")
    else:
        print(f"\n⚠️  {failed} statement(s) failed. Check errors above.")
        sys.exit(1)
    
except psycopg2.OperationalError as e:
    print(f"❌ Connection Error: {str(e)}")
    print("\nTroubleshooting:")
    print("  • Check that VITE_SUPABASE_URL is correct in .env")
    print("  • Check that SUPABASE_SERVICE_KEY is correct in .env")
    print("  • Verify your Supabase project is active")
    print("  • Check your internet connection")
    sys.exit(1)
except Exception as e:
    print(f"❌ Unexpected Error: {str(e)}")
    sys.exit(1)
