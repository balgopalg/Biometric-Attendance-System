"""Small repository helpers for common MongoDB access patterns."""

from bson import ObjectId

from app.extensions import get_collection


def _normalize_object_ids(values):
    normalized = []
    seen = set()
    for value in values:
        if not value:
            continue
        try:
            oid = ObjectId(value)
        except Exception:
            continue
        if oid in seen:
            continue
        seen.add(oid)
        normalized.append(oid)
    return normalized


def find_many_by_ids(alias, collection_name, ids, projection=None):
    """Return documents keyed by stringified _id for the provided ids."""
    object_ids = _normalize_object_ids(ids)
    if not object_ids:
        return {}

    collection = get_collection(alias, collection_name)
    query = {"_id": {"$in": object_ids}}
    cursor = collection.find(query, projection) if projection else collection.find(query)
    return {str(doc["_id"]): doc for doc in cursor}


def count_documents(alias, collection_name, query=None):
    """Count documents in a collection with an optional query."""
    collection = get_collection(alias, collection_name)
    return int(collection.count_documents(query or {}))
