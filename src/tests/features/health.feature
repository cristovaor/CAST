Feature: API Health Check

  Scenario: Verify the API is running
    When I request the health check endpoint
    Then the response status code should be 200
    And the response should contain status "ok"
