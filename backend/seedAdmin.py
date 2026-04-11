"""Interactive admin seeding script.

Usage:
    python seedAdmin.py
"""

from getpass import getpass

from app import create_app
from app.models.user import create_user, find_user_by_email, get_users_by_role


def _prompt_non_empty(label):
    while True:
        value = input(label).strip()
        if value:
            return value
        print("Value cannot be empty. Please try again.")


def _prompt_email():
    while True:
        email = _prompt_non_empty("Admin email: ").lower()
        if "@" in email and "." in email.split("@")[-1]:
            return email
        print("Please enter a valid email address.")


def _prompt_password():
    while True:
        password = getpass("Admin password (min 8 chars, include 1 number): ")
        if len(password) < 8:
            print("Password must be at least 8 characters.")
            continue
        if not any(c.isdigit() for c in password):
            print("Password must include at least one number.")
            continue

        confirm = getpass("Confirm password: ")
        if password != confirm:
            print("Passwords do not match. Please try again.")
            continue
        return password


def main():
    # Disable built-in default admin seeding for this command.
    app = create_app(seed_default_admin=False)

    with app.app_context():
        existing_admins = get_users_by_role("admin")
        if existing_admins:
            print("An admin already exists. Seed cancelled to avoid duplicates.")
            return

        email = _prompt_email()
        if find_user_by_email(email):
            print("A user with this email already exists. Seed cancelled.")
            return

        password = _prompt_password()
        admin = create_user(
            name="System Admin",
            email=email,
            password=password,
            role="admin",
            department="Administration",
            must_change_password=False,
        )

        print(f"Admin created successfully: {admin['email']}")


if __name__ == "__main__":
    main()
