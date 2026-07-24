Feature: Processing Jobs
  As a researcher
  I want to monitor and control processing jobs
  So that I can manage long-running tasks

  Scenario: Get job status
    Given I am an authenticated user
    And I have an existing processing job
    When I request the status of the job
    Then the response status code should be 200
    And the response should contain the job status "queued"

  Scenario: Cancel a job
    Given I am an authenticated user
    And I have an existing processing job
    When I request to cancel the job
    Then the response status code should be 202
    And the response should confirm the cancellation
