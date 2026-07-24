Feature: Video Inference
  As a researcher
  I want to start an inference job on a video
  So that I can extract predictions and descriptors

  Scenario: Start an inference job
    Given I am an authenticated user
    And a valid participant ID
    And an uploaded video exists
    When I request to start inference on the video
    Then the response status code should be 202
    And the response should contain a job_id

  Scenario: Get inference job status
    Given I am an authenticated user
    And a valid participant ID
    And an uploaded video exists
    And an inference job has been started for the video
    When I request the status of the inference job
    Then the response status code should be 200
    And the response should contain the job status

  Scenario: Get video predictions
    Given I am an authenticated user
    And a valid participant ID
    And an uploaded video exists
    And an inference job has completed for the video
    When I request the predictions for the video
    Then the response status code should be 200
    And the response should contain prediction results

  Scenario: Get video descriptors
    Given I am an authenticated user
    And a valid participant ID
    And an uploaded video exists
    And an inference job has completed for the video
    When I request the descriptors for the video
    Then the response status code should be 200
    And the response should contain descriptor actions
