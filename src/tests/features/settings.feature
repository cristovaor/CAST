Feature: Organization Settings
  As an administrator
  I want to view and update settings
  So that I can customize the platform

  Scenario: Get organization settings
    Given I am an authenticated user
    When I request the organization settings
    Then the response status code should be 200
    And the response should contain the organization name

  Scenario: Update pipeline settings
    Given I am an authenticated user
    When I update the pipeline face detection threshold to 0.8
    Then the response status code should be 200
    And the response should reflect the new pipeline settings
