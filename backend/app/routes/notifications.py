"""Notification inbox routes for authenticated users."""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.models.user import find_user_by_email
from app.utils.validation import validate_object_id
from app.services.notification_service import (
    list_notifications,
    mark_all_notifications_read,
    mark_notification_read,
    delete_notification,
)

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.route("", methods=["GET"])
@jwt_required()
def get_notifications():
    """Fetch the current user's notification inbox, ordered newest-first."""
    user = find_user_by_email(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    limit = request.args.get("limit", 20, type=int)
    return jsonify(list_notifications(user.get("_id"), limit=limit))


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
    return jsonify({"message": "All notifications marked as read", "updated_count": updated})


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
        return jsonify({"error": "Notification not found or already deleted"}), 404

    return jsonify({"message": "Notification deleted successfully"})
