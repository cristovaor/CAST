Feature: Study Exports
  As a researcher
  I want to export study data
  So that I can analyze it externally

  Scenario: Create an export job
    Given I am an authenticated user
    And I have created a study with name "Export Target"
    When I request an export in "csv" format
    Then the response status code should be 202
    And the response should contain a job_id

  Scenario: Get export status
    Given I am an authenticated user
    And I have created a study with name "Export Target 2"
    And I have requested an export in "csv" format
    When I request the status of the export job
    Then the response status code should be 200
    And the response should contain the export status

  Scenario: Get export download URL
    Given I am an authenticated user
    And I have created a study with name "Export Target 3"
    And I have a completed export job
    When I request the download URL for the export
    Then the response status code should be 200
    And the response should contain a download URL
