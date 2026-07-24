Feature: Authentication

  Scenario: User can login with valid credentials
    Given a user exists with email "test@example.com" and password "secret123"
    When I attempt to login with email "test@example.com" and password "secret123"
    Then the response status code should be 200
    And the response should contain an access token

  Scenario: User cannot login with invalid credentials
    Given a user exists with email "test@example.com" and password "secret123"
    When I attempt to login with email "test@example.com" and password "wrongpassword"
    Then the response status code should be 400
