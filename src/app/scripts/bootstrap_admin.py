"""Create the first administrator, or invite one.

Invite-only access has a bootstrap problem: invitations can only be created by
an admin, and on a fresh database there is no admin. This script is the
out-of-band way in — it is run once, on the server, by someone with shell
access, and is the only path that creates a user without an invitation.

Two modes:

  # Federated admin: creates the organization and an invitation, then prints
  # the accept link. The admin signs in with Google and the account is created
  # on first login. No password ever exists.
  python -m app.scripts.bootstrap_admin --email you@example.com --name "Your Name"

  # Password admin: creates the account directly. Use only when Google login
  # is not configured.
  python -m app.scripts.bootstrap_admin --email you@example.com --name "Your Name" --password

Re-running is safe: an existing user is promoted to admin rather than
duplicated, and an existing pending invitation is reported instead of replaced.
"""

from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import func

from app.core import security
from app.db.models import Organization, User, UserRole
from app.db.session import SessionLocal
from app.services import invitations as invitation_service


def main() -> int:
    parser = argparse.ArgumentParser(description="Bootstrap the first CAST administrator.")
    parser.add_argument("--email", required=True, help="Administrator e-mail address.")
    parser.add_argument("--name", required=True, help="Administrator display name.")
    parser.add_argument(
        "--organization",
        default="CAST",
        help="Name of the organization to create or reuse (default: CAST).",
    )
    parser.add_argument(
        "--password",
        action="store_true",
        help="Create a password account instead of issuing a Google invitation.",
    )
    parser.add_argument(
        "--expires-hours",
        type=int,
        default=168,
        help="Validity of the generated invitation, in hours (default: 168).",
    )
    args = parser.parse_args()

    email = invitation_service.normalize_email(args.email)
    db = SessionLocal()
    try:
        organization = (
            db.query(Organization).filter(Organization.name == args.organization).first()
        )
        if organization is None:
            organization = Organization(name=args.organization)
            db.add(organization)
            db.flush()
            print(f"Created organization {args.organization!r}.")
        else:
            print(f"Reusing existing organization {args.organization!r}.")

        existing = db.query(User).filter(func.lower(User.email) == email).first()
        if existing is not None:
            if existing.role != UserRole.admin:
                existing.role = UserRole.admin
                db.commit()
                print(f"Existing user {email} promoted to admin.")
            else:
                print(f"User {email} already exists and is already an admin. Nothing to do.")
            return 0

        if args.password:
            password = getpass.getpass("Password for the new admin: ")
            confirmation = getpass.getpass("Confirm password: ")
            if not password or password != confirmation:
                print("Passwords do not match; aborting.", file=sys.stderr)
                return 1
            if len(password) < 12:
                print("Password must be at least 12 characters; aborting.", file=sys.stderr)
                return 1

            user = User(
                email=email,
                password_hash=security.get_password_hash(password),
                name=args.name,
                role=UserRole.admin,
                organization_id=organization.id,
            )
            db.add(user)
            db.commit()
            print(f"Admin {email} created. Sign in with e-mail and password.")
            return 0

        pending = invitation_service.find_pending_by_email(db, email)
        if pending is not None:
            print(
                f"A pending invitation for {email} already exists (expires "
                f"{pending.expires_at:%Y-%m-%d %H:%M} UTC). The original link cannot "
                "be reprinted — revoke it and re-run to issue a new one."
            )
            return 0

        _, token = invitation_service.create_invitation(
            db,
            email=email,
            organization_id=organization.id,
            role=UserRole.admin,
            invited_by=None,
            name=args.name,
            expires_hours=args.expires_hours,
        )
        db.commit()

        print()
        print(f"Admin invitation created for {email}.")
        print("Open this link and sign in with the matching Google account:")
        print()
        print(f"    {invitation_service.build_accept_url(token)}")
        print()
        print("This link is shown only once and can be used only once.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
