from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

def test_health_check(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    content = response.json()
    assert content["status"] in ["ok", "degraded"]
