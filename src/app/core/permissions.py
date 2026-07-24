from fastapi import HTTPException, Depends, status
from functools import wraps
from typing import List, Callable

from app.db.models import User, UserRole
from app.api.deps import get_current_user

def require_roles(allowed_roles: List[UserRole]) -> Callable:
    """Dependency to check if the current user has one of the allowed roles."""
    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required roles: {[r.value for r in allowed_roles]}"
            )
        return current_user
    return role_checker

# Common role checkers
require_admin = require_roles([UserRole.admin])
require_researcher = require_roles([UserRole.admin, UserRole.researcher])
require_annotator = require_roles([UserRole.admin, UserRole.researcher, UserRole.annotator])
