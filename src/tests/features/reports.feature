Feature: Study Reports and Dashboards
  As a researcher
  I want to view metrics and export data for my studies
  So that I can analyze the results

  Scenario: Get dashboard metrics
    Given I am an authenticated user
    And a valid study ID
    When I request the dashboard metrics for the study
    Then the response status code should be 200
    And the response should contain the dashboard metrics
