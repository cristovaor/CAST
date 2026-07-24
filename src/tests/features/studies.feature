Feature: Studies Management
  As a researcher
  I want to manage studies and their bulk operations
  So that I can organize participants and infer data

  Scenario: Create and retrieve a study
    Given I am an authenticated user
    When I create a study with name "Clinical Trial 2026"
    Then the response status code should be 200
    And the response should contain the study name "Clinical Trial 2026"

  Scenario: List studies
    Given I am an authenticated user
    And I have created a study with name "Study 1"
    And I have created a study with name "Study 2"
    When I request the list of studies
    Then the response status code should be 200
    And the response should contain at least 2 studies

  Scenario: Update a study
    Given I am an authenticated user
    And I have created a study with name "Old Name"
    When I update the study name to "New Name"
    Then the response status code should be 200
    And the response should contain the study name "New Name"

  Scenario: Trigger batch inference
    Given I am an authenticated user
    And I have created a study with name "Batch Study"
    When I trigger batch inference for the study
    Then the response status code should be 200
    And the response should contain a message about started jobs

  Scenario: Export study data
    Given I am an authenticated user
    And I have created a study with name "Export Study"
    When I request to export the study data
    Then the response status code should be 200
    And the response should contain CSV content
