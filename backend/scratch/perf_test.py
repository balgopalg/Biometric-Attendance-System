
import time
import os
import bcrypt
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

def measure_bcrypt():
    password = "Password123!"
    start = time.time()
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode(), salt)
    end = time.time()
    print(f"Bcrypt hash (12 rounds): {end - start:.4f}s")
    
    start = time.time()
    bcrypt.checkpw(password.encode(), hashed)
    end = time.time()
    print(f"Bcrypt check: {end - start:.4f}s")

def measure_mongo():
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/biometric_attendance")
    start = time.time()
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=2000)
    try:
        client.admin.command('ping')
        end = time.time()
        print(f"Mongo ping: {end - start:.4f}s")
    except Exception as e:
        print(f"Mongo error: {e}")

if __name__ == "__main__":
    measure_bcrypt()
    measure_mongo()
