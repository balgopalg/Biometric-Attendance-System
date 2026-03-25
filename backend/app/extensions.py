"""Shared Flask extensions — initialised once, imported everywhere."""

from flask import current_app
from flask_pymongo import PyMongo
from flask_jwt_extended import JWTManager
from flask_cors import CORS

mongo = PyMongo()
jwt = JWTManager()
cors = CORS()


DB_ALIAS_TO_CONFIG = {
    "auth": "MONGO_DB_AUTH",
    "academic": "MONGO_DB_ACADEMIC",
    "attendance": "MONGO_DB_ATTENDANCE",
    "audit": "MONGO_DB_AUDIT",
}


def get_db(alias: str):
    """Return a specific Mongo database handle by domain alias."""
    if alias not in DB_ALIAS_TO_CONFIG:
        raise ValueError(f"Unknown database alias: {alias}")
    db_name = current_app.config[DB_ALIAS_TO_CONFIG[alias]]
    return mongo.cx[db_name]


def get_collection(alias: str, collection_name: str):
    """Return a collection from a specific isolated database."""
    return get_db(alias)[collection_name]
