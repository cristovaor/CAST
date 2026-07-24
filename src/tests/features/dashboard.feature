Feature: Dashboard Metrics
  As an administrator
  I want to view global metrics
  So that I can monitor the system usage

  Scenario: Get global dashboard KPIs
    Given I am an authenticated user
    When I request the global dashboard
    Then the response status code should be 200
    And the response should contain dashboard KPIs
