
import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/biometric_attendance")
db_auth_name = os.getenv("MONGO_DB_AUTH", "biometric_auth")

client = MongoClient(mongo_uri)
db = client[db_auth_name]

cols = ["failed_login_attempts", "ip_rate_limits"]

for col_name in cols:
    col = db[col_name]
    count = col.count_documents({})
    print(f"Collection: {col_name}")
    print(f"  Count: {count}")
    print(f"  Indexes: {list(col.index_information().keys())}")

client.close()
