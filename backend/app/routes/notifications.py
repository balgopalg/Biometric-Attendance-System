"""Notification inbox routes for authenticated users."""

import json

from app.models.user import find_user_by_email
from app.services.notification_service import (delete_notification,
                                               _notification_channel,
                                               _redis_client,
                                               list_notifications,
                                               mark_all_notifications_read,
                                               mark_notification_read)
from app.utils.validation import validate_object_id
from flask import Blueprint, Response, jsonify, request, stream_with_context
from flask_jwt_extended import get_jwt_identity, jwt_required

notifications_bp = Blueprint("notifications", __name__)


def _sse_payload(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _notification_stream(user_id):
    client = _redis_client()
    if client is None:
        yield _sse_payload(
            "error",
            {"error": "Realtime notifications are unavailable at the moment."},
        )
        return

    pubsub = None
    try:
        pubsub = client.pubsub(ignore_subscribe_messages=True)
        channel = _notification_channel(user_id)
        pubsub.subscribe(channel)

        yield ": connected\n\n"
        while True:
            try:
                message = pubsub.get_message(timeout=15)
            except Exception as e:
                # If Redis connection breaks during streaming, send error and close
                yield _sse_payload(
                    "error",
                    {"error": "Connection lost. Stream will be restarted.", "details": str(e)},
                )
                break

            if not message:
                yield ": keep-alive\n\n"
                continue

            if message.get("type") != "message":
                continue

            raw_payload = message.get("data")
            if isinstance(raw_payload, bytes):
                raw_payload = raw_payload.decode("utf-8", errors="ignore")

            try:
                payload = json.loads(raw_payload)
            except Exception:
                payload = {"type": "notification.created", "raw": raw_payload}

            yield _sse_payload("notification", payload)
    except Exception as e:
        # Handle subscription errors gracefully
        yield _sse_payload(
            "error",
            {"error": "Failed to subscribe to notifications", "details": str(e)},
        )
    finally:
        if pubsub:
            try:
                pubsub.close()
            except Exception:
                pass


@notifications_bp.route("", methods=["GET"])
@jwt_required()
def get_notifications():
    """Fetch the current user's notification inbox, ordered newest-first."""
    user = find_user_by_email(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    limit = request.args.get("limit", 20, type=int)
    return jsonify(list_notifications(user.get("_id"), limit=limit))


@notifications_bp.route("/stream", methods=["GET"])
@jwt_required()
def stream_notifications():
    """Stream notification events to the authenticated user's dashboard."""
    user = find_user_by_email(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    headers = {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return Response(
        stream_with_context(_notification_stream(user.get("_id"))),
        mimetype="text/event-stream",
        headers=headers,
    )


@notifications_bp.route("/<notification_id>/read", methods=["POST"])
@jwt_required()
def read_notification(notification_id):
    """Mark a single notification as read by its ID."""
    user = find_user_by_email(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    if not validate_object_id(notification_id):
        return jsonify({"error": "Invalid notification ID"}), 400

    if not mark_notification_read(user.get("_id"), notification_id):
        return jsonify({"error": "Notification not found"}), 404

    return jsonify({"message": "Notification marked as read"})


@notifications_bp.route("/read-all", methods=["POST"])
@jwt_required()
def read_all_notifications():
    """Mark all unread notifications as read for the current user."""
    user = find_user_by_email(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    updated = mark_all_notifications_read(user.get("_id"))
    return jsonify(
        {
            "message": "All notifications marked as read",
            "updated_count": updated,
        }
    )


@notifications_bp.route("/<notification_id>", methods=["DELETE"])
@jwt_required()
def remove_notification(notification_id):
    """Delete a single notification by its ID."""
    user = find_user_by_email(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    if not validate_object_id(notification_id):
        return jsonify({"error": "Invalid notification ID"}), 400

    if not delete_notification(user.get("_id"), notification_id):
        return (
            jsonify({"error": "Notification not found or already deleted"}),
            404,
        )

    return jsonify({"message": "Notification deleted successfully"})
